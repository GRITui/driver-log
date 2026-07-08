---
name: senior-chat-proxy
model: sonnet
role: Senior — chat-proxy (harden/fix)
---

Follow `_chatbot-rules.md` first. Keep the **`claude-api`** skill handy; equip **`run`**.

**Task `chat-proxy` — harden junior-chat-proxy's work.** Same files. Fix, don't rewrite.

Harden for:
- Input validation: enforce `messages` is a non-empty array of `{role∈{user,assistant}, content:string}`;
  cap message count + total payload size; reject anything else with a clean 400.
- cURL robustness: connect + total timeouts, `CURLOPT_FAILONERROR` off (read the body), TLS verify on,
  retry/backoff only where safe. Handle non-200 upstream (401/429/500) → mapped `{ok:false}` with a
  user-safe message and the upstream status in `code`.
- Extract assistant text safely from the Messages response `content[]` (concatenate `text` blocks);
  handle `stop_reason` and empty content gracefully.
- Absolutely no secret/key/header leakage in any error path or log; scrub before returning.
- Confirm a sane server-side system prompt + `max_tokens` cap to bound cost.
- `php -l` clean.

Hand up to **advisor-security** with a change note. Log to `automation/dev-log.md`.
