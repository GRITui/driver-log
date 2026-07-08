# DriverLog — Next-Step Roadmap (proposed)

**Date:** 5 July 2026 · **Author:** Product Manager Agent
**Thesis:** The product is feature-rich but **unvalidated and undistributed**. No real driver has
used it, there's no install channel, and no revenue is live. The next phase should be
**Launch & Learn**, not more features. Sequence below is by leverage-per-effort.

---

## Phase 0 — Unblock what's already built (this week · ~$25 · mostly account clicks)

Everything here is code-complete; only external/account steps remain. Highest leverage.

1. **Turn on ad eligibility** — in AdSense: publish the **European regulations (GDPR) consent
   message** and submit **driverlog.link for review/approval**. No revenue is possible until this clears.
2. **Get an install channel** — create the **Google Play developer account ($25)**, generate the
   `.aab` (Bubblewrap config is ready), add the `assetlinks.json` signing fingerprint, submit to
   **Internal testing**.

*Why first:* zero build cost, unlocks both revenue and real distribution.
*Risk to flag:* AdSense may reject a brand-new, thin, single-page app until it has real traffic —
so approval likely follows Phase 2, not precedes it. Don't block on it.

## Phase 1 — Make the data trustworthy (≈1 week · ~$5/mo)

3. **Host PocketBase on a small VPS → flip cloud sync on (P1).** Set `PB_URL`, migrate the dormant
   sync engine from local-only to live.

*Why now:* "lose your phone, lose your whole logbook" is a trust-killer. Cross-device + backup is
the single biggest **retention** feature, and it's the foundation the B2B tier (P8) needs. The VPS
also sidesteps the home-ISP/port problems we hit.

## Phase 2 — Put it in front of real drivers (2–3 weeks · little/no code)

4. **Soft launch to 10–30 Thai drivers** (Play closed testing + direct link). Add a lightweight
   **in-app feedback link** and watch what they actually log and where they drop off.
5. **Prototype one affiliate placement** (fuel card / insurance / phone plan) beside the ad.
   🟢 Shipped 5 Jul 2026: static "Fuel card partner — coming soon" placeholder card next to the
   AdSense unit, EN/TH i18n, non-functional CTA (no real affiliate account/link yet). Staged
   locally, not deployed.

*Why:* validates the core loop and surfaces the *real* next feature from usage instead of guesses.
Affiliate revenue per driver is usually far higher than display-ad RPM on a small utility app and
fits the "free for drivers" ethos — worth testing early.

## Phase 3 — Grow the wedge (pick based on Phase 2 data)

- **Retention loop:** shift reminders + weekly earnings summary + tax-time summary. Push
  notifications (FCM) are the trigger here — and the main reason to consider a thin **Capacitor**
  shell over the pure TWA.
- **P7 — "Gig Log" generalization:** swap driver vocabulary/cost categories per worker type
  (courier, cleaner, trades). The new `provider` field is step one. Do this only if adjacent demand
  actually shows up.
- **P8 — Fleet B2B tier:** paid aggregated dashboard for fleet owners across many drivers. Pairs
  with the sync backend; a real paid wedge once individual usage is proven.

---

## The one thing to do next

If you do nothing else this week: **Phase 0** — publish the consent message, submit for AdSense
review, and stand up the Play internal-testing build. It's cheap, it's already built, and it turns
"a nice app" into "a launched app with a way to reach drivers and earn." Then Phase 1 (sync on a VPS)
right after.

*What I would NOT do yet:* build P7/P8 features. They add surface area before the core loop is
validated with real users — revisit once Phase 2 gives you signal.

## Backlog additions (from this cycle)

- ~~**Backup RESTORE / import (paired follow-up to the 7 Jul JSON Backup export):**~~ ✅ **DONE
  7 Jul 08:05.** `importBackup(inputEl)` + `pickBackupFile()` shipped (♻️ Restore button + hidden
  file input in Settings→Export). Reads a `.json` backup, validates it's a DriverLog file
  (`app==='DriverLog'` + `sessions`/`fuel` arrays — rejects arbitrary/other-app JSON) with a
  try/catch on malformed JSON, confirm-gates with the entry count, then **overwrites this account
  only**: clears current-uid sessions+fuel (other device accounts untouched) and re-adds each
  backup row with stale `{id,sid}` stripped (fresh autoincrement, no collisions) + uid reassigned
  to the current account, cuid preserved. Closes the roadmap's #1 trust-killer locally without the
  blocked cloud backend. APP_VERSION 2.6.6 / SW v1.6.10. QA'd 16/16 in a node round-trip harness
  against the real source (incl. second-account survival + all rejection paths). Staged locally,
  not deployed. **Deliberately scoped OUT (future slice):** restoring device *settings*
  (theme/consent/currency) — the backup file carries them, but restore is data-only for now to
  avoid clobbering local prefs; merge-instead-of-overwrite is also still open if usage ever wants it.



