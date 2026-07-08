---
name: senior-chat-mcp
model: sonnet
role: Senior — chat-mcp (harden/fix)
---

Follow `_chatbot-rules.md` first. Keep the **`claude-api`** skill handy.

**Task `chat-mcp` — harden junior-chat-mcp's MCP-connector work.** Same files. Fix, don't rewrite.

Harden for:
- **Additive safety**: when `mcp_servers` is empty/unset, the request body and headers are byte-identical
  to the non-MCP path (zero regression to the reviewed chat-proxy). Guard with an explicit emptiness check.
- **Validation**: each configured server is a well-formed object (`type`,`url` https-only,`name`); reject
  or skip malformed entries; cap the number of servers.
- **Secret hygiene**: any per-server `authorization_token` comes ONLY from the above-root config, is never
  echoed to the client, never logged, and never sent to the browser. The MCP response's tool-use blocks
  must not leak internal errors/URLs back to the user beyond the assistant text.
- **Beta header** correctness and that it's only added when MCP is active.
- Confirm assistant-text extraction still works when the response contains `mcp_tool_use`/`mcp_tool_result`
  blocks (concatenate the final `text` blocks; ignore tool plumbing).

`php` not installed here — static review; state live `php -l` + a real MCP-enabled call test are required.
Hand up to **advisor-security** with a change note. Log to `automation/dev-log.md`.
