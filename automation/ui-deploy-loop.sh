#!/usr/bin/env bash
# ui-deploy-loop.sh — UI-improvement loop with auto-deploy, runs until 20:00 today.
#
# One-session task (2026-07-07): keep improving the DriverLog UI, PM-led with a
# 4-level sub-agent hierarchy, token-optimized (local LLMs for grunt work), LOW
# effort. On QA PASS, auto-deploy NON-CHAT changes via deploy-site.sh. NEVER
# deploy site/chat/ (waits for the tunnel). Self-stops at 20:00 and exits.
#
# Launch detached:
#   nohup ./automation/ui-deploy-loop.sh >/dev/null 2>&1 & disown

set -uo pipefail

PROJECT_DIR="/Users/grit/Claude/Projects/Driver Log"
LOG_FILE="$PROJECT_DIR/automation/scheduler.log"
INTERVAL_SECONDS=1800          # 30 min
STOP_HHMM=2000                 # stop at 20:00 local
export STAGE_ONLY=1            # user directive: stage builds, NEVER push live
START_ISO="$(date "+%Y-%m-%dT%H:%M:%S%z")"
REPORT="$PROJECT_DIR/automation/ui-loop-report-$(date +%Y%m%d).md"

mkdir -p "$PROJECT_DIR/automation" "$PROJECT_DIR/archive/snapshots"
touch "$LOG_FILE"
iso() { date "+%Y-%m-%dT%H:%M:%S%z"; }
log() { echo "[$(iso)] $*" >> "$LOG_FILE"; }

command -v claude >/dev/null 2>&1 || { log "ERROR: claude CLI not found. Aborting."; exit 1; }

read -r -d '' PROMPT <<'EOF' || true
Run ONE improvement cycle for DriverLog. Project: /Users/grit/Claude/Projects/Driver Log

You are the ONE main PRODUCT MANAGER (.claude/agents/product-manager.md). GOAL: keep improving
EVERYTHING about the app — UX, features, personalization, a11y, i18n (EN+TH), dark mode, perceived
speed, polish. ONE small, shippable slice per cycle — never a whole roadmap phase.

STEP 0 — READ BEFORE DECIDING (mandatory, every cycle): before you assign anything, read
(a) the PREVIOUS LOG: automation/dev-log.md (LAST ~25 lines — never repeat or contradict in-flight
work); (b) the PROJECT RULES: .claude/agents/_shared-rules.md, .claude/agents/_drivee-local-rules.md,
docs/roadmap-agents.md (roster + model/effort), docs/roadmap.md, docs/roadmap-next.md (backlog, incl.
the "Personalization epic" P9.x), docs/BACKLOG.md; (c) the relevant CODE for the slice you pick.
Memory note "driverlog-architecture" has the technical layout. State (1 line) what you read that
shaped the pick.

HYBRID WORKFLOW = intelligent routing + hierarchical pipeline. First ROUTE the chosen task:
  - fast_track (trivial copy/CSS/i18n tweak) -> skip prototyping, go straight to L2 build then L3 QA.
  - full_pipeline (anything non-trivial, new UI, or touching data/auth/personalization) -> run all 3 layers.
Then run the 3-LAYER PIPELINE via subagents (Task tool), escalating reasoning + cost per layer:
  - LAYER 1 — quick idea + PROTOTYPE (LOW reasoning; cheapest: local Ollama
    `ollama run qwen2.5-coder:3b "..."`/`phi4-mini` for grunt + a haiku subagent). Sketch the approach,
    find exact code anchors, draft the edit. Do NOT ship from L1.
  - LAYER 2 — APPROVE + BUILD real module (MEDIUM reasoning; sonnet/domain agent). Judge L1's prototype;
    if it looks good, apply the REAL edits to site/ files. If the prototype is weak, send it back, don't ship.
  - LAYER 3 — QA (HIGH reasoning; sonnet at high effort, adversarial). Verify against acceptance criteria;
    node --check changed JS, structural + functional + reload/persistence + regression checks. If it fails,
    hand back for the next cycle; do NOT silently fix.
Prefer cheaper layers; escalate only when the task needs it. Keep total spend small.