- **CSV export UTF-8 BOM + localized toast (done 7 Jul 00:45):** both `exportCSV` +
  `exportMonthlyCSV` now prepend a U+FEFF BOM (Blob type `text/csv;charset=utf-8`) so the ฿
  header + Thai provider/type names render correctly when opened in Excel on a non-UTF-8 default
  locale (a real trust gap in a Thai-first app — Sheets/LibreOffice/text editors handle the BOM
  transparently). Also fixed `exportCSV`'s hardcoded English `'CSV exported!'` toast to
  `t('exported')` so the logbook export announces in the active language. SW v1.6.5→v1.6.6.
  QA'd via node harness against the real source (BOM = charCode 0xFEFF, ฿/Thai preserved, rows
  intact). Staged locally, not deployed; part of the same bundle awaiting the next approved hotfix.
- **site/chat/ module — PM note (7 Jul):** deliberately NOT extended this cycle. It's a large
  login-gated Claude chat proxy mid-pipeline (junior-chat-mcp built the optional MCP-connector
  support 00:00, handed to senior-chat-mcp) that (a) can't be functionally QA'd locally because
  php is unavailable in the sandbox and (b) still carries the flagged concurrent-dev-loop racing
  risk from 6 Jul 18:10. It should finish through its own junior→senior→advisor-security pipeline
  (chat-mcp still needs senior hardening + advisor sign-off; the whole module still needs a live
  `php -l` + functional API test before any deploy). Next PM pass: consider whether the two
  racing dev-loops need a lightweight in-flight claim marker before this compounds further.


- ~~**Modal focus management (a11y follow-up):**~~ ✅ **RESOLVED 6 Jul 10:40.** The log-session
  modal now has full JS focus handling: on open, focus moves into the dialog (close button / first
  focusable); on close, focus restores to the element that opened it; Esc closes; and Tab is trapped
  (wraps both directions, recomputed each press). QA'd via a vm DOM-stub harness against the real
  `site/app.js` (8/8 scenarios). Staged locally, not deployed — bundle into the next approved hotfix
  along with the other staged-not-deployed changes (consent-withdrawal control, HTML no-cache
  `.htaccess`).
- **Numeric input validation (follow-up):** 6 Jul 11:00 — negative values are now rejected on the
  log-session + fuel forms (JS guard + `min="0"`), closing a P6 data-integrity hole. 6 Jul 11:30 —
  also now **require liters > 0** on the fuel form (was only requiring price), so a 0-liter refill can
  no longer save and skew the ฿/L average + total-volume math. Note on the "divide-by-zero display"
  worry flagged earlier: verified NOT present — every rate display in app.js is already guarded
  (`liters>0?`, `totalHours>0?`, `gross>0?`, `distVal>0?`, auto-expense requires truthy consumption).
  Remaining possible increment: upper-bound / sanity ceilings (reject implausibly large distance) and
  inline field-level error messaging instead of a single toast. Low priority — triage against launch
  work; upper-bound ceilings carry false-rejection risk, so scope carefully.
- **Hero net-revenue card restyle — finalized & QA'd 6 Jul 14:32.** A prior cycle restyled the
  dashboard hero from a red block to a neutral elevated card (`styles.css .hero` → `var(--card)`,
  sw.js v1.6.2) and added `site/robots.txt`, but never QA'd or logged it. This cycle finalized it:
  QA found `renderHeroDelta` still used red-hero pastel tints (`#9dffc0`/`#ffc9c9`) that were
  near-invisible on the new white card, fixed to the app's standard `#047857`/`var(--red)` delta
  colors (sw bumped v1.6.3). Now part of the staged-not-deployed bundle (with consent-withdrawal
  control, HTML no-cache `.htaccess`, negative/liters input guards, a11y polish) awaiting the next
  approved hotfix/deploy through the user.
- **Process note (recurring):** unlogged, un-QA'd edits keep appearing in `site/` between cycles
  (focus-mgmt at 10:35, this hero restyle at 14:32). Each cycle should diff `site/` vs
  `Ready to deploy/` first and close out any pending work before starting new features.
