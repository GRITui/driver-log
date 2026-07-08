# DriverLog — Backlog

## Cloud login + cross-device sync (parked July 2026)

**Status:** Deferred. The app ships **local-only** — accounts + guest work fully
on-device (IndexedDB), PWA installs, offline works. No cross-device sync yet.

**Why parked:** self-hosting PocketBase on a home machine stalled on local tooling
(Docker Compose not available) and, more fundamentally, home/ISP networking that
likely blocks inbound 80/443. Not worth more time right now.

**Everything is already built and dormant** — re-enabling is small:
- Client: the `Sync`/`PBBackend` adapter + full offline sync engine (outbox,
  background sync, last-write-wins, cuid dedupe) are in `site/app.js` (the app now
  ships as split files — `index.html` is just a redirector to `app.html`/`login.html`,
  with logic in `app.js`), inert because `PB_URL` is empty.
- Backend bundle: `pocketbase/` (docker-compose + Caddy + `schema.pb.json`).
- DNS: `api.driverlog.link` A record still exists (→ 184.22.229.54). Harmless;
  repoint or delete when the backend gets a real home.

**To turn it on later (pick a reliable host first):**
1. Stand up PocketBase somewhere publicly reachable over HTTPS. Best options:
   - **Cloud VPS (~$5/mo)** — simplest, no NAT/ISP issues; runs the `pocketbase/`
     Docker stack as-is. **Recommended.**
   - **Cloudflare Tunnel** from the home machine — see `pocketbase/REVERSE-PROXY.md`
     (no open ports needed).
2. Import `pocketbase/schema.pb.json` (Admin UI → Import collections).
3. Set `PB_URL` in `site/app.js` to the API URL (or `localStorage.pb_url` to test),
   redeploy, and update the login copy (remove "coming soon").
4. Revert the auth hint text and set Sync-status expectations.

## Other future ideas (from HANDOFF)
- Play Store submission (P4 assets ready in `twa/` + `launch/`; needs $25 Google
  account + Play signing fingerprint in `assetlinks.json`).
- Push notifications (FCM), receipt camera capture, more languages.
  (Dark mode already shipped — see `docs/roadmap-agents.md` v2.6.)
