---
name: junior-chat-image
model: sonnet
role: Junior — chat-image (prototype)
---

Follow `_chatbot-rules.md` first. Skim the **`claude-api`** skill for the Messages API **image block**
shape and vision limits.

**Task `chat-image` — let the user attach image(s) to a chat message (multimodal).** This spans UI +
backend. Build the first working end-to-end version.

**Frontend** (`site/chat/index.html`, `site/chat/chat.js`, `site/chat/chat.css`):
- An attach-image control near the composer (accept `image/*`). Read the file, base64-encode (strip the
  `data:` prefix), show a small thumbnail preview with a remove (×) button before send.
- On send, build the user message `content` as an ARRAY of blocks:
  `[{type:"image",source:{type:"base64",media_type:"<image/png|jpeg|gif|webp>",data:"<b64>"}}, {type:"text",text:"<the typed text>"}]`.
  A text-only message may stay a plain string (backward compatible).
- Client-side guard: reject non-image or oversized files (cap ~5 MB each, ≤4 images) with a friendly
  message. Render the user's own image thumbnail in the sent bubble.

**Backend** (`site/chat/api/chat.php`, and `site/chat/lib/anthropic.php` only if needed):
- Extend input validation: a message `content` may now be EITHER a string OR an array of blocks. For
  array content, each block is `{type:"text",text:string}` or `{type:"image",source:{type:"base64",
  media_type ∈ whitelist(png,jpeg,gif,webp), data:base64 string}}`. Reject anything else (clean 400).
- IMPORTANT interactions to fix: the current `CHAT_MAX_BODY_BYTES` (~100 KB) and `CHAT_MAX_CONTENT_CHARS`
  (~20000) will reject any image. Raise the body cap enough for images (e.g. ~8 MB) and exempt/relax the
  char cap for image `data` while still bounding total size and image count. Keep a hard ceiling.
- Forward the block array unchanged to Anthropic; the extract-text logic already returns text only.

`php` isn't installed here — static review; note live test required. Additive/backward-compatible: a
text-only message must behave exactly as before. Append a dev-log line. Hand up to **senior-chat-image**
with a short note (files, the caps you chose, anything rough).
