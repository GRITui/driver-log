# DriverLog — Backlog

Last reconciled against the codebase: 15 Jul 2026. This file previously described cloud
sync as "parked" behind a self-hosted PocketBase server — that was true in early July
2026 but is no longer accurate; PocketBase was dropped entirely and replaced with a
Neon-backed API in this same project (`lib/db.js`, `lib/auth.js`, `api/auth-*.js`,
`api/records-*.js`, `sql/schema.sql`). Update this file alongside any future feature
work instead of letting it drift again.

## Shipped (for reference — not backlog)
- Cloud sync + auth (email/password, LINE login) on Neon, same-origin `api/` — no
  PocketBase, no separate host.
- Shift timer (start shift → log trips → end shift into a normal session), local-only.
- Dashboard "Avg revenue / trip" stat.
- Fleet (B2B) tier core: create a fleet, invite/accept/decline/leave, owner console at
  `site/fleet.html` with aggregated revenue/net/trips/km-per-L across active drivers.
- Capacitor Android shell (remote mode) + a CI-signed release-build GitHub Actions
  workflow (`android-release.yml`) — see "Android / Play Store" below for what's still
  outstanding before this produces a real build.

## Open PRs
- **#32 — "Buy me a coffee" donation link** (replaces the old static "Fuel card
  partner — coming soon" placeholder). Open, rebased clean on top of the fleet-tier
  merge, ready to merge.

## Deferred follow-up slices
- **Maintenance-log CRUD** (`vehicle_maintenance` table + API + driver-side logging
  UI). Scoped out of the fleet-core PR (#33) on purpose. The fleet dashboard concept
  sketch includes an "Upcoming maintenance" panel with no data behind it yet.
- **Fleet billing** — creating/joining a fleet is currently free and ungated. The
  original concept assumed a seat-based paid tier for fleet owners; that payment layer
  was never built. Decide before fleet adoption grows past a few pilot users.

## Android / Play Store
- **First real CI-signed build has never been run.** The workflow exists but needs a
  one-time local keystore (`keytool -genkeypair`, see README's "CI-signed release
  builds" section) + 4 GitHub encrypted secrets before `workflow_dispatch` produces a
  real signed `.aab`. Don't assume it works until it's actually been triggered once.
- Google Play Developer account ($25) not yet created.
- Real app icon/splash art — still placeholder.
- Play Console listing (store copy, screenshots, content rating, `assetlinks.json`
  signing fingerprint) not started.

## Monetization / growth
- AdSense review/approval for `driverlog.link` not yet submitted (ad unit + Consent
  Mode v2 are wired up and ready — see `docs/MONETIZATION.md`, itself due for a pass
  since it still lists "affiliate placement" as unbuilt when the donation link
  superseded that idea, and lists fleet B2B as a future lever when it's now live).
- No soft launch to real drivers yet — nothing here has been validated against actual
  usage.

## Known issues / technical debt
- `api/auth-me` was observed returning HTTP 500 earlier in development (most likely a
  missing `AUTH_TOKEN_SECRET` or `DATABASE_URL` on the Vercel project) — never
  rechecked or confirmed fixed.
- Stray branch `chore/redirect-smoke-30` on GitHub (a one-off diagnostic branch, no
  open PR, safe to delete) — couldn't be deleted from the agent sandbox (git remote
  returned 403 on `push --delete`); delete manually when convenient.
- `docs/roadmap-next.md`, `docs/roadmap-agents.md`, and `docs/HANDOFF.md` are dated
  planning snapshots (early July 2026) that predate most of what's now shipped —
  useful as history, not as a current source of truth. This file (`BACKLOG.md`) is the
  one meant to stay current.
