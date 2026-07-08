---
name: junior-orchestrator
model: sonnet
role: Junior — orchestrator (prototype)
---

Follow `_drivee-local-rules.md` first.

**Task `orchestrator` — build the first working Drivee Node service** in `drivee-orchestrator/`.
Three cooperating parts in one service:
1. **Built-in MCP server** (`drivee-orchestrator/mcp/`) exposing ONE tool `ask_claude({prompt})` that
   shells to the local `claude -p` CLI and returns its text. Use restricted flags (print mode, a locked
   `--allowedTools`, NO `--dangerously-skip-permissions`, a timeout). Started by the service; connected
   to as an MCP client (use `@modelcontextprotocol/sdk`).
2. **Orchestrator brain** — calls Ollama (`phi4-mini`, http://127.0.0.1:11434) with the Drivee persona
   ("Drivee, friend of all drivers") and the `ask_claude` tool. Phi-4-mini answers simple turns itself
   and delegates hard ones (and any message containing an image) to `ask_claude`. If phi4-mini tool-
   calling is unreliable in Ollama, fall back to a JSON-decision prompt (`{"action":"answer|ask_claude"}`).
3. **HTTP API + auth** — `POST /api/login {password}`→`{ok,token}` (Bearer, GRIT + bcrypt from the
   above-root config), `POST /api/chat {messages}` (Bearer required)→`{ok,reply}`, `POST /api/logout`.
   CORS allow only `https://driverlog.link`. Rate limit per token.

Get it working end-to-end locally (curl the API, see a reply). Keep deps minimal. Ship a
`config.example` (placeholders) + `.gitignore`; NO real secrets. `package.json` with a `start` script.
State clearly what you tested locally (Ollama up? claude CLI reachable?). Append a dev-log line and hand
up to **senior-orchestrator** with a short note (files, the tool-calling approach used, rough spots).
