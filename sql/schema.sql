-- DriverLog × Neon — cloud sync + auth schema.
--
-- Replaces the PocketBase server entirely: this database is now the only
-- source of truth for accounts and cross-device sync of sessions/fuel logs.
-- `settings` deliberately has no table here — it stays device-local (see
-- SYNC_STORES in site/app.js), same as it did under PocketBase.
--
-- There is no migration runner in this project — this file is the source
-- of truth, applied by hand against the Neon database from its own SQL
-- console after connecting the integration in Vercel.

create extension if not exists pgcrypto;

create table if not exists users (
  id             uuid primary key default gen_random_uuid(),
  -- Null for LINE-only accounts (no password set). Case-folded lowercase by
  -- the API before insert/lookup, same as the client already does for
  -- local-only accounts.
  email          text unique,
  password_hash  text,
  password_salt  text,
  first_name     text not null default '',
  -- LINE's stable subject id (OIDC `sub`) — set only for accounts created
  -- or linked via "Log in with LINE". Unique so the same LINE identity
  -- always resolves back to the same account.
  line_sub       text unique,
  line_picture   text not null default '',
  -- FCM device token from the Android app's push-notifications plugin (see
  -- api/push-register.js). Null until the device registers; overwritten on
  -- every register call, so this always holds the most recent device/token
  -- pair, not a history. No sender is wired up yet — see that file's header.
  push_token     text,
  created_at     timestamptz not null default now()
);

-- One row per logged shift. Column names mirror the client's local record
-- shape (site/app.js's toServer()/fromServer()) so the API layer can map
-- 1:1 without renaming games.
create table if not exists driver_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  -- Stable client-generated id for dedupe across offline retries — see
  -- site/app.js's cuid(). One cuid can only ever map to one row per user.
  cuid          text not null,
  provider      text not null default '',
  service_type  text,
  date          text,
  end_date      text not null default '',
  start_time    text not null default '',
  end_time      text not null default '',
  distance      numeric,
  consumption   numeric,
  oil_price     numeric,
  exp           numeric,
  rev           numeric,
  tip           numeric,
  vehicle       text not null default '',
  net_rev       numeric,
  -- Per-trip breakdown (fare + timestamp) carried over from the shift timer's
  -- "+ Log trip" laps when a shift ends into this session — see
  -- site/app.js's endShift()/saveSession(). Empty for manually-logged
  -- sessions, which never had individual trips to begin with.
  trips         jsonb not null default '[]'::jsonb,
  deleted       boolean not null default false,
  updated_at    timestamptz not null default now(),
  unique (user_id, cuid)
);
create index if not exists idx_driver_sessions_user_updated on driver_sessions (user_id, updated_at);

create table if not exists fuel_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  cuid        text not null,
  station     text,
  liters      numeric,
  price       numeric,
  date        text,
  deleted     boolean not null default false,
  updated_at  timestamptz not null default now(),
  unique (user_id, cuid)
);
create index if not exists idx_fuel_logs_user_updated on fuel_logs (user_id, updated_at);

create table if not exists vehicle_maintenance (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  cuid            text not null,
  vehicle         text not null default '',
  service_type    text not null default '',
  cost            numeric,
  date            text,
  odometer_km     numeric,
  next_due_date   text,
  next_due_km     numeric,
  deleted         boolean not null default false,
  updated_at      timestamptz not null default now(),
  unique (user_id, cuid)
);
create index if not exists idx_vehicle_maintenance_user_updated on vehicle_maintenance (user_id, updated_at);

-- Fleet (B2B) tier: a fleet owner aggregates read-only stats across drivers
-- who have explicitly opted in. Drivers keep full ownership of their own
-- driver_sessions/fuel_logs rows — a fleet never writes to them, it only
-- reads sessions belonging to *active* members, scoped by date range.
create table if not exists fleets (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null references users(id) on delete cascade,
  name           text not null default '',
  created_at     timestamptz not null default now()
);

-- status: invited (owner sent, driver hasn't responded) -> active (driver
-- accepted, owner can see their stats) or declined (driver said no) ->
-- left (driver was active, then opted out). A driver can only ever be
-- re-invited into a fresh row after leaving/declining — see lib/fleets.js.
create table if not exists fleet_members (
  id              uuid primary key default gen_random_uuid(),
  fleet_id        uuid not null references fleets(id) on delete cascade,
  driver_user_id  uuid not null references users(id) on delete cascade,
  status          text not null default 'invited',
  invited_at      timestamptz not null default now(),
  joined_at       timestamptz,
  unique (fleet_id, driver_user_id)
);
create index if not exists idx_fleet_members_driver on fleet_members (driver_user_id, status);
create index if not exists idx_fleet_members_fleet on fleet_members (fleet_id, status);

-- ── Incremental changes (apply by hand against an ALREADY-provisioned
-- database — `create table if not exists` above is a no-op once the table
-- exists, so a new column on an existing table needs its own statement) ──
-- 2026-07-13: push_token for the Capacitor Android push-notifications shell.
alter table users add column if not exists push_token text;
-- 2026-07-14: fleets + fleet_members for the B2B fleet-owner dashboard.
-- 2026-07-16: fleets.plan for the fleet billing plan tier.
alter table fleets add column if not exists plan text not null default 'free';
-- 2026-07-16: fleets.seat_limit for the fleet billing seat cap.
alter table fleets add column if not exists seat_limit integer not null default 3;
-- 2026-07-19: driver_sessions.trips — per-trip breakdown carried over from
-- the shift timer, so the session detail page can show what made up the
-- revenue instead of just the aggregate total.
alter table driver_sessions add column if not exists trips jsonb not null default '[]'::jsonb;
