# driver-log
easy log for driver

## LINE Login setup

"Log in with LINE" (`login.html`'s LINE button, `PBBackend.authWithLine()` in
`app.js`) only works once cloud sync is on (`localStorage.pb_url` set) and a
LINE OIDC provider is configured on the PocketBase server — this repo has no
server-side code of its own for it, since the PocketBase JS SDK's
`authWithOAuth2()` already handles the whole popup/redirect/token-exchange
flow against whatever server `pb_url` points at.

1. **LINE Developers Console** — create a channel of type **LINE Login**
   (not Messaging API). Under that channel's "LINE Login" tab, add a
   callback URL: `https://<your-pocketbase-domain>/api/oauth2-redirect`.
   Note the Channel ID and Channel secret from "Basic settings".
2. **PocketBase admin dashboard** — open the `users` collection → the gear
   icon → **Options** → **OAuth2** → **Add provider** → choose **OIDC**, and
   fill in:
   - Client ID / Client Secret: the LINE Login channel's values from step 1
   - Auth URL: `https://access.line.me/oauth2/v2.1/authorize`
   - Token URL: `https://api.line.me/oauth2/v2.1/token`
   - User info URL: `https://api.line.me/oauth2/v2.1/userinfo`

   Save. PocketBase names this provider `oidc` by default, which is what
   `authWithLine()` requests — if you configure LINE as a *second* custom
   OIDC provider alongside another one, update the `provider` name passed to
   `authWithOAuth2()` in `app.js` to match (PocketBase supports `oidc`,
   `oidc2`, `oidc3`, ...).
3. LINE doesn't always return a verified email; PocketBase fills in a
   synthetic placeholder in that case. The app already prefers the LINE
   profile's display name (`Sync.name()`) over email for anything shown to
   the driver, so this doesn't surface anywhere visible.
