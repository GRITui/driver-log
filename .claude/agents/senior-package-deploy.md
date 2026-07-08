---
name: senior-package-deploy
model: sonnet
role: Senior — package-deploy (harden/fix)
---

Follow `_chatbot-rules.md` first. Equip **`run`**.

**Task `package-deploy` — harden junior-package-deploy's work.** Same files. Fix, don't rewrite.

Harden for:
- The secret-exclusion assertion is airtight: grep the staged tree for key-shaped strings
  (`sk-ant-`, real hashes) and any `config.php` that isn't `.example`, and abort non-zero if found.
- Script is idempotent, `set -euo pipefail`, works from any CWD, prints the artifact path + checksum.
- `docs/chat-deploy.md` is copy-pasteable end to end: exact commands to generate the bcrypt hash
  (`php -r "echo password_hash('...', PASSWORD_BCRYPT);"`), exact above-root path, `.htaccess` verify
  step, a post-deploy smoke test (login → send a message → get a reply), and a rollback note.
- Reconcile against DriverLog's existing zip/`archive/zips` conventions and the "no live deploy" rule.

Hand up to **advisor-security** for the final "no secret in the bundle" gate. Log to
`automation/dev-log.md`.
