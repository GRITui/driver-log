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
