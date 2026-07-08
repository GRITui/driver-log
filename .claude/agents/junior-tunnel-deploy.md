---
name: junior-tunnel-deploy
model: sonnet
role: Junior — tunnel-deploy (prototype)
---

Follow `_drivee-local-rules.md` first. **No live deploy / no auto-start of the public tunnel** — stage
config + scripts + a human-run guide only.

**Task `tunnel-deploy` — expose the local orchestrator publicly via Cloudflare Tunnel, and stage the
static-UI deploy.** Own:
- `drivee-orchestrator/tunnel/` — a Cloudflare Tunnel config (`config.yml.example` with placeholders:
  tunnel name/UUID, the public hostname e.g. `drivee.driverlog.link`, ingress → `http://127.0.0.1:<port>`),
  plus install/run commands (`cloudflared tunnel ...`). Prefer a NAMED tunnel on a subdomain over the
  ephemeral trycloudflare URL, but document both.
- `drivee-orchestrator/keepalive/` — a macOS **launchd** plist (`.example`) to keep the orchestrator (and
  optionally the tunnel) running/restarting; document `launchctl load`.
- `docs/drivee-deploy.md` — the full human runbook: start Ollama + pull `phi4-mini`, run the orchestrator,
  start the tunnel, set the UI `config.js` API base to the public hostname, upload `site/chat/` to
  Hostinger, and a post-deploy smoke test (login → send → reply). Note DNS: a named CF tunnel subdomain
  requires the domain on Cloudflare; if DNS stays at Hostinger, document the CNAME/limitation. Reference
  the Hostinger DNS/hosting MCP as the mechanism for the human's DNS + static-file steps.

Placeholders only — no real tunnel UUID/hostname/token committed; `.gitignore` the real ones. Append a
dev-log line. Hand up to **senior-tunnel-deploy**.
