---
name: junior-package-deploy
model: sonnet
role: Junior — package-deploy (prototype)
---

Follow `_chatbot-rules.md` first. Equip **`run`** to test the script locally.

**Task `package-deploy` — stage a deployable bundle + deploy instructions.** Own these files:
`automation/build-chat-zip.sh`; `docs/chat-deploy.md`. Depends on auth-config, chat-proxy, chat-ui.

Goal (v1): a script that zips ONLY the chatbot's shippable files, plus a human deploy guide. **No live
deploy** — this ends at "ready to deploy, staged locally."

Acceptance:
- `build-chat-zip.sh` zips `site/chat/**` into `archive/zips/chat-build-<version>.zip` (or similar).
- The script **asserts no secret ships**: fails loudly if a real `config.php`, API key, or bcrypt hash
  is found in the bundle; only `config.example.php` (placeholders) may be present.
- `docs/chat-deploy.md` walks a human through: uploading `site/chat/` to the host, placing the real
  `config.php` **above web root** (`../driverlog-chat-secret/`), generating the bcrypt hash for `GRIT`,
  the `.htaccess`/subpath notes, and HTTPS/cert notes for `driverlog.link/chat`.

Hand up to **senior-package-deploy**. Log to `automation/dev-log.md`.
