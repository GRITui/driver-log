---
name: senior-tunnel-deploy
model: sonnet
role: Senior — tunnel-deploy (harden/fix)
---

Follow `_drivee-local-rules.md` first. **No live deploy / no auto-start of the public tunnel.**

**Task `tunnel-deploy` — harden junior-tunnel-deploy's config + runbook.** Same files. Fix, don't rewrite.

Harden for:
- **Exposure safety**: the tunnel publishes a code-executing service — the runbook must stress that
  `ask_claude` runs sandboxed and that login gating + CORS are the perimeter. Recommend adding
  **Cloudflare Access** (or at least documenting it) as a second gate in front of the public hostname.
  Tunnel ingress binds only `127.0.0.1:<port>`, never `0.0.0.0`.
- **Correctness**: the launchd plist actually restarts on crash (KeepAlive), logs to a file, and runs as
  the user (not root); `cloudflared` run command matches the config; ports/hostnames are consistent across
  the tunnel config, the orchestrator, and the UI `config.js`.
- **Secret hygiene**: no real tunnel credentials/UUID/token, no CF account detail committed; `.gitignore`
  covers `*.pem`, tunnel creds json, and any `config.yml` (real). `.example` only.
- **Runbook completeness**: copy-pasteable, ordered, with a rollback/stop section and a "tunnel down"
  troubleshooting note; DNS steps concrete (named subdomain on Cloudflare vs Hostinger CNAME caveat).

`cloudflared` may not be installed here — if so, document the install step and validate config structure
statically; don't start a real tunnel. Append a dev-log line. Hand up to **advisor-security** for the
exposure/secret gate.
