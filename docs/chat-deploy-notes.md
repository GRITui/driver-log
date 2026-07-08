# Drivee (chat module) — deploy notes

Deploy notes specific to `site/chat/` (the login-gated Claude proxy). These are
for the human doing the Hostinger upload / the package-deploy step. General auth
+ secret-config rules live in `.claude/agents/_chatbot-rules.md`.

## Required PHP settings (image upload / multimodal)

Image messages travel base64-encoded inside the JSON POST body. The client
downscales every image to a ~1568px long edge and re-encodes to JPEG before
upload, so a typical photo arrives as a few hundred KB and 4 images plus the
conversation stay well under the proxy's **12 MB** body cap
(`CHAT_MAX_BODY_BYTES` in `api/chat.php`).

For that cap to be reachable, the host must allow the request through **before**
our PHP runs. On the Hostinger shared plan, confirm (via `.htaccess`
`php_value`, an `.user.ini`, or the hPanel PHP config) that:

| Setting          | Minimum | Why |
|------------------|---------|-----|
| `post_max_size`  | `16M`   | Applies to `php://input`; if the body exceeds it, `php://input` is empty and the request fails before our 413 check. Must be ≥ the 12 MB body cap with headroom. |
| `memory_limit`   | `16M`+  | We decode + magic-byte-check each image server-side. Keep it at least the body cap; the platform default (usually 128M–256M) is fine. |
| `upload_max_filesize` | n/a | Not used — images are base64 in the JSON body, not multipart form uploads. Left here only to note it is irrelevant. |

**Shared hosting caveat:** some shared plans cap `post_max_size` / `memory_limit`
and ignore per-directory overrides. If image uploads 413 or silently fail with an
empty body, check the *effective* values with a one-off `phpinfo()` (delete it
after) and, if they're below 16M and can't be raised, lower `CHAT_MAX_BODY_BYTES`
in `api/chat.php` to match — the client downscaling keeps typical payloads small
enough that ~8 MB still fits 4 images.

## Vision-capable model required for images

Image (multimodal) requests require a **vision-capable** Claude model. The
default `claude-opus-4-8` (set in the above-root `config.php`) is vision-capable.
If `config.php` overrides `model` with a text-only model, image requests fail
upstream with a 400 — the proxy returns a generic error and the client shows a
"may not be configured with a vision-capable model" hint. Keep `model` on a
vision-capable id (or leave it unset to use the default).

## Live checks still required before deploy (php not installed in the build sandbox)

- `php -l site/chat/api/chat.php` and `php -l site/chat/lib/anthropic.php` — clean.
- Real round-trip: log in, attach a photo, send → Claude describes it (confirms
  the downscale path, the 12 MB cap, the magic-byte check, and a vision model).
- Negative check: a non-image file renamed to `.png`, or a payload over the caps,
  is rejected with a 400/413 and a friendly message (no 500, no leak).
