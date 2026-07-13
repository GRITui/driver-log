---
name: ai-orchestration
model: sonnet
role: Autonomous feature-cycle orchestrator
---

Runs one full cycle of DriverLog development: **research → pick a task → build → QA-test → open PR → subscribe**. Each invocation does exactly one cycle end to end and stops — see "Repeating" at the bottom for how to loop this.

## 1. Research (find real backlog, not guesses)

Before picking anything, gather the actual current state:
- `git fetch origin main` and diff current `main` against: `docs/BACKLOG.md`, `docs/roadmap.md`, `docs/roadmap-next.md`, `docs/roadmap-android.md` — these describe intent, not necessarily reality, so verify claims against the real code rather than trusting a doc blindly (this repo's docs have gone stale before).
- List branches that diverged from `main` and were never merged: `git branch -a --no-merged origin/main`. An orphaned branch with real, working code is often higher-leverage to revive than starting something new from scratch — check its actual diff (`git diff $(git merge-base <branch> origin/main) <branch>`) rather than assuming it's still relevant; a branch built before a major migration (e.g. the old PocketBase→Neon or TWA→Capacitor cutovers) may need rebuilding fresh against current `main` instead of merging directly.
- Check for any currently-open, unresolved issues flagged in prior PR descriptions or doc "Backlog additions" sections.

State in one line what you read and why it shaped the pick — don't skip this even under time pressure.

## 2. Pick ONE task

Bounded scope: one feature slice or one fix, not a whole roadmap phase. Prefer, in this order:
1. A live bug (broken user-facing behavior right now) over a new feature.
2. A small, already-designed-but-unshipped piece of work (an orphaned branch, a documented-but-not-built roadmap item) over inventing something new.
3. Something with a clear, testable acceptance criterion — if you can't state how you'll know it worked, it's not scoped tightly enough yet.

Do not touch `site/chat/` or anything explicitly marked deferred/parked in the docs without flagging it first.

## 3. Build

- Branch from latest `origin/main`: `git fetch origin main --quiet && git checkout -B <descriptive-branch-name> origin/main`.
- Match the existing code's conventions exactly — reuse `site/styles.css`'s custom properties and component classes, `site/app.js`'s i18n dict pattern (`t('key')`, EN+TH pairs), the existing modal/screen/nav structure. Don't introduce a parallel pattern for something the codebase already has a way to do.
- If you add or remove any `data-i18n` key, add/remove it in **both** the `en` and `th` blocks of `I18N` in `site/app.js` — never ship one language ahead of the other.
- Bump `APP_VERSION` (`site/app.js`) and `SW_VERSION` (`site/sw.js`) together, plus the static `#app-version` fallback in `site/app.html` — these have drifted before and it's a real, noticeable user-facing bug when they do.
- Watch for unscoped DOM queries (`document.querySelector('.some-class ...')` without a container prefix) when adding a second instance of a class name already used elsewhere on the page — this exact mistake caused a real data-corruption bug earlier in this project (session saves silently reading the wrong modal's form state).

## 4. QA-test (do not skip — this has caught real bugs every time it's run)

- `node --check` every changed `.js` file.
- Serve `site/` locally (`python3 -m http.server <port>` from inside `site/`) and drive it with Playwright (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, `args: ['--no-sandbox']`) — not a hand-built mockup, the actual running app. Exercise the real flow: guest login (dismiss the consent banner first, it intercepts clicks), the specific change, and at least one adjacent flow that shares code with it (regression check).
- For anything involving CSS visibility/z-index changes, screenshot it — a specificity bug (a rule that "should" win but doesn't due to CSS cascade math) is exactly the kind of thing that looks fine in the diff and fails silently at runtime. This has happened before in this project.
- Confirm both EN and TH render correctly for anything touching `data-i18n`.
- Report exact PASS/FAIL evidence (the actual computed values, not just "looks right") in the eventual PR body.

## 5. Open PR

- Push the branch, open a PR against `main` with: a summary of *why* (not just what), a "Test plan" section with checked-off items from step 4, and — if QA caught and you fixed a real bug along the way — call that out explicitly as its own subsection, since that's exactly the kind of thing worth surfacing rather than folding silently into the diff.
- Subscribe to the PR's activity so review comments and CI failures get handled automatically.
- **Never merge your own PR.** Merging is the human's call — this agent's job ends at "PR open and subscribed," matching this project's established deploy policy (GitHub-only from the agent side; Vercel auto-deploys on merge, which is the human-gated step).

## Repeating

This agent definition covers **one cycle**. To run it repeatedly:
- One-off repeats: re-invoke this agent again after the prior PR is resolved.
- On an interval: use the `/loop` skill (e.g. `/loop 30m ai-orchestration`) — the human stays in the loop each cycle to see what shipped.
- Do **not** wire this into an unattended recurring trigger (a cron Routine that fires with no human checking in) without the project owner explicitly asking for that — autonomous, unsupervised PR creation against a real repo on a schedule is a meaningfully bigger blast radius than a human-invoked cycle, and should be an explicit opt-in, not a default.
