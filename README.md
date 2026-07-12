# driver-log
easy log for driver

## Cloud backend setup (Vercel + Neon)

`site/` is the deployed static app (Hostinger + a Netlify mirror; no build
step, no secrets of its own). Cloud sync/auth — email+password accounts,
"Log in with LINE", and cross-device sync of sessions/fuel — runs against
this repo's own `api/` serverless functions, deployed separately as a
Vercel project, backed by a Neon Postgres database. PocketBase is not used
anywhere in this project anymore.

1. **Create the Vercel project** from this repo. `vercel.json`'s
   `outputDirectory: "site"` is only relevant if you also serve the static
   app from the same Vercel project — most deployments just need `api/` and
   `lib/` here, since `site/` is already deployed to Hostinger separately.
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
   `LINE_LOGIN_CALLBACK_URL` exactly:
   `https://<your-vercel-project>.vercel.app/api/line-login-callback`.
   Note the Channel ID / Channel secret from "Basic settings".
6. **Point the app at the API** — on each device/browser, or via a config
   step you add to the app,
   set `localStorage.api_url = 'https://<your-vercel-project>.vercel.app'`.
   Cloud sync and "Log in with LINE" both stay off (local-only + guest mode)
   until this is set, same as the old `pb_url` behaved.

### Why no server-side session store

Auth tokens (`lib/auth.js`) and the LINE OAuth `state` round-trip
(`lib/lineLogin.js`) are both self-contained, HMAC-signed, self-expiring
blobs — nothing is looked up from a server-side sessions table. Losing or
rotating `AUTH_TOKEN_SECRET` (or `LINE_LOGIN_STATE_SECRET`) invalidates
every issued token/in-flight login at once; that's the deliberate
trade-off for not needing a revocation list.
