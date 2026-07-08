# Shared rules for the Drivee LOCAL orchestrator squad (architecture "B")

Supersedes the backend half of `_chatbot-rules.md` (the PHP→Anthropic proxy is retired as the brain).
The Drivee **frontend** (`site/chat/`) is unchanged and still deploys to `driverlog.link/chat`. The
**brain** now runs locally on the user's Mac (Mac mini M1, 8 GB) and is reached from the public UI
through a tunnel.

## Architecture (locked)
```
driverlog.link/chat (Hostinger shared hosting, static Drivee UI, login-gated)
  → HTTPS Bearer-token calls to a CONFIGURABLE api base
  → Cloudflare Tunnel → Mac
  → Drivee Orchestrator (Node service)
       ├─ auth: user GRIT, bcrypt hash, short-lived Bearer token, rate limit, CORS allow ONLY https://driverlog.link
       ├─ orchestrator brain: Phi-4-mini (3.8B) via Ollama (local http://127.0.0.1:11434)
       └─ built-in MCP server → tool `ask_claude` → local `claude -p` CLI (the heavy tool-LLM, + vision)
```
Phi-4-mini handles the turn LOCALLY by default. Delegation to the Claude CLI tool is **OPT-IN**
(privacy default = Phi-4 only — see Phase 1).

## Phase 1 scope (current) — LOCAL ONLY, no tunnel
- The orchestrator binds **127.0.0.1 only**, and **also serves the Drivee UI static files** so the UI
  and API are the SAME ORIGIN (`http://localhost:<port>/chat`). No Cloudflare tunnel, no public
  exposure, no CORS complexity. Login/user data stays entirely on this Mac.
- **`tunnel-deploy` is DEFERRED to Phase 2.** Keep the driverlog.link/CORS/Bearer paths ready (a later
  config flip) but do not build/run the tunnel now.
- **Delegation to Claude is OPT-IN; default is Phi-4-mini ONLY.** With the opt-in OFF, NOTHING leaves
  the box (Ollama is fully local). `ask_claude` is invoked ONLY when the client sets an explicit
  per-request opt-in flag (e.g. `{messages, useClaude:true}`), surfaced in the UI as an "Ask Claude"
  toggle. Because Phi-4-mini is not vision-capable, a message containing an IMAGE requires the opt-in —
  if images are attached with the opt-in OFF, the UI must block send and nudge the user to enable
  "Ask Claude" (never silently send an image to Claude).

## Project layout
- New Node service lives in `drivee-orchestrator/` at the project root (its own package.json).
- The built-in MCP server is a module INSIDE that service (`drivee-orchestrator/mcp/`), started by it,
  connected to as an MCP client — this is the "both connect via built-in mcp-server" bus.
- Frontend stays in `site/chat/`; only its API base + auth scheme change (`ui-repoint` task).

## HARD security rules (this API is PUBLIC via the tunnel — treat every input as hostile)
1. **Sandbox the Claude tool.** `ask_claude` shells to `claude -p` (print/non-interactive) with a
   locked-down `--allowedTools` allowlist (NO Bash/Write/Edit by default), NEVER
   `--dangerously-skip-permissions`, a timeout, and output size caps. Run it in a scratch working dir.
   Assume the user prompt is attacker-controlled (prompt injection) and design so a hostile prompt
   cannot make the CLI run commands or read secrets. This is the #1 fail condition.
2. **Auth before anything.** No orchestrator turn, no Ollama call, no `ask_claude` without a valid
   Bearer token. Token is short-lived + server-verifiable; password is bcrypt (reuse the GRIT hash from
   the above-root config). Per-token rate limit + a global login lockout.
3. **Secrets stay out of the repo.** The bcrypt hash and any config live above the repo / in a
   gitignored env file (chmod 600); ship `.example` only. The Anthropic key is the `claude` CLI's own
   stored auth — never re-store it. Never log secrets, tokens, or tool stdout containing them.
4. **CORS locked** to `https://driverlog.link` only; reject other origins.
5. **No live deploy / no auto-start of the public tunnel.** All work is local + staged; a human runs
   the tunnel and the launchd/keep-alive step. End at "ready to run, documented."

## Process (inherited)
6. Work in small pieces; **junior** prototypes → **senior** hardens/fixes → **advisor** reviews & signs
   off (advisor-security gates the backend/tunnel; advisor-ui gates the UI). Advisors review, never
   rewrite.
7. Log one line per run to `automation/dev-log.md`. Use the model in your role file; don't self-upgrade.
8. Node target: keep deps minimal; prefer the built-in `fetch`/`http`; document exact run commands.
