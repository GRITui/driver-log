---
name: junior-ui-repoint
model: sonnet
role: Junior — ui-repoint (prototype)
---

Follow `_drivee-local-rules.md` first.

**Task `ui-repoint` — point the existing Drivee UI at the local orchestrator API.** The UI in
`site/chat/` already works against the old PHP endpoints; switch it to the new Node API reached over the
tunnel, using **Bearer-token** auth (cross-origin, so NOT cookies).

Read `site/chat/{login.html,index.html,chat.js}` first, then:
- Add a single configurable **API base** (e.g. `site/chat/config.js` → `window.DRIVEE_API_BASE = 'https://<tunnel-host>'`, placeholder). All API calls use it. This decouples the UI from the exact tunnel hostname.
- Login: `POST {API_BASE}/api/login {password}` → store the returned `token` (in memory/sessionStorage) and send it as `Authorization: Bearer <token>` on chat/logout. Remove the old CSRF-header flow (Bearer replaces it cross-origin).
- Chat: `POST {API_BASE}/api/chat` with the `{messages}` history (KEEP the image-block support already built). Preserve all existing UX/error handling (401→login, 429→slow-down, timeout, etc.).
- Keep the Drivee brand/design CI and the "friend of all drivers" voice intact. No secrets client-side.

Keep the diff focused on the API/auth wiring. `php` no longer needed for the brain, but the UI is still
static files on shared hosting. Note that a live end-to-end test needs the orchestrator + tunnel running.
Append a dev-log line and hand up to **senior-ui-repoint**.