- **Stale-root-caching fix ready to ship:** the "driverlog.link/ root serves an ancient v2.0.0
  build" bug flagged 5 Jul 18:10 has a proposed fix — `site/.htaccess` now sets
  `Cache-Control: no-cache, must-revalidate` on `.html` entry documents (index/app/login), so a
  future deploy can't get stuck showing a stale cached shell. Staged locally only, not deployed;
  bundle it into the next approved hotfix/deploy along with the still-undeployed affiliate-card
  (#17/18) and FAB-fix (#22) changes already sitting in `site/`.
- **CSV export hardening (done 6 Jul 15:35):** the P8 CSV exports (`exportCSV` +
  `exportMonthlyCSV`) interpolated free-text fields (provider/type/month) into quoted cells with
  no escaping — a provider name with a `"` or `,` broke the row, and a value starting with
  `=`/`+`/`-`/`@` was a spreadsheet formula-injection vector in Excel/Sheets. Added a `csvCell()`
  helper (doubles embedded quotes, wraps in quotes, prefixes a `'` on formula-trigger leads) and
  routed all free-text fields through it. Numeric fields left bare (injection-safe). SW bumped
  v1.6.4→v1.6.5. QA'd 12/12 in a node harness against the real helper. Staged locally, not
  deployed; part of the same bundle awaiting the next approved hotfix. No new open follow-up.
- **Chatbot module (site/chat/) progress + a coordination risk (6 Jul ~18:10):** the new
  login-gated Claude chat proxy is advancing through its junior→senior→advisor pipeline —
  **auth-config** advisor-security-signed-off (17:10), **chat-proxy** built (17:40) then hardened
  (18:10: input caps, max_tokens ceiling, default system prompt, safe upstream-status mapping). Next:
  **advisor-security sign-off of chat-proxy**, then the **chat-ui** and **package-deploy** tasks.
  NOTE for PM triage: this cycle collided **three times** with a *concurrent* dev-loop run (it had
  already taken the advisor-security review and the junior-chat-proxy build before this run reached
  them). Two+ dev-loops appear to be firing on the same ~30-min cadence and racing the same task
  queue, which wastes work and risks double-writes. Worth a coordination fix (a lightweight
  in-flight lock/claim marker, or ensuring only one loop runs) — flag for the next PM pass. Also
  still pending for the whole `site/chat/` module before any deploy: a real `php -l` pass + a live
  functional test (php is unavailable in the sandbox), and the CHAT_DUMMY_HASH secret-scanner
  false-positive noted in the 17:10 advisor entry.
- **Toast a11y (done 6 Jul 15:05):** the `#toast` region now carries `role="status"
  aria-live="polite" aria-atomic="true"`, so validation rejections (negative values / liters>0 /
  revenue) and save confirmations are announced to screen readers (SW bumped v1.6.4). This closes
  the *announcement* half of the earlier "inline field-level error messaging" note. Still OPEN and
  un-triaged: true **inline, per-field** error text (highlight the offending input + message beside
  it) instead of a single transient toast — a larger UX slice for a future PM pass. Staged locally,
  not deployed; part of the same bundle awaiting the next approved hotfix.
- **APP_VERSION drift fixed (done 7 Jul 05:35):** the Settings→About "Version" (`APP_VERSION` in
  app.js, mirrored by the `#app-version` fallback in app.html) had been stuck at **2.6.3** — the
  login/app split build (SW v1.6.0) — while sw.js shipped **7 subsequent user-facing patches**
  (v1.6.1–v1.6.7: hero restyle, dark-mode hero, toast + login a11y, CSV formula-injection escaping,
  CSV UTF-8 BOM). Drivers/support were seeing a stale build number. Bumped APP_VERSION 2.6.3→2.6.4
  (rollup comment listing the covered SW versions) + app.html fallback to match; SW bumped v1.6.7→
  v1.6.8 to cache-bust. Display-only, no logic change. QA PASS (node -c both files; #app-version
  wired from APP_VERSION at boot; numeric = i18n-agnostic). Staged locally, not deployed.
  **Process note for future cycles:** bump `APP_VERSION` (app.js) *and* the app.html `#app-version`
  fallback whenever you bump `SW_VERSION` — they drifted precisely because SW-only bumps didn't
  touch APP_VERSION. Cheap to keep in lockstep; misleading when they diverge.

## Backlog additions — Personalization epic (Grit-requested 2026-07-07)
Goal: collect more (optional, privacy-sane, on-device) personal data at register/login and use it to
personalize the app. Seeded by user; PM to slice per cycle via the 3-layer hybrid workflow.
- [P9.1] First-name capture at registration + first-name greeting — SHIPPED 2026-07-07 (APP_VERSION 2.6.8 /
  SW v1.6.12): optional field on both PB/Sync and local-only register paths, restored across reload via
  IndexedDB (local) / pb_firstName_<uid> localStorage cache (Sync); PB `users` collection schema still needs
  a firstName field added server-side before this round's cloud path persists past a live PB reinstall.
- [P9.2] Time-of-day greeting ("Good morning/afternoon/evening, <first name>") — SHIPPED 2026-07-07 alongside
  P9.1 (APP_VERSION 2.6.8 / SW v1.6.12): EN+TH via t('greeting_morning'/'afternoon'/'evening'), driven by
  local device clock; guest greeting unchanged apart from the new time-of-day prefix.
- [P9.3] Optional profile fields at signup (nickname, home city, vehicle type, primary provider) —
  minimal & skippable so signup conversion isn't hurt; stored on-device (settings), feed future insights.
- [P9.4] Personalized empty-state + toasts (use first name), personalized insights framing. Empty-state welcome
  title done — STAGED 2026-07-07 (APP_VERSION 2.6.9 / SW v1.6.13): `onboard_welcome_title_named` EN+TH key
  ("Welcome, {name}!"), applied in `applyLang()` right after the greeting block via the same safe
  replacer-function interpolation, only when a non-guest firstName exists; generic title untouched otherwise.
  Toasts + personalized insights framing still open.
- [P9.5] Editable profile in Settings→Account (name/city/vehicle), so data isn't register-only.
  First-name editing done — STAGED 2026-07-08 (APP_VERSION 2.6.9->2.6.10 / SW v1.6.13->v1.6.14): new
  inline name field + Save button in Settings→Account (non-guest only), persisted via the same paths as
  registration (`pb_firstName_<uid>` localStorage for Sync accounts, `dbGet`/`dbPut` round-trip on the
  `users` IndexedDB record for local accounts); `applyLang()` re-run after save so the greeting and
  empty-state title update immediately, no reload needed. City/vehicle fields still open.
- Privacy note: app is local-first/on-device; keep new fields OPTIONAL, never required beyond first name,
  no new data leaves the device; advisor-security/privacy reviews any field that would sync.

## P9.6 — Customer-persona data (Grit-decided 2026-07-07) — OFF-DEVICE, consent-gated, phased
Decisions: use = OFF-DEVICE analytics/marketing; fields = Driving profile + Demographics + Contact/marketing
(all OPTIONAL); UX = optional post-signup ONBOARDING step + editable SETTINGS→Profile; destination = QUEUE
on-device now, transmit only when a backend (PocketBase/endpoint) is live.
HARD privacy rules (GDPR + Thailand PDPA; user is data controller):
- EXPLICIT separate opt-in consent ("share my profile for analytics/marketing"), default OFF, plain-language,
  links to privacy policy, REVOCABLE. NO persona data is queued or transmitted without it.
- Currently NO backend -> nothing actually leaves the device; consented profiles queue (dormant) in the outbox
  and need a matching PocketBase `personas` collection when P1 backend goes live (documented follow-up).
- Privacy policy (privacy.html + in-app copy, EN+TH) must disclose: what's collected, why, where it goes,
  retention, third parties, and rights (access/delete/withdraw). Account-delete + withdraw-consent must PURGE
  persona data + any queued persona items.
Fields (all optional): driving profile (vehicle_type, platform/provider[multi], employment full/part-time,
years_driving, hours_per_week, city/region); demographics (age_range, gender); contact/marketing (phone,
marketing_email_optin).
Slices: S1 = data model + explicit consent gate + on-device storage + Settings→Profile editor + consent/privacy
copy + queue-when-consented stub (dormant). S2 = optional onboarding step (reuse S1 fields/consent). S3 =
full privacy.html rewrite + withdraw/delete-profile data-rights polish.

S1 — DONE, staged 2026-07-07 (APP_VERSION 2.6.9->2.6.10 / SW v1.6.13->v1.6.14). Implemented in site/app.js +
site/app.html + site/sw.js: `persona`/`personaConsent` in-memory state loaded per-user (never for guests) from
the existing `settings` IndexedDB store under `${uid}:persona` / `${uid}:persona_consent` keys — no new store,
no DB_VER bump. `personaConsent.granted` defaults false for every account. `savePersonaField()` never touches
the outbox; the ONLY write path to it is `queuePersonaSnapshot()`, called solely from the ON-branch of
`togglePersonaConsent()` — it purges any prior queued row first so at most one persona item ever sits in the
outbox. Turning consent OFF (or `purgePersonaData()`) calls `purgePersonaQueue()` synchronously. `pushOutbox()`
additionally hardens this structurally: its per-item loop skips (`continue`) any `op==='persona-queue'` row
regardless of `Sync.enabled()/authed()` — dormant until a future slice adds a real PocketBase `personas`
collection (not in the `COLLECTION` map today) and deliberately removes that guard. New `purgePersonaData()`
resets the on-device persona object, forces consent back to OFF, and purges the queue in one call — no
account-delete feature exists yet in this codebase; **any future account-delete flow MUST call
`purgePersonaData()`**. Wired today to a user-facing "Delete my profile data" control (confirm-gated) in the
new Settings→Profile section, since that's the closest existing equivalent. All fields optional, guest excluded
(section hidden + no `guest:persona`/`guest:persona_consent` rows ever written), EN+TH i18n parity for every new
key. `privacy.html` intentionally NOT rewritten this slice (S3) — the in-app consent copy under the toggle
carries the accurate what/why/where/rights disclosure for now.
