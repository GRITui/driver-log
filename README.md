# driver-log
easy log for driver

## Cloud backend setup (Vercel + Neon)

One Vercel project serves everything: `site/` (driverlog.link), `info/`
(info.driverlog.link), and this repo's own `api/` serverless functions
(both domains' `/api/*`), backed by a Neon Postgres database — see
`vercel.json`'s host-based rewrites. Hostinger's only remaining job is DNS
(both domains point at Vercel; no FTP hosting, no Netlify mirror).
PocketBase is not used anywhere in this project anymore.

**Workflow:** changes are built on a branch, opened as a PR against `main`,
and reviewed. Once a PR is approved and merged, Vercel deploys `main`
automatically — there is no manual/local deploy step anymore.

1. **Create the Vercel project** from this repo (root directory = repo
   root, not `site/`) and connect it to GitHub so pushes to `main` deploy
   automatically. Add `driverlog.link` and `info.driverlog.link` as custom
   domains on the project.
2. **Connect Neon** — Vercel dashboard → the project → **Storage** →
   **Connect Database** → Neon. This auto-provisions `DATABASE_URL`; don't
   set it by hand (`lib/db.js` reads exactly that name).
3. **Apply the schema** — open the Neon dashboard's **SQL Editor** and run
   `sql/schema.sql` once, by hand. There's no migration runner in this
   project; that file is the source of truth going forward.
4. **Set the remaining env vars** (Vercel dashboard → **Settings** →
   **Environment Variables**) — see `.env.example` for the full list and
   what each one is for: `AUTH_TOKEN_SECRET` (this project's own session
   tokens) plus, if you want "Log in with LINE" enabled,
   `LINE_LOGIN_CHANNEL_ID` / `LINE_LOGIN_CHANNEL_SECRET` /
   `LINE_LOGIN_CALLBACK_URL` / `LINE_LOGIN_STATE_SECRET`.
5. **LINE Developers Console** (only needed for LINE login) — create a
   channel of type **LINE Login** (not Messaging API). Under that channel's
   "LINE Login" tab, add a callback URL matching
   `LINE_LOGIN_CALLBACK_URL` exactly: `https://driverlog.link/api/line-login-callback`.
   Note the Channel ID / Channel secret from "Basic settings".

Nothing device-side to configure: `site/`'s `API_URL` defaults to
same-origin, so cloud sync and "Log in with LINE" work as soon as the
project above is deployed with its env vars set — `localStorage.api_url`
only needs setting to point a device at a *different* API host (e.g. local
dev).

### Why no server-side session store

Auth tokens (`lib/auth.js`) and the LINE OAuth `state` round-trip
(`lib/lineLogin.js`) are both self-contained, HMAC-signed, self-expiring
blobs — nothing is looked up from a server-side sessions table. Losing or
rotating `AUTH_TOKEN_SECRET` (or `LINE_LOGIN_STATE_SECRET`) invalidates
every issued token/in-flight login at once; that's the deliberate
trade-off for not needing a revocation list.

## Android app (Capacitor)

`android/` is a Capacitor-wrapped native shell around the live site — **not**
a bundled snapshot. `capacitor.config.json` sets `server.url` to
`https://driverlog.link`, so the installed app always shows whatever is
currently deployed; redeploying the website updates the app instantly, same
as the web. The native shell only needs rebuilding for things that aren't
web content: icons/splash, plugin config, or a version bump for the Play
Store.

This repo has no Android SDK, so the actual build has to run on your
machine:

1. `npm install` (installs `@capacitor/*` alongside the existing `api/` deps).
2. `npx cap sync android` — pulls in any plugin/config changes.
3. `npx cap open android` (needs Android Studio) or `cd android && ./gradlew assembleDebug` for a local `.apk`, or `./gradlew bundleRelease` for a signed `.aab` to upload to Play Console.
4. First real icon/splash pass: `npx @capacitor/assets generate --android` (needs source art — see `@capacitor/assets` docs). This failed to install in the sandboxed dev environment (needs a `sharp` binary from a GitHub release the sandbox proxy blocks) — run it locally instead.

**Push notifications** (`@capacitor/push-notifications`) are scaffolded but
dormant: the client registers for a token and posts it to
`api/push-register.js` (stored on `users.push_token`), but nothing sends a
push yet. To turn it on: create a Firebase project, drop
`google-services.json` into `android/app/`, and add a `send-push` endpoint
using an FCM server key (not built yet).

**Geolocation** (`@capacitor/geolocation`) is scaffolded (`getCurrentPositionNative()`
in `site/app.js`) but not wired into any UI — reserved for a future
trip-mileage feature.

The previous TWA/Bubblewrap packaging plan (thin Chrome-shell wrapper, no
native plugins) is retired — see `archive/retired-twa-bubblewrap-20260713/`.