HARD RULES:
- NEVER touch or deploy site/chat/ — the Drivee chat module ships only after it is wired to a tunnel.
- Every change MUST pass LAYER 3 QA before it is eligible to stage.
- Keep version lockstep (APP_VERSION / #app-version fallback / SW_VERSION) whenever you touch
  app.js/app.html/sw.js.
- Personal-data / personalization work: keep new fields OPTIONAL and ON-DEVICE; no new data leaves the
  device; loop in advisor-security/security-privacy for anything that would sync.

STAGE (only after QA PASS, only for NON-CHAT changes) — STAGING ONLY, NEVER a live deploy:
- Run:  bash "/Users/grit/Claude/Projects/Driver Log/automation/deploy-site.sh"
  It runs with STAGE_ONLY=1 (exported by this loop): it builds a chat-free copy, writes a versioned
  zip to archive/zips/, and logs "STAGED" — it does NOT push to driverlog.link. Report exactly what
  it logged. NEVER claim anything was deployed live; the user wants everything staged, not deployed.

LOG: append one line PER agent action to automation/dev-log.md:
  "ISO | agent(level) | task | files touched | QA result | deploy status".
Update docs/roadmap-agents.md status if a change completes a roadmap item; add fresh ideas to
docs/roadmap-next.md "Backlog additions" (don't build un-triaged ideas immediately).

End with a 2-3 sentence summary: what UI change shipped, its QA result, and its deploy status.
EOF

run_cycle() {
  # Safety snapshot of site/ (keep last 5) so an autonomous edit is recoverable.
  local snap="$PROJECT_DIR/archive/snapshots/site-$(date +%Y%m%d_%H%M%S)"
  rsync -a --exclude '.DS_Store' "$PROJECT_DIR/site/" "$snap/" 2>/dev/null
  ls -1dt "$PROJECT_DIR"/archive/snapshots/site-* 2>/dev/null | tail -n +6 | xargs -I{} rm -rf {}

  log "=== starting UI cycle ==="
  ( cd "$PROJECT_DIR" && claude -p "$PROMPT" \
      --model sonnet \
      --dangerously-skip-permissions >> "$LOG_FILE" 2>&1 ) \
    || log "UI cycle exited with an error — see above"
  log "=== cycle complete ==="
}

write_report() {
  # Full run report, generated at shutdown so it exists whether or not any
  # Claude session is alive at 20:00. Factual extract from the dev log.
  {
    echo "# DriverLog UI-loop report — $(date +%Y-%m-%d)"
    echo
    echo "- Started: $START_ISO"
    echo "- Ended:   $(date "+%Y-%m-%dT%H:%M:%S%z")  (stopped at ${STOP_HHMM} deadline)"
    echo "- Mode:    UI-first, PM + 4-level hierarchy, model sonnet, STAGE_ONLY (no live deploy)"
    echo "- Cycles run (scheduler 'starting UI cycle' marks): $(grep -c 'starting UI cycle' "$LOG_FILE" 2>/dev/null)"
    echo
    echo "## Dev-log entries during this run"
    echo '```'
    awk -v s="$START_ISO" '$0 >= s' "$PROJECT_DIR/automation/dev-log.md" 2>/dev/null | tail -n 200
    echo '```'
    echo
    echo "## Staged (not deployed) build artifacts"
    ls -1t "$PROJECT_DIR"/archive/zips/ui-deploy-*.zip 2>/dev/null | head -30 || echo "(none)"
    echo
    echo "## Site snapshots (rollback points, newest first)"
    ls -1dt "$PROJECT_DIR"/archive/snapshots/site-* 2>/dev/null | head -6 || echo "(none)"
  } > "$REPORT"
  log "Wrote run report -> $REPORT"
}

log "UI-deploy loop started (interval ${INTERVAL_SECONDS}s, stop at ${STOP_HHMM}, model sonnet, STAGE_ONLY=1)."
while true; do
  NOW="$(date +%H%M)"
  if [ "$NOW" -ge "$STOP_HHMM" ]; then
    log "Reached ${STOP_HHMM} deadline — stopping UI-deploy loop."
    break
  fi
  run_cycle
  # Re-check the clock before sleeping a full interval past the deadline.
  NOW="$(date +%H%M)"
  [ "$NOW" -ge "$STOP_HHMM" ] && { log "Past ${STOP_HHMM} after cycle — stopping."; break; }
  sleep "$INTERVAL_SECONDS"
done
write_report
log "=== UI-DEPLOY LOOP ENDED ==="
