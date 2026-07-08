# Drivee — Phase 2 deploy (public `driverlog.link/chat`, Cloudflare-free)

Goal: the branded URL **https://driverlog.link/chat** serves the Drivee UI (static, on Hostinger via
the `hostinger-hosting` MCP) and talks to the **local orchestrator on your Mac** exposed through a
**non-Cloudflare tunnel** (ngrok static domain, or Tailscale Funnel).

```
Browser → https://driverlog.link/chat        (static UI, Hostinger shared hosting)
        → API base = https://<your>.ngrok-free.app   (tunnel)
        → your Mac: orchestrator :8787 → Phi-4-mini / opt-in ask_claude (sandboxed)
```

## ⚠️ Security acknowledgement (read first)
This exposes a **code-executing service** (the orchestrator runs the `claude` CLI) to the public
internet. Perimeter = the **GRIT login** (bcrypt + brute-force lockout + rate limit) and the
**`ask_claude` sandbox** (advisor-security PASS: `--permission-mode dontAsk`, locked tool allowlist,
no `--dangerously-skip-permissions`, per-request isolated image workdir). Still: **rotate the GRIT
password** (the one shared in chat is compromised), and consider only running the tunnel when you need
it. If you're not comfortable exposing it, use Phase 1 (local only) or the tunnel URL privately.

## Steps

### 1. Keep the orchestrator running persistently (independent of any Claude session)
In your own terminal (not inside Claude — Claude-started processes die when the session ends):
```bash
cd "/Users/grit/Claude/Projects/Driver Log/drivee-orchestrator"
npm start            # serves :8787 (127.0.0.1)
```
(Or install the launchd keep-alive from `drivee-orchestrator/keepalive/` when the tunnel-deploy agents produce it.)

### 2. Tunnel with a STABLE url (ngrok recommended)
```bash
brew install ngrok                      # you run this (it's the public-exposure step)
# sign up free at https://dashboard.ngrok.com , copy your authtoken:
ngrok config add-authtoken <YOUR_TOKEN>
# claim your ONE free static domain in the dashboard (Domains → New), e.g. drivee-grit.ngrok-free.app
ngrok http --domain=<your-static>.ngrok-free.app 8787   # leave running in its own terminal
```
The static domain keeps the URL stable across restarts, so `config.js` never needs re-editing.
*(Alternative: `brew install tailscale && tailscale up && tailscale funnel 8787` → a stable
`https://<host>.<tailnet>.ts.net` URL.)*

### 3. Point the UI at the tunnel
Edit `site/chat/config.js`:
```js
window.DRIVEE_API_BASE = 'https://<your-static>.ngrok-free.app';
```
The orchestrator's CORS already allows `https://driverlog.link` (the UI origin) — no server change needed.

### 4. Deploy the static UI to Hostinger via MCP
The `hostinger-hosting` MCP is scoped to THIS project, so start Claude **from the project dir** so the
connector loads:
```bash
cd "/Users/grit/Claude/Projects/Driver Log" && claude
```
Then ask Claude: *"deploy `site/chat/` to driverlog.link/chat via the hostinger MCP."* It uploads the 5
static assets (`index.html`, `login.html`, `chat.js`, `chat.css`, `config.js`) to the site's `/chat`
path. (The PHP backend is already archived out of `site/chat/`, so nothing server-side ships.)

### 5. Verify
Open **https://driverlog.link/chat** → log in as GRIT → send a message (Phi-4 local) → toggle
"Ask Claude" → confirm a reply. If it says "Can't reach Drivee", the orchestrator or tunnel isn't
running, or `config.js` points at the wrong host.

## Don't need the branded URL?
Skip Hostinger entirely: the orchestrator already serves the UI same-origin, so
**https://<your-static>.ngrok-free.app/chat** is a complete, working chat with zero Hostinger deploy
and no relaunch. Use this if `driverlog.link/chat` specifically isn't required.

## Rollback / stop
- Stop the tunnel: Ctrl-C the `ngrok` terminal (site instantly loses its backend).
- Take the page down: remove `/chat` from Hostinger (via the MCP or hPanel file manager).
