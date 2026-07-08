# Shared rules for every Driver Log agent

These apply to every agent below, in addition to their individual role file.

1. **Read before acting.** Before starting any task, read `docs/roadmap-agents.md`, `docs/roadmap.md`,
   `docs/roadmap-next.md`, `docs/BACKLOG.md`, and `automation/dev-log.md` (recent entries) so you don't
   repeat or contradict prior work. If your task touches the app itself, also skim
   `docs/HANDOFF.md` and the memory note `driverlog-architecture`.
2. **Work in small pieces.** Take one bounded task per run (one feature slice, one bugfix, one doc
   update) — not a whole roadmap phase. Small diffs are easier to QA and revert.
3. **No live deploy.** Never call the Hostinger deploy connector or push to driverlog.link. All work
   ships to a **local build** only: write/patch files under `site/` (or `android/`) in the project
   folder and build/verify locally (a local static server, a local emulator, or Lighthouse against a
   local file). If a task would normally end in "deploy," stop at "ready to deploy, staged locally"
   and say so in your log entry.
4. **Android = APK first, local emulator only.** Any Android/TWA work builds a local debug `.apk`
   (Bubblewrap/PWABuilder CLI) and documents/attempts running it in a local emulator (e.g. Android
   Studio AVD). No Play Store submission, no signing for release, no `.aab` upload.
5. **QA gate before marking anything done.** Every code change must be handed to the **QA/Testing
   agent** (or self-checked against its checklist if QA agent isn't available) before it's logged as
   complete. Log the QA result (pass/fail + what was checked) alongside the change.
6. **Log everything.** Append one entry per run to `automation/dev-log.md`:
   `ISO timestamp | agent | task | files touched | QA result | status`.
7. **Roadmap is living.** If you discover a new gap, risk, or opportunity worth tracking, add it to
   `docs/roadmap-next.md` under "Backlog additions" (don't silently drop it, don't silently start
   building it if it's not already prioritized — flag it for the Product Manager agent to triage).
8. **Model discipline.** Use the model assigned to your role in `docs/roadmap-agents.md` — don't
   upgrade yourself to a bigger model "just in case." If a task turns out to need deeper reasoning
   than your tier, stop and hand off/flag it rather than silently escalating.
