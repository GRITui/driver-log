#!/usr/bin/env bash
# deploy-site.sh — deploy the NON-CHAT static site to driverlog.link.
#
# Called by the UI loop after a change passes QA. Design goals:
#   - NEVER deploy site/chat/  (chat ships only once wired to a tunnel).
#   - Non-destructive: never deletes anything already on the server
#     (so the live /chat and anything else stays untouched).
#   - Credential-gated: with no creds it STAGES a zip + logs "ready",
#     it never fails the loop. Drop creds in automation/deploy.env to
#     turn on the real push.
#   - Verifies the live URL after a push; only logs PASS if it responds.
#
# Enable a live push by creating automation/deploy.env (gitignored) with
# EITHER Hostinger FTP creds:
#     HOSTINGER_FTP_HOST=ftp.driverlog.link
#     HOSTINGER_FTP_USER=uXXXXXXXX
#     HOSTINGER_FTP_PASS=********
#     HOSTINGER_FTP_DIR=public_html        # remote docroot
# (requires `lftp`:  brew install lftp)

set -uo pipefail

PROJECT_DIR="/Users/grit/Claude/Projects/Driver Log"
SRC="$PROJECT_DIR/site"
LOG_FILE="$PROJECT_DIR/automation/dev-log.md"
ENV_FILE="$PROJECT_DIR/automation/deploy.env"
TS="$(date +%Y%m%d_%H%M%S)"
BUILD="$PROJECT_DIR/archive/build/ui-$TS"
ZIP="$PROJECT_DIR/archive/zips/ui-deploy-$TS.zip"

iso() { date "+%Y-%m-%dT%H:%M:%S%z"; }
devlog() { echo "$(iso) | DevOps/Deploy | $*" >> "$LOG_FILE"; }

mkdir -p "$BUILD" "$PROJECT_DIR/archive/zips"

# --- 1. Build a chat-free copy of the site -------------------------------
# Exclude chat/ entirely, plus junk. rsync keeps .htaccess, icons, etc.
rsync -a --exclude 'chat' --exclude 'chat/**' --exclude '.DS_Store' \
      "$SRC"/ "$BUILD"/ 2>/dev/null

if [ -d "$BUILD/chat" ]; then
  devlog "ABORT deploy: site/chat/ leaked into build tree — refusing to push. (safety guard)"
  echo "ABORT: chat present in build" >&2
  exit 2
fi

# Always produce a versioned artifact.
( cd "$BUILD" && zip -qr "$ZIP" . )
echo "staged build: $ZIP"

# --- Hard staging-only switch (user directive: stage, never push) --------
if [ "${STAGE_ONLY:-0}" = "1" ]; then
  devlog "STAGED non-chat UI build ($ZIP) — STAGE_ONLY=1, live push intentionally skipped (staging mode)."
  echo "STAGE_ONLY=1 -> staged only"
  exit 0
fi

# --- 2. Push, only if creds are present ----------------------------------
if [ ! -f "$ENV_FILE" ]; then
  devlog "STAGED non-chat UI build ($ZIP) — no automation/deploy.env, live push skipped. Set creds to enable auto-deploy."
  echo "no creds -> staged only"
  exit 0
fi

# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

if [ -n "${HOSTINGER_FTP_HOST:-}" ] && [ -n "${HOSTINGER_FTP_USER:-}" ] && [ -n "${HOSTINGER_FTP_PASS:-}" ]; then
  if ! command -v lftp >/dev/null 2>&1; then
    devlog "STAGED $ZIP — FTP creds present but lftp not installed (brew install lftp). Push skipped."
    echo "lftp missing -> staged only"; exit 0
  fi
  REMOTE_DIR="${HOSTINGER_FTP_DIR:-public_html}"
  # mirror -R (local->remote), NO --delete (never removes remote /chat or
  # anything else), skip a chat dir defensively even though BUILD has none.
  lftp -u "$HOSTINGER_FTP_USER","$HOSTINGER_FTP_PASS" "$HOSTINGER_FTP_HOST" <<LFTP >>"$PROJECT_DIR/automation/deploy.log" 2>&1
set ftp:ssl-allow true
set ssl:verify-certificate no
mirror -R --no-perms --exclude '^chat/' "$BUILD" "$REMOTE_DIR"
bye
LFTP
  RC=$?
  if [ "$RC" -ne 0 ]; then
    devlog "DEPLOY FAILED (lftp rc=$RC) — see automation/deploy.log. Build staged at $ZIP."
    echo "lftp failed rc=$RC"; exit 1
  fi
  # Verify the live site actually responds.
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://driverlog.link/ 2>/dev/null)"
  if [ "$CODE" = "200" ]; then
    devlog "DEPLOYED non-chat UI to driverlog.link (verified 200). Artifact $ZIP. site/chat NOT touched."
    echo "deployed + verified 200"; exit 0
  else
    devlog "DEPLOY uncertain: pushed but https://driverlog.link/ returned $CODE. Verify manually. Artifact $ZIP."
    echo "pushed, verify returned $CODE"; exit 1
  fi
fi

devlog "STAGED $ZIP — automation/deploy.env present but no usable creds (need HOSTINGER_FTP_*). Push skipped."
echo "no usable creds -> staged only"
exit 0
