#!/usr/bin/env bash
# ui-cycle-once.sh — run ONE DriverLog improvement cycle, then exit.
#
# Cron handles the cadence + the OFF-PEAK-ONLY rule (see the crontab line this
# script is installed with). One PM-led 3-layer hybrid cycle per fire:
#   PM reads dev-log + rules + code -> routes -> L1 prototype (low) ->
#   L2 approve+build (medium) -> L3 QA (high) -> STAGE (never deploy).
#
# Auth: cron has no macOS Keychain, so we source automation/config.env for a
# long-lived CLAUDE_CODE_OAUTH_TOKEN (generate once with `claude setup-token`).
# Tools are SCOPED via --allowedTools (no --dangerously-skip-permissions).

set -uo pipefail
export PATH="/Users/grit/.local/bin:$PATH"

PROJECT_DIR="/Users/grit/Claude/Projects/Driver Log"
LOG_FILE="$PROJECT_DIR/automation/scheduler.log"
cd "$PROJECT_DIR" || exit 1
# Deploy-on-QA-pass (user directive "deploy all QA-passed feature"): the FTP
# deploy-site.sh script is retired (archive/retired-ftp-deploy-20260713/).
# Deploys now happen via GitHub: push the branch, open a PR against main;
# Vercel auto-deploys to driverlog.link (including /info/*) once it's
# reviewed and merged. This script's job stops at "PR opened".

iso() { date "+%Y-%m-%dT%H:%M:%S%z"; }
log() { echo "[$(iso)] $*" >> "$LOG_FILE"; }

# Auth token for unattended cron (no Keychain).
if [ -f automation/config.env ]; then
  # shellcheck disable=SC1091
  source automation/config.env
  [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] && export CLAUDE_CODE_OAUTH_TOKEN
fi
if [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
  log "ABORT cycle: no CLAUDE_CODE_OAUTH_TOKEN (set it in automation/config.env via 'claude setup-token'). Cron cannot auth without it."
  exit 1
fi

command -v claude >/dev/null 2>&1 || { log "ABORT: claude CLI not on PATH."; exit 1; }

read -r -d '' PROMPT <<'EOF' || true
Run ONE improvement cycle for DriverLog. Project: /Users/grit/Claude/Projects/Driver Log

You are the ONE main PRODUCT MANAGER (.claude/agents/product-manager.md). GOAL: keep improving
EVERYTHING about the app — UX, features, personalization, a11y, i18n (EN+TH), dark mode, perceived
speed, polish. ONE small, shippable slice per cycle — never a whole roadmap phase.

STEP 0 — READ BEFORE DECIDING (mandatory): read (a) automation/dev-log.md LAST ~25 lines (never repeat
or contradict in-flight/shipped work); (b) RULES: .claude/agents/_shared-rules.md,
.claude/agents/_drivee-local-rules.md, docs/roadmap-agents.md, docs/roadmap.md, docs/roadmap-next.md
(backlog incl. the Personalization epic P9.x), docs/BACKLOG.md; (c) the CODE for the slice you pick.
Memory note "driverlog-architecture" has the layout. State (1 line) what you read that shaped the pick.

HYBRID WORKFLOW = intelligent routing + hierarchical pipeline. ROUTE the task: fast_track (trivial
copy/CSS/i18n) -> straight to L2 build + L3 QA; full_pipeline (non-trivial / new UI / data/auth/
personalization) -> all 3 layers. Then run the 3-LAYER PIPELINE via subagents (Task), escalating
reasoning + cost per layer:
  - LAYER 1 quick idea + PROTOTYPE (LOW reasoning; cheapest — local Ollama
    `ollama run qwen2.5-coder:3b "..."`/`phi4-mini` for grunt + a haiku subagent). Do NOT ship from L1.
  - LAYER 2 APPROVE + BUILD real module (MEDIUM reasoning). Judge L1; if good, apply the REAL edits to
    site/ files; if weak, send it back — don't ship something broken.
  - LAYER 3 QA (HIGH reasoning, adversarial). Verify vs acceptance criteria; node --check changed JS,
    structural + functional + reload/persistence + regression checks. If it fails, hand back next cycle.

HARD RULES:
- NEVER touch or deploy site/chat/ (ships only after the tunnel).
- Every change MUST pass LAYER 3 QA before staging.
- Version lockstep (APP_VERSION / #app-version fallback / SW_VERSION) whenever you touch app.js/app.html/sw.js.
- Personalization/personal-data work: keep new fields OPTIONAL + ON-DEVICE; no new data leaves the device.

SHIP (only after QA PASS, NON-CHAT only):
  Push the branch and open a PR against main (gh CLI or the GitHub MCP tools). Do NOT push straight to
  main and do NOT deploy directly — Vercel deploys automatically once a human approves and merges the
  PR. Report the PR URL. NEVER include anything under site/chat/ in the diff.

LOG: append one line to automation/dev-log.md: "ISO | agent(layer) | task | files touched | QA result |
STAGED". Update docs/roadmap-next.md if a backlog item completed. End with a 2-3 sentence summary.
EOF

# Safety snapshot of site/ (keep last 8) so an autonomous edit is recoverable.
snap="$PROJECT_DIR/archive/snapshots/site-$(date +%Y%m%d_%H%M%S)"
rsync -a --exclude '.DS_Store' "$PROJECT_DIR/site/" "$snap/" 2>/dev/null
ls -1dt "$PROJECT_DIR"/archive/snapshots/site-* 2>/dev/null | tail -n +9 | xargs -I{} rm -rf {} 2>/dev/null

log "=== off-peak cycle start ==="
claude -p "$PROMPT" \
  --model sonnet \
  --allowedTools "Task,Read,Write,Edit,Bash,Glob,Grep" \
  >> "$LOG_FILE" 2>&1 || log "cycle exited with an error — see above"
log "=== off-peak cycle complete ==="
