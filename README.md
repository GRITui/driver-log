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
3. `npx cap open android` (needs Android Studio) or `cd android && ./gradlew assembleDebug` for a local `.apk`. For a **signed** `.aab` to upload to Play Console, use the CI workflow below instead of `./gradlew bundleRelease` locally — it's the same command, but keeps the signing key out of your local shell history/machine.
4. First real icon/splash pass: `npx @capacitor/assets generate --android` (needs source art — see `@capacitor/assets` docs). This failed to install in the sandboxed dev environment (needs a `sharp` binary from a GitHub release the sandbox proxy blocks) — run it locally instead.

### CI-signed release builds (`.github/workflows/android-release.yml`)

Manually triggered (Actions tab → "Android release build" → Run workflow, giving a
`versionName`/`versionCode`) — never runs on a routine push, since it produces a
real, Play-Console-versioned artifact. Builds a signed `.aab` and uploads it as
a workflow artifact (download it from the run's summary page); does **not**
auto-publish to Play Console — that's a separate, even more sensitive
credential (a Play Console API service account) not set up here yet.

**One-time setup — generate the release keystore yourself, on your own
machine.** This key is what proves every future app update really came from
you; Play Console permanently binds an app to it once you publish. Losing it
means you can never update the app again under that listing; leaking it means
anyone who has it can publish updates as you. Neither this repo nor any AI
agent should ever hold the raw keystore file — only the four secrets below,
in GitHub's encrypted secret store.

1. Generate it locally:
   ```bash
   keytool -genkeypair -v -keystore driverlog-release.keystore \
     -alias driverlog -keyalg RSA -keysize 2048 -validity 10000
   ```
   Pick a strong store password and key password when prompted — write them
   down somewhere durable (a password manager), not just in your head.
2. **Back up `driverlog-release.keystore` somewhere safe and durable** (password
   manager, encrypted backup) before doing anything else with it.
3. Base64-encode it and add these four repo secrets (Settings → Secrets and
   variables → Actions → New repository secret):
   ```bash
   base64 -i driverlog-release.keystore | pbcopy   # macOS; use base64 -w0 on Linux
   ```
   - `ANDROID_KEYSTORE_BASE64` — the base64 output from above
   - `ANDROID_KEYSTORE_PASSWORD` — the store password you set
   - `ANDROID_KEY_ALIAS` — `driverlog` (or whatever you passed to `-alias`)
   - `ANDROID_KEY_PASSWORD` — the key password you set
4. Delete `driverlog-release.keystore` from wherever you generated it once
   it's backed up somewhere durable and the secrets are set — it doesn't need
   to sit around unencrypted.

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
