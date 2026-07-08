#!/usr/bin/env bash
# driverlog-dev-loop.sh
#
# Runs the DriverLog dev cycle via Claude Code CLI every 30 minutes,
# replacing the Cowork GUI scheduled task ("driverlog-dev-loop").
#
# All agents run on their normal Anthropic model tiers (see
# docs/roadmap-agents.md) via a single `claude -p` call per cycle — no
# local model / litellm proxy. (A local qwen3:4b variant was tried and
# rolled back same day; this is the plain all-cloud version.)
#
# Requirements: `claude` CLI installed and logged in.
#
# Usage:
#   chmod +x driverlog-dev-loop.sh
#   nohup ./driverlog-dev-loop.sh > /dev/null 2>&1 & disown
#   (disown detaches it from the shell so it survives closing the terminal)

set -euo pipefail

PROJECT_DIR="/Users/grit/Claude/Projects/Driver Log"
LOG_FILE="$PROJECT_DIR/automation/scheduler.log"
INTERVAL_SECONDS=1800   # 30 minutes

mkdir -p "$PROJECT_DIR/automation"
touch "$LOG_FILE"

# Portable timestamp: BSD date (macOS) doesn't support GNU's `-Is`.
now_iso() { date "+%Y-%m-%dT%H:%M:%S%z"; }
log() { echo "[$(now_iso)] $*" >> "$LOG_FILE"; }

check_deps() {
  command -v claude >/dev/null 2>&1 || { log "ERROR: claude CLI not found on PATH. Aborting."; exit 1; }
}

read -r -d '' DEV_LOOP_PROMPT <<'EOF' || true
Run one dev cycle for the DriverLog project. Project folder: /Users/grit/Claude/Projects/Driver Log

CONTEXT (read first, every run):
- Read .claude/agents/_shared-rules.md — these rules bind every agent below, always.
- Read docs/roadmap-agents.md (agent roster + model + effort assignment), docs/roadmap.md,
  docs/roadmap-next.md, docs/BACKLOG.md.
- Read the last ~15 lines of automation/dev-log.md to see what already happened — do not
  repeat or contradict it.
- Memory note "driverlog-architecture" has the app's technical layout if you need it.

HARD RULES (never violate these):
- NEVER call the Hostinger deploy connector or push anything to driverlog.link. All work
  stays local: edit files in site/ or android/, verify with a local static server / file://
  or local emulator only. If something is "ready to deploy," say so in the log and stop there.
- Android work = build a local debug APK via Bubblewrap CLI from android/, and
  document/attempt running it in a local Android emulator only. No signing for release,
  no Play Store submission.
- Every code change must pass through the QA/Testing agent (.claude/agents/qa-testing.md)
  before being logged as done.
- Keep each task small — one feature slice, fix, or doc update, not a whole roadmap phase.

STEPS:
1. PLAN (Product Manager, model opus): using .claude/agents/product-manager.md, decide the ONE
   next highest-leverage small task from the roadmap/backlog that isn't already in-flight per
   the dev log, and which agent(s) own it. If nothing meaningful is left, pick a small
   polish/QA/docs item instead of forcing a big feature.
2. BUILD: act as the owning agent(s) using their .claude/agents/<role>.md file(s) plus the task
   from step 1, at the model + effort level in docs/roadmap-agents.md (capped at Low/Medium,
   never High). If the plan has 2+ independent small pieces, do them within this same pass.
3. QA (QA/Testing, model haiku): using .claude/agents/qa-testing.md, verify each change per its
   checklist. Anything that fails goes back to its owning agent's next cycle — do not silently
   fix it yourself.
4. LOG: append one line per agent action to automation/dev-log.md:
   "ISO timestamp | agent | task | files touched | QA result | status".
5. ROADMAP: if a change completed a roadmap item, update its status in docs/roadmap-agents.md.
   If a new gap/idea surfaced, add it under "Backlog additions" in docs/roadmap-next.md for the
   next cycle's Product Manager pass to triage (don't build un-triaged ideas immediately).

Keep the total cycle tight — this runs every 30 minutes, so scope the task in step 1 to
something completable in one cycle. End with a 2-3 sentence summary of what shipped locally
this cycle and its QA status.
EOF

run_cycle() {
  log "=== starting dev cycle ==="
  ( cd "$PROJECT_DIR" && claude -p "$DEV_LOOP_PROMPT" --dangerously-skip-permissions >> "$LOG_FILE" 2>&1 ) \
    || log "dev cycle exited with an error — see above"
  log "=== cycle complete ==="
}

check_deps

log "DriverLog CLI scheduler started (interval: ${INTERVAL_SECONDS}s, log: ${LOG_FILE})"
echo "DriverLog scheduler running. Tailing log at: $LOG_FILE"
echo "Press Ctrl+C to stop (or close this terminal if not backgrounded)."

while true; do
  run_cycle
  sleep "$INTERVAL_SECONDS"
done
