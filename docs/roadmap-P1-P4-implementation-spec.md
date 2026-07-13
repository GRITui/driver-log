# DriverLog — P1–P4 Implementation Spec

**Product:** DriverLog · [driverlog.link](https://driverlog.link) · Hosted on Vercel, DNS at Hostinger
**Current state:** Live at driverlog.link (single Vercel project serving `site/`+`info/`+`api/`; Neon-backed cloud sync/auth).
**Scope of this doc:** Detailed, buildable specs for roadmap items **P1–P4** — login + sync, PWA→TWA Android app, offline + background sync, and Play Store launch.
**Last updated:** July 2026

---

## How these four fit together

P1–P4 are not independent — they form one dependency chain. Build them in this order:

```
P2 (PWA foundation) ──► P3 (offline + background sync) ──► P4 (Play Store)
        ▲                        ▲
        └──── P1 (login + sync backend) ───┘
```

- **P2 is the true first step.** The service worker it adds is the same machinery P3's background sync and P4's TWA packaging both depend on. Nothing ships to the Play Store without it.
- **P1 (backend) is decoupled but foundational for P3.** Offline entry (P3) works with IndexedDB alone, but *background sync* — the "push my queued entries when signal returns" half of P3 — needs a server to push to. That server is P1.
- **P4 only wraps what already works.** Packaging is mechanical once P2/P3 produce a passing PWA.

Recommended sequencing: **P2 → P1 → P3 → P4.** (This differs slightly from the numeric order because the PWA shell must exist before a backend is worth wiring in.)

---

## Effort & risk snapshot

| Phase | Est. effort | Main risk | External cost |
|-------|-------------|-----------|---------------|
| P1 — Login + sync engine | 2–4 weeks | Data-migration + conflict correctness | $0 to start (free tier) |
| P2 — PWA foundation | 3–5 days | Service-worker cache invalidation bugs | $0 |
| P3 — Offline + background sync | 1–2 weeks | Conflict resolution, iOS Background Sync gap | $0 |
| P4 — Play Store packaging | 3–5 days work + review wait | Digital Asset Links mistakes; policy review | $25 one-time (Google Play) |

---

# P1 — Cross-platform login + sync engine

**Lead:** Backend / Sync Agent · **Support:** Security & Privacy, Mobile Engineer
**Goal:** A driver logs in on their phone and their laptop and sees the same data. Today each device is an island (local IndexedDB only).

## 1. The core decision — hosted backend

The current app hashes passwords client-side and stores everything in IndexedDB. That cannot sync across devices because there is no shared source of truth. P1 introduces a backend that owns identity and data. Two realistic options; the comparison below is the one you asked for.

### Supabase vs Firebase — side by side

| Dimension | **Supabase** | **Firebase (Firestore)** |
|-----------|--------------|--------------------------|
| Data model | Postgres (relational, SQL) — maps cleanly onto the existing `sessions`/`fuel`/`users` tables | Firestore (NoSQL documents/collections) — would restructure data into per-user document trees |
| Auth | Built-in email/password, magic link, OAuth; row-level security (RLS) enforces per-user isolation in the DB | Firebase Auth (email/password, phone, OAuth); isolation enforced via security rules |
| Free tier (current, 2026) | 500 MB DB, 1 GB file storage, 5 GB egress, **50,000 monthly active users**, 500K edge-function calls, 2 projects. Projects **pause after 1 week of inactivity** | 1 GB stored, **50,000 reads / 20,000 writes / 20,000 deletes per day**, no auto-pause |
| Pricing beyond free | Pro $25/mo flat + usage | Blaze pay-as-you-go (per read/write/storage) — cost scales with traffic, harder to predict |
| Realtime sync | Realtime subscriptions over websockets (Postgres change feed) | Native realtime listeners (Firestore's core strength) |
| Offline story | Client caches in IndexedDB (our code); Supabase JS has no built-in offline persistence | Firestore SDK has **built-in offline persistence** and auto-resync — less code for us |
| Push notifications (future P-android Phase 4) | Not built in — bring your own (e.g. FCM anyway) | **FCM included** — natural fit for shift reminders later |
| Fit with current code | Excellent — SQL rows ≈ current object stores; smallest mental jump | Good, but requires reshaping data + learning Firestore rules |
| Vendor lock-in | Low — it's Postgres; exportable/self-hostable | Higher — Firestore data model + rules are Google-specific |

### Recommendation

**Lead with Supabase**, for three reasons specific to DriverLog:

1. **The data is already relational.** `sessions`, `fuel`, `settings`, `users` are flat tables with a `uid` foreign key. That is a Postgres schema almost verbatim — minimal translation, and RLS (`uid = auth.uid()`) gives per-driver isolation for free.
2. **Predictable cost.** A free-then-$25-flat curve is easier to reason about for a product that must stay "free for drivers" (see P5 monetization) than Firebase's per-operation billing, where a runaway sync loop can generate a surprise bill.
3. **Low lock-in.** It's Postgres; if the fleet B2B tier (P8) later needs heavier analytics, the data is already in SQL and exportable.

**Where Firebase wins, and when to reconsider:** if push notifications and built-in offline persistence become the dominant requirements, Firebase's bundled FCM + Firestore offline SDK removes code you'd otherwise write. If the roadmap's P-android Phase 4 (push) gets pulled forward as a priority, re-evaluate.

**The one caveat to flag:** Supabase free projects pause after 7 days of inactivity. For a live product with daily drivers this won't trigger, but during early low-traffic beta, budget for the $25 Pro plan or a keep-alive ping so a paused DB doesn't look like an outage.

> Decision needed from you before P1 build starts: **Supabase (recommended) or Firebase.** Everything below is written against Supabase; the shapes carry over to Firebase with data-model changes noted inline.

## 2. Data model (Supabase / Postgres)

Mirror the existing IndexedDB stores as tables, adding sync bookkeeping columns.

```sql
-- users are managed by Supabase Auth (auth.users). App tables reference auth.uid().

create table sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  service_type text not null check (service_type in ('GrabCar','GrabFood','GrabBike','GrabExpress')),
  date         date not null,
  distance     numeric,        -- km
  consumption  numeric,        -- km/L
  oil_price    numeric,        -- THB/L
  exp          numeric,        -- fuel expense THB
  rev          numeric,        -- revenue THB
  tip          numeric,
  net_rev      numeric,
  updated_at   timestamptz not null default now(),
  deleted      boolean not null default false   -- soft delete for sync
);

create table fuel (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  station    text,
  liters     numeric,
  price      numeric,          -- total THB
  date       date not null,
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false
);

create table settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  key     text not null,       -- 'lang' | 'unit'
  value   text,
  primary key (user_id, key)
);

-- Row-level security: each driver sees only their own rows.
alter table sessions enable row level security;
create policy "own rows" on sessions
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- (repeat policy for fuel, settings)
```

**Key changes from the current schema:**
- IDs become UUIDs (not autoincrement ints) so an offline device can generate an ID that won't collide with the server — essential for P3.
- Every syncable table gains `updated_at` and `deleted` (soft-delete) — these are the primitives sync and conflict resolution run on.

## 3. Auth changes

Replace the client-side SHA-256 auth with Supabase Auth:
- Registration/login → `supabase.auth.signUp()` / `signInWithPassword()`. Supabase issues a JWT stored by the client SDK.
- Keep **Guest Mode** exactly as-is (local-only IndexedDB, no account). Add an **"upgrade guest → account"** path that, on first sign-up, pushes the guest's local rows to the server (one-time migration).
- Retire the local `users` store and `hashPassword()` — the server owns identity now. (Leave the code path behind a feature flag during rollout so existing local accounts can migrate.)

## 4. Sync engine

Client keeps IndexedDB as the local cache/working copy; the server is the source of truth. Sync is **last-write-wins on `updated_at`**, per row (simple, adequate for single-user-multi-device; see P3 for the conflict nuance).

Two directions:
- **Pull:** on login and on realtime event, fetch rows where `updated_at > last_pulled_at`, upsert into IndexedDB, apply soft-deletes.
- **Push:** covered in P3 (the offline queue is the push mechanism).

Use Supabase **Realtime** subscriptions so a change on the laptop appears on the phone within seconds when both are online.

## 5. Migration plan for existing users

Existing installs have local-only data and local accounts. On first launch of the sync-enabled version:
1. Detect local `users`/`sessions`/`fuel` with no `server_id`.
2. Prompt: "Back up your data across devices — create a free account." (Non-destructive; they can stay local.)
3. On account creation, batch-upload local rows (assigning UUIDs), mark them synced, then switch the app to server-backed mode.

## 6. Acceptance criteria (P1)

- [ ] A user can register/log in with email + password against Supabase.
- [ ] Data created on device A appears on device B after login/refresh (and within seconds via realtime when both online).
- [ ] RLS verified: user A cannot read user B's rows (test with two accounts).
- [ ] Guest mode still works with zero network.
- [ ] Existing local data migrates on opt-in without loss.
- [ ] No plaintext passwords anywhere; JWT stored by SDK, not hand-rolled.

---

# P2 — Android app: PWA foundation → TWA

**Lead:** Mobile Engineer Agent · **Support:** Backend/Sync, DevOps, UX/Design
**Goal:** Make the existing website installable and app-like. This is the foundation for P3 and P4 — do it first.

## 1. Web App Manifest (`manifest.json`)

Add to the site root and link from `<head>`:

```json
{
  "name": "DriverLog — Driver Log Book",
  "short_name": "DriverLog",
  "description": "Track earnings, fuel, and driving insights. Free, offline-first.",
  "start_url": "/?source=pwa",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#FDECEA",
  "theme_color": "#D0021B",
  "lang": "th",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

```html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#D0021B">
```

- Icons: 192px + 512px are mandatory; add a **maskable** 512px so the Android launcher icon isn't letterboxed. Match the existing red brand (`--red: #D0021B`).
- `display: standalone` removes browser chrome. `start_url` with a query param lets analytics distinguish app opens.

## 2. Service Worker (`sw.js`)

The service worker is the single most important addition — it's shared infrastructure for offline (P3) and TWA (P4). Register it:

```js
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('/sw.js'));
}
```

Minimum viable strategy — **app-shell precache + runtime cache**:

```js
const SHELL = 'driverlog-shell-v1';
const ASSETS = [
  '/', '/index.html', '/manifest.json',
  '/icons/icon-192.png', '/icons/icon-512.png',
  // Chart.js + html2canvas: self-host or cache the CDN responses
];

self.addEventListener('install', e =>
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())));

self.addEventListener('activate', e =>
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener('fetch', e => {
  // App shell: cache-first. API calls to Supabase: network-first (handled in P3).
  if (e.request.mode === 'navigate') {
    e.respondWith(caches.match('/index.html').then(r => r || fetch(e.request)));
  } else {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});
```

**Watch-outs:**
- **Cache invalidation is the classic bug.** Bump `driverlog-shell-vN` on every deploy or users get stale HTML forever. Consider a build step that hashes the version. Since the app is a single hand-edited HTML file today, a tiny version constant + the `activate` cleanup above is enough.
- **Third-party CDNs** (Chart.js, html2canvas) won't cache reliably cross-origin without proper CORS. Prefer self-hosting those two files so offline truly works.

## 3. HTTPS

TWA and service workers **require** HTTPS. Vercel issues and renews HTTPS certs automatically for custom domains (driverlog.link, info.driverlog.link) — confirm both show a valid cert in the Vercel dashboard's Domains tab and that http→https redirect is on.

## 4. Install prompt (custom)

Capture `beforeinstallprompt` to show a branded "Install app" button instead of relying on the browser's default:

```js
let deferredPrompt;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredPrompt = e;
  showInstallButton();  // reveal your own button in Settings/header
});
// on button click: deferredPrompt.prompt();
```

## 5. Verify with Lighthouse

Run Chrome DevTools → Lighthouse → "Progressive Web App" category. Target: all PWA checks pass — installable, valid manifest, registered service worker, HTTPS, correct icons. This green check is the gate to P4 (PWABuilder/Bubblewrap read the same signals).

## 6. Acceptance criteria (P2)

- [ ] "Add to Home Screen" appears in mobile Chrome; app opens full-screen (no address bar).
- [ ] Manifest valid; launcher icon is crisp and maskable-safe.
- [ ] Service worker registered; app shell opens with network disabled.
- [ ] Lighthouse PWA checks all pass.
- [ ] Chart.js and html2canvas load offline (self-hosted).

---

# P3 — Offline entry + background sync

**Lead:** Backend / Sync Agent · **Support:** Mobile Engineer, QA/Testing
**Goal:** A driver logs a session mid-shift with no signal; it saves instantly and syncs itself when signal returns — with a visible, trustworthy status.

## 1. Offline-first write path

The app already stores in IndexedDB, so *local* offline entry mostly works today. P3 makes writes **sync-aware**:

- Every create/update/delete writes to IndexedDB immediately (instant UX, no spinner) **and** enqueues a sync operation in an `outbox` store:

```
outbox: { id, op: 'upsert'|'delete', table: 'sessions'|'fuel'|'settings',
          payload, createdAt, tries }
```

- Client generates the row's **UUID locally** (from P1's schema) so the same ID is used offline and on the server — no "temp id → real id" reconciliation.

## 2. Background Sync API

Register a sync tag when an entry is queued; the service worker drains the outbox when connectivity returns — even if the app has been closed:

```js
// in the page, after enqueueing:
const reg = await navigator.serviceWorker.ready;
await reg.sync.register('drain-outbox');

// in sw.js:
self.addEventListener('sync', e => {
  if (e.tag === 'drain-outbox') e.waitUntil(drainOutbox());
});
// drainOutbox(): read outbox from IndexedDB, POST each to Supabase,
// on success remove from outbox; on failure leave it (tries++) for next sync.
```

**Fallback (important):** Background Sync is Chromium-only. On unsupported browsers (notably iOS Safari), fall back to draining the outbox on: app foreground (`visibilitychange`), and `online` events. Since the roadmap is **Android-first**, Background Sync covers the primary target; the fallback keeps iOS correct if slower.

## 3. Conflict resolution

Same driver editing the same row on two devices is rare but must not lose data:

- **Default: last-write-wins on `updated_at`.** Server compares incoming `updated_at` to stored; newer wins. Simple and correct for the common case (one person, one active device at a time).
- **Deletes:** soft-delete (`deleted = true`) rather than hard-delete, so a delete on device A propagates instead of being "resurrected" by a stale device B still holding the row.
- **Guard against clock skew:** stamp `updated_at` server-side on write where possible; use client time only for offline-created rows, and reconcile on push.

## 4. Sync-status UI (the trust layer)

Drivers won't trust an app that silently eats entries. Show state explicitly:

- Per-entry badge: **⬤ Saved locally** (queued) → **✓ Synced** (confirmed by server).
- Global indicator in the header: "All changes synced" / "3 changes waiting for signal" / "Syncing…".
- Cache the last-known dashboard so numbers render **instantly** on cold open, before any network.

## 5. Acceptance criteria (P3)

- [ ] Airplane-mode: create/edit/delete a session → saves instantly, shows "Saved locally."
- [ ] Restore signal → entries push automatically; badges flip to "Synced" without user action (Android/Chrome via Background Sync).
- [ ] iOS/Safari: entries drain on next foreground or `online` event.
- [ ] Edit same row on two devices → newer edit wins, no data loss, delete propagates.
- [ ] Dashboard shows cached numbers immediately on offline cold-start.
- [ ] Outbox survives app kill and device restart.

---

# P4 — Play Store packaging + launch

**Lead:** DevOps / Deployment Agent · **Support:** Mobile Engineer, UX/Design
**Goal:** DriverLog downloadable from Google Play, full-screen, no browser chrome. This wraps the PWA from P2/P3 — no app logic is rewritten.

## 1. Generate the TWA package

Two tools; pick one:

- **PWABuilder** (packaging.pwabuilder.com) — web UI, easiest. Paste driverlog.link, it validates the manifest/service worker and generates a signed Android App Bundle (`.aab`). Recommended for the first release.
- **Bubblewrap** (Google's CLI) — `npm i -g @bubblewrap/cli`, then `bubblewrap init --manifest https://driverlog.link/manifest.json` and `bubblewrap build`. More control, scriptable for repeat builds — good once you're releasing regularly.

Both produce a TWA: an Android shell that renders driverlog.link full-screen using Chrome under the hood.

## 2. Digital Asset Links (the step people get wrong)

To drop the browser address bar, Android must verify you own the domain. This is a two-way handshake:

1. The generated app embeds your Play signing key's SHA-256 fingerprint.
2. You host `/.well-known/assetlinks.json` at the domain root (on Hostinger for driverlog.link):

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "link.driverlog.twa",
    "sha256_cert_fingerprints": ["<SHA-256 from Play App Signing>"]
  }
}]
```

**Gotcha:** the fingerprint must be the one from **Google Play App Signing** (Play re-signs your bundle), not your local upload key. Get it from Play Console → App integrity after first upload, then update `assetlinks.json`. If this mismatches, the app launches with an ugly browser bar. Verify with the Digital Asset Links tester before launch.

## 3. Google Play Developer account & submission

- Create a **Google Play Developer account** — **$25 one-time** fee.
- Upload the signed `.aab`. Enroll in Play App Signing (default).
- Complete required listing sections:
  - **App icon** (512×512), **feature graphic** (1024×500).
  - **Screenshots** — at least 2 phone screenshots (dashboard, session logging). Capture in standalone mode so there's no browser chrome.
  - **Short + full description** (bilingual TH/EN recommended given the audience).
  - **Content rating** questionnaire.
  - **Data safety form** — declare what data is collected (with P1 sync: email + the driver's earnings/fuel entries) and how it's protected. Be accurate; this is reviewed.
  - **Privacy policy URL** — **required**. Host a privacy policy page on driverlog.link covering what's stored, where (Supabase), and that drivers can export/delete. (Ties to the Security & Privacy "trust moat.")

## 4. Release track strategy

- Start on **Internal testing** (instant, up to 100 testers) → validate the TWA on real devices.
- Promote to **Closed testing** for a small driver group (soft launch, per P-android Phase 5).
- Then **Production**. First production review can take from hours to several days.

## 5. Pre-launch checklist

- [ ] Lighthouse PWA fully passing (P2 gate).
- [ ] Offline + background sync verified on real Android hardware (P3).
- [ ] `.aab` generated and signed via PWABuilder/Bubblewrap.
- [ ] `assetlinks.json` live at driverlog.link root, fingerprint matches Play signing key, address bar gone.
- [ ] Store listing complete: icon, feature graphic, ≥2 screenshots, TH/EN descriptions.
- [ ] Privacy policy page live and linked.
- [ ] Data safety + content rating forms submitted accurately.
- [ ] Tested via Internal testing track on ≥2 physical devices / screen sizes.

## 6. Acceptance criteria (P4)

- [ ] App installs from Play (internal track) and opens full-screen with **no browser address bar**.
- [ ] Icon/splash match brand.
- [ ] Passes Play review to at least closed testing.
- [ ] Updating the website updates the app (no re-submission needed for content changes).

---

## Cross-phase dependency summary

| To ship… | You must have finished… |
|----------|-------------------------|
| P3 background sync (push) | P1 backend + P2 service worker |
| P4 TWA, no address bar | P2 passing PWA + Digital Asset Links |
| P4 data safety form | P1 (know what data leaves the device) |
| P3 conflict resolution | P1 schema (`updated_at`, `deleted`, UUIDs) |

## What needs a decision or external action from you

1. **Backend choice — Supabase (recommended) vs Firebase.** Blocks P1 build. (Comparison above.)
2. **Google Play Developer account** — $25 one-time, your identity/payment. Blocks P4 submission.
3. **Privacy policy content** — I can draft it; you approve. Blocks P4.
4. **Confirm Hostinger SSL** is active/enforced on driverlog.link. Blocks P2/P4.

---

*Companion to roadmap-agents.md and roadmap-android.md. Specs are implementation-ready; code snippets are starting points, not drop-in final code.*
