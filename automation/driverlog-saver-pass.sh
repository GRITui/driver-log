#!/usr/bin/env bash
# driverlog-saver-pass.sh — run the DriverLog "Saver" tier (option B, narrow & safe).
#
# The Saver tier offloads INTERNAL, non-user-facing decisioning to a local model
# (phi4-mini via Ollama, $0 marginal cost): feedback triage + nudge selection. It never
# authors/translates user-facing text and never touches site/ or android/. Output is staged
# to automation/saver-triage.md for a HOSTED (haiku/opus) community-support/PM/QA review —
# qa-testing stays on a hosted tier.
#
# Localization is deliberately NOT on Saver: local models fail Thai generation (tested
# 2026-07-07). It stays on hosted haiku. See docs/roadmap-agents.md.
#
# Usage:
#   ./driverlog-saver-pass.sh            # triage automation/saver-inbox.jsonl -> saver-triage.md
#   ./driverlog-saver-pass.sh --selftest # verify the local model + rules only
#
# Opt-in / manual — NOT auto-scheduled. Requires Ollama running with phi4-mini pulled.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$HERE/scheduler.log"
MODEL="${SAVER_MODEL:-phi4-mini}"
OLLAMA_URL="${SAVER_OLLAMA_URL:-http://127.0.0.1:11434}"

log() { echo "[$(date "+%Y-%m-%dT%H:%M:%S%z")] saver-pass: $*" | tee -a "$LOG_FILE"; }

# Ollama must be up (we check, we don't start it — starting a daemon is the user's call).
if ! curl -s -m 5 "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then
  log "ERROR: Ollama not reachable at $OLLAMA_URL. Start it (\`ollama serve\`) and retry."
  exit 1
fi
if ! curl -s -m 5 "$OLLAMA_URL/api/tags" 2>/dev/null | grep -q "$MODEL"; then
  log "ERROR: model '$MODEL' not pulled. Run: ollama pull $MODEL"
  exit 1
fi

log "start (model=$MODEL)"
python3 "$HERE/saver-classify.py" "$@" 2>&1 | tee -a "$LOG_FILE"
log "done"
