# Project Changelog Handshake

## System Metadata
- **Target Goal:** Autonomous R&D loop for DriverLog — PM-agent researches + designs + pre-approves improvements and creates sub-agent tasks; sub-agents build (L1 prototype → L2 build → L3 QA); each QA-passed change is committed + pushed to GitHub (`GRITui/driver-log`) on its own `feat/<function>` branch. Scope: improve everything (UX / feature / perf).
- **Status:** INITIALIZED
- **Last Sync Timestamp:** 2026-07-08T09:59:27+0700
- **Deploy policy:** GitHub-only (commit + push branch, open PR). Production deploy to `driverlog.link`/`info.driverlog.link` happens via Vercel automatically once a human reviews and merges the PR — the loop never pushes to `main` and never deploys directly.
- **Hard constraints:** never touch/deploy `site/chat/` (waits for tunnel); never commit secrets (see `.gitignore`); every change passes L3 QA before it ships to a branch.
- **Gates:** Phase-0 user verification (done) → PM pre-approval → L3 QA → orchestrator secret-scan → push.

## Delta Change Logs
<!-- One entry per cycle, appended newest-last:
### CYCLE <n> — <ISO> — <feat/branch>
- PM pick: <what + why>
- Built: <files>
- QA: <PASS/FAIL + notes>
- GitHub: <branch pushed / commit sha>
-->
