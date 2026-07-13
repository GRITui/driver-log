# DriverLog — PocketBase backend (login + sync)

This is the sync/login backend for DriverLog. It runs as a single Docker container
(SQLite under the hood) and the web app talks to it over its REST API.

> **Firebase later:** the web app talks to a swappable `Sync` adapter (`PBBackend`
> in `index.html`). When revenue justifies it, add a `FirebaseBackend` implementing
> the same methods and point `const Sync = ...` at it — no rewrite of the app logic.

## 1. Run it

Needs a host with Docker (a small VPS — Hostinger VPS, Fly.io, Railway, a $5 droplet).
It **cannot** run on Netlify/static Hostinger shared hosting.

```bash
cd pocketbase
cp .env.example .env        # set a strong PB_ADMIN_PASSWORD
docker compose up -d
```

- Admin UI: `http://YOUR_HOST:8090/_/`  → log in with `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD`.
- Health check: `http://YOUR_HOST:8090/api/health`.

## 2. Create the collections (one time)

Admin UI → **Settings → Import collections** → **Load from JSON** → paste the contents
of `schema.pb.json` → **Review** → **Import**.

This creates two collections — `sessions` and `fuel` — each:
- owned per-user (API rules restrict every row to `user = @request.auth.id`),
- with a unique `cuid` index (offline-created records dedupe cleanly on sync),
- carrying `updatedAt` + `deleted` for last-write-wins sync and soft deletes.

The built-in **users** auth collection already handles email/password signup — no changes needed.
(Optional: Admin UI → users collection → Options → turn **off** "email verification required"
for the smoothest driver signup, or leave on if you want verified emails.)

## 3. Point the app at this server

In the deployed web app, set the backend URL once (per browser it's read from
`localStorage.pb_url`). Easiest: serve the app and run in the browser console, or
add a tiny config. In `index.html`:

```js
const PB_URL = localStorage.getItem('pb_url') || 'https://api.driverlog.link';
```

Change the fallback to your PocketBase URL (behind HTTPS — put it on a subdomain like
`api.driverlog.link` with a TLS cert / reverse proxy). If `PB_URL` is empty, the app
runs in **local-only** mode (accounts + guest still work, just no cross-device sync).

## 4. HTTPS

Browsers require HTTPS for the app (service worker/TWA). Put PocketBase behind a
reverse proxy with TLS (Caddy/Nginx/Traefik) or use a platform that terminates TLS.
PocketBase can also serve TLS directly via `--https` if you manage certs.

## Files
- `docker-compose.yml` — the container + persistent volumes.
- `schema.pb.json` — importable `sessions` + `fuel` collections with per-user rules.
- `.env.example` — copy to `.env`, set the admin password.
