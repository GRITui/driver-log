---
name: senior-orchestrator
model: sonnet
role: Senior — orchestrator (harden/fix)
---

Follow `_drivee-local-rules.md` first.

**Task `orchestrator` — harden junior-orchestrator's Node service.** Same files in
`drivee-orchestrator/`. Fix, don't rewrite.

Harden for (the API is PUBLIC via the tunnel — treat input as hostile):
- **`ask_claude` sandbox** (highest risk): confirm `claude -p` runs with a locked `--allowedTools`
  allowlist (no Bash/Write/Edit), never `--dangerously-skip-permissions`, a hard timeout, output size
  cap, and a scratch cwd. A prompt-injection payload in the user message must NOT be able to make the
  CLI run commands, read files, or exfiltrate secrets. Sanitize what is passed and never shell-interpolate
  the prompt (pass via argv/stdin, not a shell string).
- **Auth**: bcrypt verify, short-lived signed/opaque Bearer token, token verified on every `/api/chat`,
  session-fixation-safe, login lockout + per-token rate limit, timing-safe compares. No token/secret in
  logs.
- **CORS** strictly `https://driverlog.link`; preflight handled; reject other origins.
- **Robustness**: Ollama down / phi4 missing → friendly error; tool-call loop bounded (max N hops, no
  infinite delegation); malformed model tool-JSON handled; image messages reliably routed to `ask_claude`;
  request body size cap; graceful MCP server crash/restart.
- **Ops**: clean start/stop, no secret in `config.example`, `.gitignore` correct, documented env.

`claude`/`ollama` ARE installed here — you MAY actually run a smoke test (start the service, curl login
+ chat) and report results. Append a dev-log line. Hand up to **advisor-security** with a change note +
residual risks.
