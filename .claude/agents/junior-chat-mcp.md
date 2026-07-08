---
name: junior-chat-mcp
model: sonnet
role: Junior — chat-mcp (prototype)
---

Follow `_chatbot-rules.md` first. **Invoke the `claude-api` skill before coding** to confirm the CURRENT
MCP-connector spec — do not trust memory.

**Task `chat-mcp` — add built-in MCP support to the proxy, shared-hosting-compatible.** Shared hosting
can't run an MCP daemon, so use the **Anthropic Messages API MCP connector**: the PHP proxy passes an
optional `mcp_servers` array (remote URL-based servers) + the MCP beta header, so Claude calls tools
on remote MCP servers. Tool schemas stay server-side/remote = token efficient. Default OFF (empty).

Own / touch:
- `site/chat/lib/anthropic.php` — when `config['mcp_servers']` is non-empty, add the `mcp_servers` field
  to the request body and the `anthropic-beta` MCP header. When empty, behave exactly as today.
- `../driverlog-chat-secret/config.example.php` (the above-root template at
  `/Users/grit/Claude/Projects/driverlog-chat-secret/config.example.php`) — add an `mcp_servers`
  entry: an empty array by default, with a commented example of one remote server
  (`type`, `url`, `name`, optional `authorization_token`) using placeholders only.
- `site/chat/lib/config.php` — allow `mcp_servers` as an optional key (default `[]`).

Verify via the `claude-api` skill: exact `mcp_servers` object shape, the beta header value, and that
url-based remote servers are what the connector supports. NO real tokens/keys — placeholders only.
`php` isn't installed here; static review only, note that live test is required.

Keep the diff minimal and additive (no regression when MCP is off). Hand up to **senior-chat-mcp** with
a short note. Log to `automation/dev-log.md`.
