# DriverLog — Product Roadmap

**Product:** [driverlog.link](https://driverlog.link) · Hosted on Hostinger
**Purpose:** Help on-demand drivers track revenue, fuel, and the numbers that actually decide whether the job is worth it.
**Last updated:** 5 July 2026 · App live at v2.5

---

## North Star

Be the default financial + operations companion for on-demand workers — starting with drivers, then any gig where someone's income depends on tracking small transactions over time.

---

## Progress snapshot (5 Jul 2026)

The app is live at [driverlog.link](https://driverlog.link) as an installable, offline-first PWA. Detailed status lives in `roadmap-agents.md`; against this roadmap's priorities:

- **P1 Go native (Android/iOS):** 🟡 PWA→TWA path chosen and shipped — installable PWA with offline entry, service worker, and Play Store packaging assets ready. Play submission and any deeper native shell still pending. (iOS via PWA/Capacitor later.)
- **P2 Cross-platform login:** 🟡 Login + a full sync engine (PocketBase, Firebase-swappable) are built; shipped **local-only** for now (accounts + guest work on-device). Cloud sync flips on once the backend is hosted.
- **P3 Monetize (no subscription):** 🟢 In progress — AdSense ads live on the dashboard with EU consent policy (Consent Mode v2) adopted. Affiliate/partner + B2B levers still ahead.
- **P4 Expand beyond drivers:** ⚪ Not started; sessions now carry a `provider` field as groundwork.
- **P5 Cross-cutting foundations:** 🟢 CSV export live; full Thai/English localization done; privacy policy + consent posture public.

Also shipped along the way: "is this shift profitable?" insights (profit margin, ฿/hour, break-even fuel), start/end time with cross-date **night-shift** support, two-level **Provider → Type** service picker, and per-period change indicators.

---

## Priorities (ranked)

### P1 — Go native: Android & iOS apps
The single biggest unlock. Drivers live on their phones between rides; a web link doesn't survive that context.

- Ship a mobile app for Android first (larger driver share globally), then iOS.
- Recommended path: one codebase → **React Native** or **Flutter** so both platforms share logic. Keep the web app as the desktop/tablet dashboard.
- Must-have mobile-native features: offline entry (log fuel/revenue with no signal, sync later), background GPS for auto-mileage, push notifications, camera receipt capture, home-screen widget for "today's earnings."
- Success signal: a driver can log a full shift without ever opening a browser.

### P2 — Cross-platform login
Prerequisite for everything else. One identity, data everywhere.

- Central auth: email + social (Google/Apple sign-in are near-mandatory for app-store approval), plus phone-number OTP for drivers without email habits.
- Sync engine so web ↔ Android ↔ iOS stay consistent in real time.
- Do this **before or alongside** the mobile launch — retrofitting accounts later is painful.

### P3 — Monetize without charging users a subscription
Keep the product free for drivers; make money around them instead.

- **Affiliate / referral revenue:** fuel cards, cheaper insurance, EV charging networks, roadside assistance, car-maintenance shops, tax-prep services. Drivers already pay for these — earn a cut for sending qualified buyers.
- **Aggregate, anonymized data insights:** sell benchmark reports (regional earnings, fuel-cost trends) to fleets, researchers, or media — never individual data.
- **Tip jar / one-time "support the app":** optional, guilt-free.
- **Premium B2B tier:** free forever for individual drivers, paid dashboards for small fleet owners managing multiple drivers.
- **Non-intrusive partner offers:** relevant deals surfaced in-app, opt-in.
- Guardrail: never sell individual user data, never gate core tracking features. Trust is the moat.

### P4 — Expand beyond drivers to other on-demand workers
Same core loop (log income → log costs → see if it's worth it) applies broadly.

- Adjacent segments: delivery couriers (food/parcel), rideshare (already close), field service / handyman, cleaners, freelance trades, content/creator gig work.
- Approach: keep the tracking engine generic, swap the vocabulary and cost categories per worker type (e.g. "fuel" → "supplies" for a cleaner).
- Rename internal category from "Driver Log" concept to a flexible "Gig Log" model without breaking the DriverLog brand.

### P5 — Cross-cutting foundations (do continuously)
- Data export (CSV / tax-ready summaries) — high-value, low-cost, builds trust.
- Localization: currencies, languages, regional fuel units (L vs gal).
- Privacy & security posture strong enough to state publicly.

---

## Suggested sequencing

| Phase | Focus | Outcome |
|-------|-------|---------|
| **Now** | Cross-platform login + sync engine | One account, data everywhere |
| **Next** | Android app (offline entry, auto-mileage) | Drivers off the browser |
| **Next** | iOS app + affiliate monetization live | Revenue without charging users |
| **Later** | Data-export + fleet B2B tier | New revenue, retention |
| **Later** | Expand to couriers / other gig workers | Bigger market |

---

## Dream Team — Org Chart of AI Agents

If DriverLog runs on a "team" of specialized agents, here's the lineup. Grouped by function, with what each owns.

### Product & Strategy
- **Product Manager Agent** — owns the roadmap, prioritizes features, turns user feedback into specs.
- **Market Research Agent** — tracks gig-economy trends, competitor apps, regional driver conditions.
- **Pricing & Monetization Agent** — models affiliate deals, benchmarks partner offers, protects the "free for users" promise.

### Growth & Users
- **Growth / Acquisition Agent** — referral loops, app-store optimization, campaign ideas.
- **Retention & Lifecycle Agent** — onboarding flows, re-engagement pushes, churn watch.
- **Community Agent** — driver forums, feedback triage, testimonials.

### Engineering & Ops
- **Mobile Engineer Agent** — Android/iOS builds, offline sync, native features.
- **Backend / Sync Agent** — auth, cross-platform data consistency, APIs.
- **DevOps / Deployment Agent** — Hostinger deploys, uptime, DNS, releases.
- **QA / Testing Agent** — regression, edge cases (no signal, currency edge cases).
- **Security & Privacy Agent** — data protection, compliance, the trust moat.

### Data & Insight
- **Data Analyst Agent** — earnings benchmarks, anonymized insight reports (the P3 data product).
- **Personal Finance Coach Agent** — user-facing: "is this shift profitable?", tax-time nudges, cost alerts.

### Design & Support
- **UX / Design Agent** — mobile-first flows, one-tap logging, widgets.
- **Localization Agent** — languages, currencies, units per region.
- **Customer Support Agent** — in-app help, receipt/entry troubleshooting.

### The "MVP crew" if you can only start with 5
1. Product Manager Agent
2. Mobile Engineer Agent
3. Backend / Sync Agent
4. Personal Finance Coach Agent (the user-facing hook)
5. Monetization Agent

### Suggested model tier per agent (token-efficient)
Rule: assign the smallest model tier that still does the job well. High-volume, repetitive roles run on the lightweight tier; building and analysis on the mid tier; high-stakes reasoning on the top tier. Tiers are named generically so each agent can move to a newer model release within the same tier.

| Agent | Model tier | Why |
|-------|-----------|-----|
| Product Manager | Top (Opus) | Prioritization & trade-offs need deepest reasoning |
| Market Research | Mid (Sonnet) | Synthesis + web research, balanced cost |
| Monetization | Top (Opus) | Deal modeling, protects "free for users" logic |
| Growth / Acquisition | Mid (Sonnet) | Campaigns, ASO |
| Retention & Lifecycle | Light (Haiku) | High-volume, rule-based nudges |
| Community | Light (Haiku) | Feedback triage, high message volume |
| Mobile Engineer | Mid (Sonnet) | Strong coding at good efficiency |
| Backend / Sync | Top (Opus) | Auth + sync correctness is high-stakes |
| DevOps / Deployment | Mid (Sonnet) | Scripted, repeatable deploys |
| QA / Testing | Light (Haiku) | High-volume checks, cheap per run |
| Security & Privacy | Top (Opus) | Highest stakes — the trust moat |
| Data Analyst | Mid (Sonnet) | Queries + benchmarks, balanced |
| Personal Finance Coach | Mid (Sonnet) | User-facing accuracy; light tier for simple alerts |
| UX / Design | Mid (Sonnet) | Flows & copy, balanced |
| Localization | Light (Haiku) | Translation / formatting, high volume |
| Customer Support | Light (Haiku) | High-volume in-app help |

**Cost pattern:** top tier for the 4 high-stakes reasoning roles (PM, Monetization, Backend/Sync, Security), mid tier for building and analysis, light tier for high-volume repetitive roles — keeping most day-to-day token spend on the cheapest tier. As newer models release, upgrade each agent within its tier rather than changing the assignment.

---

*Living document — reprioritize as usage data comes in.*
