# Drivee — Phase 1 runbook (local, on-device)

**Drivee** = a login-gated chat that runs entirely on this Mac. **Phi-4-mini** (via Ollama) answers by
default — nothing leaves the machine. You **opt in** to Claude per session ("Ask Claude" toggle); say
**"Bye claude"** to switch back to Phi-4. There is **no public URL / no tunnel** in Phase 1 (that's
Phase 2 — see the end).

```
Browser  http://localhost:8787/chat
   │  same-origin, Bearer-token API
   ▼
drivee-orchestrator (Node, bound to 127.0.0.1 only)
   ├─ auth: GRIT + bcrypt + short-lived token   (all on-device)
   ├─ Phi-4-mini via Ollama                      (default; fully local)
   └─ built-in MCP server → ask_claude → `claude -p`  (opt-in only; sandboxed)
```

## 0. Prerequisites (one-time)
- **Node** (v18+; tested on 26). Check: `node -v`
- **Ollama** running with the model pulled:
  ```bash
  ollama serve            # if not already running (Homebrew often runs it as a service)
  ollama pull phi4-mini   # ~2.5 GB (already done on this Mac)
  ```
- **Claude CLI** installed and **logged in** (this provides the Anthropic auth — Drivee never stores a
  key): `claude --version` then, if needed, `claude` once to sign in (or `claude setup-token`).

## 1. Configure (one-time)
```bash
cd "drivee-orchestrator"
npm install
cp config.example.json config.json          # config.json is gitignored — real secrets live ONLY here
```
Generate the bcrypt hash for the GRIT password and paste it into `config.json` → `password_hash`:
```bash
node -e "console.log(require('bcryptjs').hashSync('YOUR-REAL-PASSWORD', 12))"
```
In `config.json` set at least: `password_hash` (above), `allowed_user` ("GRIT"), and `port` (default
8787). Leave `ollama_model: "phi4-mini"` and `claude_model: "sonnet"` unless you want to change them.
**Never commit `config.json`.** Rotate the password you shared earlier in chat.

## 2. Run
```bash
cd "drivee-orchestrator"
npm start                 # binds 127.0.0.1:<port>, serves the UI + API same-origin
```
Open **http://localhost:8787/chat** → log in as **GRIT**.

## 3. Use
- **Default = Phi-4-mini, on-device.** Ask anything; simple turns are answered locally. *Nothing leaves
  the Mac.*
- **"Ask Claude" toggle** (composer) → your turns are delegated to Claude (via the sandboxed CLI) for
  hard reasoning/coding. **Note:** delegated message content IS sent to Anthropic by the Claude CLI.
- **Images**: attach a picture — requires "Ask Claude" ON (Phi-4 can't see images); Claude does the
  vision. With the toggle OFF an image is blocked with a nudge.
- **"Bye claude"**: type it to switch back to Phi-4 (the phrase is handled locally and never sent).

## 4. Stop
`Ctrl-C` in the `npm start` terminal. (Optionally keep it alive with a launchd job — deferred to Phase 2.)

## Troubleshooting
- **"Drivee isn't set up yet"** in the UI → you opened the static files directly; use the orchestrator URL
  (`http://localhost:<port>/chat`) so the generated `config.js` (`= window.location.origin`) is served.
- **Login fails** → check `password_hash` in `config.json`; after 5 bad tries there's a 15-min lockout.
- **"Can't reach Drivee"** → the orchestrator isn't running (`npm start`).
- **Claude replies "I can't see the image"** → ensure "Ask Claude" is ON and `claude_model` is
  vision-capable (`sonnet` is).
- **Phi-4 errors** → is `ollama serve` up and `phi4-mini` pulled? (`ollama list`)

## Security notes (Phase 1)
- Bound to **127.0.0.1 only** — not reachable from your LAN or the internet.
- `ask_claude` runs `claude -p` sandboxed: `--permission-mode dontAsk`, locked tool allowlist, no
  `--dangerously-skip-permissions`, prompt via stdin, per-request isolated image workdir, timeout +
  output cap.
- Secrets (`password_hash`) live only in the gitignored `config.json`; the Anthropic key is the Claude
  CLI's own stored auth.

## Phase 2 (deferred — public `driverlog.link/chat`)
When you want it public: start a **Cloudflare Tunnel** to the orchestrator, set the shared-hosting UI's
`site/chat/config.js` → the public API host, flip CORS to `https://driverlog.link` (already supported),
add a launchd keep-alive, and (recommended) put **Cloudflare Access** in front. The `tunnel-deploy`
agents (`junior/senior-tunnel-deploy`) are already defined for this.
