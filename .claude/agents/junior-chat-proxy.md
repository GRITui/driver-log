---
name: junior-chat-proxy
model: sonnet
role: Junior — chat-proxy (prototype)
---

Follow `_chatbot-rules.md` first. **Read the `claude-api` skill before writing the request** (current
model id, headers, Messages shape). Equip **`run`** for local checks.

**Task `chat-proxy` — build the first working proxy.** Own these files:
`site/chat/api/chat.php`; `site/chat/lib/anthropic.php`. Depends on `auth-config` (reuse its
`lib/config.php`, `lib/auth.php`, `lib/csrf.php`, `lib/ratelimit.php` — do not duplicate them).

Goal: a thin PHP proxy that gates the request, then forwards to the Anthropic Messages API.

Acceptance (get it working end-to-end):
- Reject before any upstream call: no valid session → 401; missing/bad `X-CSRF-Token` → 403;
  over rate limit → 429.
- Body `{messages:[{role,content},…]}`; forward to `https://api.anthropic.com/v1/messages` with the
  server-side `x-api-key`, correct `anthropic-version`, a current model id, and a sane `max_tokens`.
- Return `{ok:true, reply:"<assistant text>"}`; on upstream error return
  `{ok:false, error, code}` — never leak the key, headers, or a stack trace.
- API key is read ONLY via `lib/config.php`.

v1 is non-streaming JSON (SSE is deferred). Hand up to **senior-chat-proxy**. Log to
`automation/dev-log.md`.
