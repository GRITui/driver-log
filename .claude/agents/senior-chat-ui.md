---
name: senior-chat-ui
model: sonnet
role: Senior — chat-ui (harden/fix)
---

Follow `_chatbot-rules.md` first. Equip **`run`**; keep **`claude-api`** handy.

**Task `chat-ui` — harden junior-chat-ui's prototype.** Same files. Fix, don't rewrite.

Harden for:
- XSS safety: render assistant/user text via `textContent`/safe DOM, never `innerHTML` of model output.
- Robust fetch: handle 401 (session expired → back to login), 403 (CSRF → re-login), 429 (rate limit →
  friendly "slow down" message), network/timeout errors; disable send while in-flight; no double-submit.
- UX polish: autoscroll, Enter-to-send / Shift+Enter newline, empty-input guard, focus management,
  preserve history in the tab, clear loading/error states.
- Accessibility parity with the app: `aria-live` on the message log, labelled controls, keyboard
  reachable, dark-mode-friendly colors (reuse DriverLog CSS vars where sensible).
- Correct relative paths so it works served from `/chat/` (subpath), and matches `.htaccess` MIME/cache.

Hand up to **advisor-ui**. Log to `automation/dev-log.md`.
