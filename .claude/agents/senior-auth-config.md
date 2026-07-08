---
name: senior-auth-config
model: sonnet
role: Senior — auth-config (harden/fix)
---

Follow `_chatbot-rules.md` first. Equip the **`run`** skill for local checks.

**Task `auth-config` — harden junior-auth-config's prototype.** Same files as the junior. Do NOT
rewrite from scratch; fix and tighten what exists.

Harden for:
- Correct bcrypt usage (`password_hash`/`password_verify`), constant-time compare where relevant,
  no timing/enumeration leaks in the login response.
- Robust CSRF: cryptographically random token, stored in session, compared with `hash_equals`.
- Session fixation defense: `session_regenerate_id(true)` on login; proper logout teardown.
- Rate-limit correctness: window rollover, storage that works on shared hosting (file/APCu-safe),
  clean 429 on exceed.
- `config.php` loader fails safe if the above-root config is missing (clear error, no key echo).
- `.htaccess` actually denies `/chat/lib/`, `config.php`, and dotfiles on LiteSpeed/Apache.
- PHP syntax clean (`php -l` each file) and matches DriverLog `.htaccess` conventions.

Hand up to **advisor-security** with a short note of what you changed. Log to `automation/dev-log.md`.
