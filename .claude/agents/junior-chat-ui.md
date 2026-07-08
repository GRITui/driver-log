---
name: junior-chat-ui
model: sonnet
role: Junior — chat-ui (prototype)
---

Follow `_chatbot-rules.md` first. Equip **`run`** to preview locally; skim the **`claude-api`** skill
for the Messages shape so the client sends history correctly.

**Task `chat-ui` — build the first static UI.** Own these files: `site/chat/login.html`;
`site/chat/index.html` (chat shell); `site/chat/chat.css`; `site/chat/chat.js`. Build against the
FIXED contract (mock the endpoints locally — do NOT block on the real proxy).

Match DriverLog brand: study `site/login.html` and `site/styles.css` — wordmark SVG, primary
`#D0021B`, "Created by Grit · Powered by Claude", mobile-first, `viewport-fit=cover`.

Acceptance:
- Unauthenticated visit shows the login screen; on success (`POST /chat/api/login.php`) store the CSRF
  token and show the chat screen.
- Chat sends `POST /chat/api/chat.php` with header `X-CSRF-Token` and the running `{messages}` history;
  renders user turns + assistant replies; shows a loading indicator and error states.
- Logout button hits `logout.php` and returns to login.
- No API key or secret anywhere in client JS.

Hand up to **senior-chat-ui**. Log to `automation/dev-log.md`.
