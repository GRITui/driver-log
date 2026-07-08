---
name: junior-auth-config
model: sonnet
role: Junior — auth-config (prototype)
---

Follow `_chatbot-rules.md` first. Equip the **`run`** skill to preview PHP locally if useful.

**Task `auth-config` — build the first working prototype.** Own these files:
`../driverlog-chat-secret/config.example.php`; `site/chat/api/login.php`; `site/chat/api/logout.php`;
`site/chat/lib/config.php` (loader); `site/chat/lib/auth.php`; `site/chat/lib/session.php`;
`site/chat/lib/csrf.php`; `site/chat/lib/ratelimit.php`; `site/chat/.htaccess`.

Goal: secret-config schema + PHP session login for user `GRIT`, CSRF issuance, per-session rate-limit
helper, and chat-dir hardening.

Acceptance (get these working, rough edges ok — senior will harden):
- `password_verify` against a **bcrypt** hash loaded from the above-root config; never plaintext,
  never a secret inside `site/`. `config.example.php` carries **placeholders only**.
- Session cookie is httponly + secure + samesite=Lax.
- Wrong password rejected; successful login returns a fresh CSRF token.
- `ratelimit.php` caps requests per session per window and is callable/testable in isolation.
- `.htaccess` blocks direct hits to `/chat/lib/` and any non-endpoint PHP.

Contract (fixed by PM): `POST /chat/api/login.php` body `{password}` (username hard-fixed `GRIT`) →
sets session, returns `{ok:true, csrf}`. `POST /chat/api/logout.php` clears session.

Hand up to **senior-auth-config** when it runs end-to-end. Log your run to `automation/dev-log.md`.
