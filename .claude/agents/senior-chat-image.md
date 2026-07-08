---
name: senior-chat-image
model: sonnet
role: Senior — chat-image (harden/fix)
---

Follow `_chatbot-rules.md` first. Keep the **`claude-api`** skill handy.

**Task `chat-image` — harden junior-chat-image's multimodal upload.** Same files (UI +
`api/chat.php`, `lib/anthropic.php`). Fix, don't rewrite.

Harden for:
- **DoS / size safety** (highest risk): enforce a strict per-image byte cap and a total-request cap
  server-side, counted on the DECODED size, not just base64 length; cap image COUNT; reject early
  (413) before heavy work. Ensure the raised body cap can't be abused to exhaust memory — stream/limit
  `php://input` reads.
- **Media-type integrity**: validate the declared `media_type` against a strict whitelist AND sanity-
  check the base64 decodes and that its magic bytes match the declared type (don't trust the client
  label); reject mismatches. Reject non-base64 / malformed data cleanly.
- **Backward compatibility**: text-only string content path is byte-identical to before; block-array
  path is fully additive.
- **XSS/UX on the client**: image thumbnails via object URLs / safe DOM (never inject data into HTML);
  revoke object URLs; disable send while encoding; clear the picker after send; handle encode errors.
- **Vision-model note**: images require a vision-capable model; add a short comment/deploy note that a
  non-vision configured model will error, and surface a friendly client message on that upstream error.

`php` not installed → static review; state live `php -l` + a real image round-trip test are required.
Hand up to **advisor-security** (backend/DoS gate) and note the UI parts for **advisor-ui**. Append a
dev-log line.
