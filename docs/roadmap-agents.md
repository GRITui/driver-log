# DriverLog — Roadmap & Agent Assignments

**Product:** DriverLog · [driverlog.link](https://driverlog.link) · Hosted on Hostinger
**Approach:** Web-based app (Android-first, PWA → TWA)
**Last updated:** 7 July 2026 · App at v2.6.6 (SW v1.6.10) · agent roster synced to `.claude/agents/` (36 agents, 3 squads) · Saver (local-llm) tier enabled 2026-07-07 (option B: internal triage/nudge decisioning only; localization stays hosted)

Status key: 🟢 done/live · 🟡 built, blocked on an external/account step · ⚪ not started

---

## Agent org chart (current roster)

The live agents in `.claude/agents/` — **36 agents across 3 squads** (each squad has its own
shared-rules file). Model tier is from each agent's frontmatter. This table is the source of truth
for *who exists*; the roadmap tables further down are *what they work on*.

**Tier ladder (model → effort):** `opus`→Medium · `sonnet`/`haiku`→Low · **`local-llm`→Saver** (new
floor). The **Saver** tier runs a **local LLM** (phi4-mini via Ollama, $0 marginal cost) at below-Low
effort — but **only for internal, non-user-facing decisioning** (option B, below). Agents keep their
`haiku` frontmatter; Saver is a helper the dev loop *calls* for a cheap classification step, whose
output is staged for hosted review — it never authors/translates user-facing text.

> **✅ Saver enabled 2026-07-07 — narrow scope (option B).** A 2026-07-07 test found local models
> **cannot generate** shippable Thai (phi4-mini scrambles it — "Weekly earnings recap" →
> `ประจำสัปดาห์ยอดกำไรสรุป`; qwen3:4b returns empty, its output eaten by hidden `<think>` tokens), so
> **`localization` was removed from Saver and stays on hosted `haiku`.** But the same test found
> phi4-mini is **reliable at enum classification** (feedback triage: 5/5 correct). So Saver is enabled
> for two internal consumers only, via a local **classifier helper** (`automation/saver-classify.py`,
> direct Ollama — no LiteLLM/proxy needed): **`community-support`** feedback triage (free text →
> `{category, priority}`) and **`retention-lifecycle`** nudge selection (state → template id, *pure
> deterministic rules, no model*). Output is staged to `automation/saver-triage.md` for a hosted
> community-support/PM/QA pass — `qa-testing` stays hosted. Nothing user-facing; nothing under `site/`
> is touched. Run: `automation/driverlog-saver-pass.sh` (opt-in, not auto-scheduled).

### Squad A — DriverLog core product · `_shared-rules.md`

Flat crew reporting to the Product Manager; each owns a slice of the app.

| Layer | Agent | Model | Effort | Owns |
|-------|-------|-------|--------|------|
| Lead | `product-manager` | opus | Medium | Roadmap + prioritization; assigns every other agent |
| Build | `mobile-engineer` | sonnet | Low | PWA/Android surface (manifest, sw.js, icons, TWA) |
| Build | `backend-sync` | opus | Medium | Login, offline storage, cross-device sync correctness (P1) |
| Build | `personal-finance-coach` | sonnet | Low | "Is this shift profitable?" insight logic (P6) — retention hook |
| Build | `data-analyst` | sonnet | Low | CSV export quality (P8), fleet B2B tier spec |
| Build | `ux-design` | sonnet | Low | Dark mode, onboarding, spacing/typography, brand assets |
| Build | `localization` | haiku | Low | EN/TH i18n dictionary, currency/number formatting (NOT Saver — local models fail Thai) |
| Ship | `devops-deployment` | sonnet | Low | Local build/packaging plumbing (zip, Bubblewrap, Compose) — never live-deploys |
| Revenue | `monetization` | opus | Medium | AdSense unit, Consent Mode v2, affiliate placements |
| Revenue | `growth-acquisition` | sonnet | Low | ASO prep, store-listing drafts, soft-launch planning |
| Revenue | `market-research` | sonnet | Low | Competitive/market context for PM + Monetization |
| Lifecycle | `retention-lifecycle` | haiku +Saver✅ (rules) | Low | Shift reminders, weekly recap, tax-time summary — nudge selection via local rules |
| Lifecycle | `community-support` | haiku +Saver✅ (triage) | Low | In-app feedback intake + FAQ/help copy (also customer support) — triage via local phi4-mini |
| Gate | `security-privacy` | opus | Medium | Consent flow, privacy pages, PII/data-handling review |
| Gate | `qa-testing` | haiku | Low | QA gate for every change before it's logged done |

### Squad B — Chatbot (`driverlog.link/chat`, PHP proxy → Anthropic API) · `_chatbot-rules.md`

PM decomposes into tasks; each task runs a **junior → senior → advisor** trio (prototype → harden →
QA sign-off). The two `advisor-*` agents are shared QA gates across tasks.

| Layer | Agent | Model | Effort | Task / role |
|-------|-------|-------|--------|-------------|
| Lead | `chatbot-pm` | opus | Medium | Decomposes the build, assigns the trios, decides (no feature code) |
| Junior | `junior-auth-config` | sonnet | Low | `auth-config` — prototype PHP login/session/CSRF/rate-limit |
| Senior | `senior-auth-config` | sonnet | Low | `auth-config` — harden bcrypt/CSRF/session/.htaccess |
| Junior | `junior-chat-proxy` | sonnet | Low | `chat-proxy` — prototype thin PHP proxy to Messages API |
| Senior | `senior-chat-proxy` | sonnet | Low | `chat-proxy` — harden input validation, cURL, secret hygiene |
| Junior | `junior-chat-ui` | sonnet | Low | `chat-ui` — prototype static login + chat UI |
| Senior | `senior-chat-ui` | sonnet | Low | `chat-ui` — harden XSS/fetch/a11y/subpath |
| Junior | `junior-chat-image` | sonnet | Low | `chat-image` — prototype multimodal image attach |
| Senior | `senior-chat-image` | sonnet | Low | `chat-image` — harden DoS/size/media-type integrity |
| Junior | `junior-chat-mcp` | sonnet | Low | `chat-mcp` — prototype MCP connector in the proxy |
| Senior | `senior-chat-mcp` | sonnet | Low | `chat-mcp` — harden additive-safety/validation/secrets |
| Junior | `junior-package-deploy` | sonnet | Low | `package-deploy` — prototype zip bundle + deploy guide |
| Senior | `senior-package-deploy` | sonnet | Low | `package-deploy` — harden secret-exclusion assertion |
| Advisor | `advisor-security` | opus | Medium | Shared QA gate: auth-config, chat-proxy, package-deploy (+ mcp/image security) |
| Advisor | `advisor-ui` | opus | Medium | Shared QA gate: chat-ui (+ image UI) — XSS/contract/a11y |

### Squad C — Drivee LOCAL orchestrator (architecture "B") · `_drivee-local-rules.md`

Retires the PHP proxy as the brain: same static UI, but the brain is a local Node service
(Phi-4-mini via Ollama + `ask_claude` MCP tool → `claude -p`), reached through a Cloudflare Tunnel.
**junior → senior** pairs (no separate advisor; hardening covers the gate).

| Layer | Agent | Model | Effort | Task / role |
|-------|-------|-------|--------|-------------|
| Junior | `junior-orchestrator` | sonnet | Low | `orchestrator` — prototype Node service (MCP + brain + HTTP/auth) |
| Senior | `senior-orchestrator` | sonnet | Low | `orchestrator` — harden `ask_claude` sandbox + auth (public API) |
| Junior | `junior-tunnel-deploy` | sonnet | Low | `tunnel-deploy` — prototype Cloudflare Tunnel + launchd + runbook |
| Senior | `senior-tunnel-deploy` | sonnet | Low | `tunnel-deploy` — harden exposure safety + secret hygiene |
| Junior | `junior-ui-repoint` | sonnet | Low | `ui-repoint` — point Drivee UI at the local Node API (Bearer) |
| Senior | `senior-ui-repoint` | sonnet | Low | `ui-repoint` — harden token handling + no-regression |

**Tier totals** — *frontmatter model (all 36 agents):* opus ×7 (Medium) · sonnet ×25 (Low) · haiku
×4 (Low) = 36 (Squad A ×15, B ×15, C ×6). Frontmatter is unchanged by Saver. **Saver (option B,
enabled)** is not a frontmatter tier — it's a $0 local-model helper that **2 agents** call for
internal decisioning: `community-support` (feedback triage, phi4-mini classifier) and
`retention-lifecycle` (nudge selection, deterministic rules). `localization` is NOT on Saver (local
models fail Thai). Effort rule: **opus → Medium, sonnet/haiku → Low**; the Saver helper runs
below-Low on internal, non-user-facing work only.

---

## Roadmap → Agent assignments

Lead agent owns the item; support agents assist.

| # | Roadmap item | Status | Lead agent | Notes |
|---|--------------|--------|-----------|-------|
| P1 | Cross-platform login + sync engine | 🟡 | Backend / Sync | Full PocketBase sync engine built (outbox, last-write-wins, cuid dedupe). Shipped **local-only** (accounts + guest work on-device); cloud sync activates once PocketBase is hosted on a public HTTPS box. Firebase-swappable adapter. |
| P2 | Android app (PWA → TWA) | 🟢 | Mobile Engineer | PWA live: manifest, service worker, offline, installable, icons. TWA/Bubblewrap config generated. |
| P3 | Offline entry + background sync | 🟢 | Backend / Sync | Offline IndexedDB writes + outbox + Background Sync + status badges live. Server-push half turns on with P1 backend. |
| P4 | Play Store packaging + launch | 🟡 | DevOps / Deployment | `.aab` packaging, `assetlinks.json`, listing checklist ready. Blocked on $25 Google account + signing fingerprint. |
| P5 | Monetize without user subscription | 🟢 | Monetization | AdSense ad unit live on dashboard (real slot 9769218389), Consent Mode v2 + EU consent policy adopted. Pending: AdSense account approval + publish GDPR message. |
| P6 | "Is this shift profitable?" insights | 🟢 | Personal Finance Coach | Profit margin, ฿/km, ฿/hour, break-even fuel, verdict + coach tip; per-session margin badge. |
| P7 | Expand to other gig workers | ⚪ | Product Manager | Not started. Groundwork: sessions now carry a `provider` field. |
| P8 | Data export + fleet B2B tier | 🟡 | Data Analyst | CSV export live (now with provider/type/start-end times; free-text fields escaped + formula-injection-safe as of 6 Jul; UTF-8 BOM added 7 Jul so ฿/Thai text render in Excel). **Local JSON Backup export + RESTORE added 7 Jul** (export: full sessions+fuel+settings → downloadable .json; **restore/import 08:05**: read a backup back in, DriverLog-file-validated + confirm-gated, overwrites this account's sessions+fuel only — together they close "lose your phone, lose your logbook" locally without the blocked cloud backend). Fleet B2B tier not started. |

---

## Shipped changelog (v2.x)

- **v2.0–2.1** — PWA foundation (P2), offline + outbox sync engine (P3), PocketBase login/sync built then parked local-only (P1), Play Store packaging assets (P4).
- **v2.2** — Full **Thai/English i18n** across every screen + dynamic data (Localization Agent); **Cancel** control on the log-session modal (Mobile Engineer); guest login → "Guest######" running id; high-contrast guest button.
- **v2.3** — **P6 profitability insights**; session **Start/End time** + earning-per-hour + period-over-period change; **image export fixed to real .jpg**; then 15-min time steps, **cross-date night shifts**, and **two-level service type** (Provider → Type) via a FRAMEWORK.md `.sh` patcher.
- **v2.4** — **P5 ads**: dashboard AdSense unit; publisher switched to ca-pub-3349895945204021.
- **v2.5** — **EU User Consent Policy** adopted (Consent Mode v2 default-denied + privacy disclosure); real ad slot wired in. In-app **Privacy policy** link + clean `/privacy` URL.
- **v2.6** *(staged, not yet deployed)* — **Dark mode** (Light/Dark/Auto, UX/Design); in-app **Send feedback** (Support); **Monthly tax-ready CSV export** with ฿/hour (Data Analyst). All localized EN/TH. Delivered as `update-v2.6-sprint.sh`.

## Backlog (added this sprint — 🟡 = blocked on an external step)

| Item | Lead agent | Status | Note |
|------|-----------|--------|------|
| Push notifications (shift reminder, weekly recap) | Retention & Lifecycle | 🟡 | Needs **FCM** server key + a push endpoint (external). Placeholder only; build once backend (P1) is live. |
| Multi-vehicle tracking | Mobile Engineer | 🟢 | Shipped 5 Jul 2026: optional `vehicle` field on add/edit modal, persisted through save + sync (toServer/fromServer), dropdown filter above Sessions list (auto-hides if unused), EN/TH i18n, backward-compatible. Staged locally, not deployed. |
| Multi-currency (display) | Localization | 🟡 | Symbol/format selectable now; live FX conversion needs a rates API (external) — placeholder. |
| First-run onboarding flow | UX / Design | 🟢 | Shipped 5 Jul 2026: welcome empty-state + CTA on dashboard when sessions.length===0, EN/TH, staged locally (not yet deployed). |
| Weekly earnings recap card | Personal Finance Coach | 🟢 | Shipped 5 Jul 2026: net earnings + shift count + %Δ vs last week, EN/TH, staged locally (not yet deployed). |
| Affiliate placement (fuel card / insurance) | Monetization | 🟡 | Needs partner/affiliate accounts (external). Placeholder card slot. |
| Shift reminders (push notification prep) | Retention & Lifecycle | 🟡 | Shipped 5 Jul 2026: local-only "Shift reminders" toggle in Settings, preference stored in `localStorage.reminder_pref`, EN/TH i18n, helper text notes real notifications need app permission (coming soon). No FCM/server wiring — build once backend (P1) is live. Staged locally, not deployed. |
| Consent withdrawal control (GDPR) | Security & Privacy | 🟢 | Shipped 5 Jul 2026: "Ad & cookie consent" row in Settings lets a driver re-open the consent banner and change/withdraw a prior Accept/Reject choice (was previously locked forever in `localStorage.consent_choice`). `manageConsent()` + `refreshConsentStatusLabel()` in app.js, EN/TH i18n, no change to consent defaults or gtag payloads. Closes the "withdrawal must be as easy as granting" compliance gap on the now-live consent banner. **Staged locally, NOT deployed — coordinate deploy through user (prod is live).** |

## Now / Next

1. **Account tasks to unlock revenue & launch** (yours, not code): AdSense site approval + publish the GDPR consent message; Google Play $25 account + assetlinks fingerprint.
2. **P1 cloud sync** — stand up PocketBase on a $5 VPS (or Cloudflare Tunnel), set `PB_URL`, flip sync on.
3. **P7** — generalize "Driver Log" → "Gig Log": per-worker vocabulary + cost categories (the `provider` field is the first step).
4. **P8 B2B** — fleet dashboard aggregating multiple drivers (pairs with the sync backend).

---

## Ongoing responsibilities

| Function | Lead agent | Supporting agents |
|----------|-----------|-------------------|
| Roadmap & prioritization | Product Manager Agent | all |
| Growth / app-store optimization | Growth / Acquisition Agent | Community, UX/Design |
| Retention & lifecycle | Retention & Lifecycle Agent | Personal Finance Coach |
| Security & privacy (the trust moat) | Security & Privacy Agent | Backend/Sync |
| Localization (currency / units / language) | Localization Agent | UX/Design |
| Support & QA | Customer Support Agent | QA/Testing |

---

## Start-lean crew (assign these 5 first)

1. **Product Manager Agent** — owns the roadmap and priorities
2. **Mobile Engineer Agent** — builds the Android/PWA app
3. **Backend / Sync Agent** — login, cross-platform data, offline sync
4. **Personal Finance Coach Agent** — the user-facing hook ("is this shift profitable?")
5. **Monetization Agent** — makes money without charging drivers

This covers building it, shipping it, hooking users, and paying for it.

---

## Suggested model + effort per agent (token-efficient)

Rule: assign the smallest model that still does the job well; building and analysis on Sonnet, high-stakes reasoning on Opus, high-volume roles on Haiku, and the **Saver** helper (local phi4-mini, $0) for internal, non-user-facing *classification* only. **Effort is capped at Low–Medium for hosted tiers** (no High) to prioritize token efficiency, with **Saver** a below-Low floor for the offloaded classification step. Effort rule: **opus → Medium, sonnet/haiku → Low**. The opus/sonnet/haiku assignments match the frontmatter `model:` of each file in `.claude/agents/`; Saver does **not** change frontmatter — it's a helper 2 agents call (see below).

**Saver tier (local-llm), added + enabled 2026-07-07 — option B (narrow):** a $0 local classifier (**phi4-mini** via Ollama, direct `/api/chat` — no LiteLLM/proxy) used for **internal, non-user-facing decisioning only**:
- **`community-support`** — feedback **triage**: free text → `{category ∈ [bug, feature_request, ux_complaint, praise, question, other], priority}`. Acceptance test 2026-07-07: **5/5 correct**.
- **`retention-lifecycle`** — nudge **selection**: driver state → template id ∈ `[shift_reminder, weekly_recap, tax_reminder, none]`. **Pure deterministic rules, no model call** — the nudge *text* is a pre-translated i18n template, so nothing model-authored reaches a user.

`localization` was **dropped from Saver** — local models fail Thai *generation* (phi4-mini scrambles it; qwen3:4b returns empty), and localization ships user-facing Thai. It stays on hosted `haiku`. `qa-testing` also stays hosted (gate reliability). Mechanism: `automation/saver-classify.py` (stdlib-only classifier, whitelist-validated output, off-enum/model-down → safe `other` fallback) invoked by `automation/driverlog-saver-pass.sh` (opt-in, Ollama-up guarded, **not** auto-scheduled). Output is staged to `automation/saver-triage.md` for a **hosted** community-support/PM/QA pass to promote into `docs/roadmap-next.md`; the helper writes nothing under `site/`/`android/`.

**2026-07-05 revision, reverted:** briefly tried moving 4 roles (Retention & Lifecycle, Community, Localization, QA/Testing) to a local qwen3:4b model via Ollama + a LiteLLM proxy. Rolled back same day — all agents are back on their original Anthropic tiers below. The CLI scheduler (`automation/driverlog-dev-loop.sh`) still runs locally via the `claude` CLI in a cron-style loop, but every agent now calls the normal Anthropic API directly; there's no local-model proxy step anymore.

Only Squad A (core product) carries per-role rationale — the Chatbot (B) and Drivee orchestrator (C) squads follow a fixed **trio discipline** instead: `junior-*` and `senior-*` = Sonnet/Low (prototype then harden), the `advisor-*` gates and both PMs (`chatbot-pm`) = Opus/Medium. See the org-chart tables above for the full per-agent list of B and C.

| Agent | Suggested model tier | Effort | Why |
|-------|----------------|--------|-----|
| `product-manager` | Opus (largest/reasoning tier) | Medium | Prioritization & trade-offs need deepest reasoning of the roster |
| `market-research` | Sonnet (mid tier) | Low | Synthesis + web research, balanced cost |
| `monetization` | Opus (largest/reasoning tier) | Medium | Deal modeling, protects "free for users" logic |
| `growth-acquisition` | Sonnet (mid tier) | Low | Campaigns, ASO — solid mid-tier |
| `retention-lifecycle` | haiku · +Saver✅ (rules) | Low | Rule-based nudges — nudge *selection* runs as deterministic local rules ($0); nudge text stays hosted i18n templates |
| `community-support` | haiku · +Saver✅ (triage) | Low | Feedback triage + in-app help (folds in old "Customer Support") — triage classification offloaded to local phi4-mini ($0) |
| `mobile-engineer` | Sonnet (mid tier) | Low | Strong coding at good efficiency |
| `backend-sync` | Opus (largest/reasoning tier) | Medium | Auth + sync correctness is high-stakes |
| `devops-deployment` | Sonnet (mid tier) | Low | Scripted, repeatable deploys |
| `qa-testing` | Haiku (smallest/fastest tier) | Low | High-volume checks, cheap per run — stays hosted (gate reliability), not Saver |
| `security-privacy` | Opus (largest/reasoning tier) | Medium | Highest stakes — the trust moat |
| `data-analyst` | Sonnet (mid tier) | Low | Queries + benchmarks, balanced |
| `personal-finance-coach` | Sonnet (mid tier) | Low | User-facing accuracy at scale; Haiku for simple alerts |
| `ux-design` | Sonnet (mid tier) | Low | Flows & copy, balanced |
| `localization` | haiku | Low | Translation / formatting, high volume — NOT Saver: local models failed Thai-accuracy acceptance (2026-07-07); stays hosted |

Note: tiers are named generically (Opus/Sonnet/Haiku family) rather than pinned to a specific version — always use the current/latest model available in each tier so the roster adopts new model releases automatically without needing this doc updated.

**Cost pattern:** Opus for the 7 high-stakes reasoning/review seats — 4 in core product (`product-manager`, `monetization`, `backend-sync`, `security-privacy`) plus the 3 chatbot gates/lead (`chatbot-pm`, `advisor-security`, `advisor-ui`) — all capped at Medium effort, not High. Sonnet building/analysis (×25) and the 4 Haiku roles run at Low. On top of that, **Saver (option B)** shaves the highest-volume classification off the hosted bill: `community-support` triage runs on local phi4-mini and `retention-lifecycle` nudge-selection on local rules — both $0. `localization` stays hosted Haiku (local models fail Thai). Net: spend concentrates on the 7 Opus seats, everything else is Sonnet-or-cheaper, and the highest-volume internal classification is offloaded to a free local model.

**Scheduling:** this project's dev cycle runs via a CLI cron loop (`automation/driverlog-dev-loop.sh`), not the Cowork GUI scheduled task — a single `claude -p` call per cycle against the Anthropic API, run unattended with `--dangerously-skip-permissions`. See that script for the cloud/local split per pass.

---

*Living document — reassign as the team and usage data grow.*
