# DriverLog Scheduler Workflow — Status (5 Jul 2026)

Runs via CLI cron loop `automation/driverlog-dev-loop.sh` (single `claude -p` call per cycle, `--dangerously-skip-permissions`) — not the Cowork GUI scheduler. All agents call the Anthropic API directly (Cloud); the earlier Ollama/qwen3:4b local-model trial was rolled back same day.

| Agent | Job | Model / Tag | Frequency | Effort |
|---|---|---|---|---|
| Product Manager | Roadmap & prioritization, picks next small item each cycle | Opus (largest/reasoning) — Cloud | Every cycle (30-min loop, off-peak windows only) | Medium |
| Monetization | Ad/affiliate revenue, protects "free for users" logic | Opus (largest/reasoning) — Cloud | Per cycle as needed | Medium |
| Backend / Sync | Auth + sync correctness (PocketBase engine) | Opus (largest/reasoning) — Cloud | Per cycle as needed | Medium |
| Security & Privacy | Trust/compliance (GDPR consent, data handling) | Opus (largest/reasoning) — Cloud | Per cycle as needed | Medium |
| Mobile Engineer | Android/PWA build work | Sonnet (mid) — Cloud | Per cycle as needed | Low |
| DevOps / Deployment | Scripted, repeatable deploy prep (local-only, no live push) | Sonnet (mid) — Cloud | Per cycle as needed | Low |
| Data Analyst | Queries, CSV export, benchmarks | Sonnet (mid) — Cloud | Per cycle as needed | Low |
| Personal Finance Coach | User-facing profitability features | Sonnet (mid) — Cloud | Per cycle as needed | Low |
| UX / Design | Flows, copy, dark mode, onboarding | Sonnet (mid) — Cloud | Per cycle as needed | Low |
| Growth / Acquisition | Campaigns, ASO | Sonnet (mid) — Cloud | Per cycle as needed | Low |
| Market Research | Synthesis + web research | Sonnet (mid) — Cloud | Per cycle as needed | Low |
| QA / Testing | Gate: every change must pass before logged done | Haiku (smallest/fastest) — Cloud | Every cycle (gate step) | Low |
| Retention & Lifecycle | High-volume nudges (reminders, recap) | Haiku (smallest/fastest) — Cloud | Per cycle as needed | Low |
| Community / Support | Feedback triage, in-app help | Haiku (smallest/fastest) — Cloud | Per cycle as needed | Low |
| Localization | Translation/formatting (EN/TH) | Haiku (smallest/fastest) — Cloud | Per cycle as needed | Low |

**Cadence:** `*/30 1-4,11-18 * * *` — every 30 min, off-peak only (1–5am and 11am–7pm local), avoiding user's 5–11am and 7pm–1am peak hours.

**Hard rule:** no agent may call the Hostinger deploy connector or touch driverlog.link directly — all builds/verifies stay local (site/ or android/ + emulator); Android is debug-APK-only, no Play signing/submission.

## Next priorities (from Product Manager's Now/Next + roadmap-next.md)

1. **Phase 0 — unblock what's already built (account-only, ~$25):** publish AdSense GDPR consent message + submit driverlog.link for AdSense review; create Google Play $25 developer account, add `assetlinks.json` fingerprint, submit to Internal testing.
2. **Phase 1 — P1 cloud sync:** stand up PocketBase on a small VPS (~$5/mo), set `PB_URL`, flip sync from local-only to live — biggest retention/trust unlock, also a prerequisite for P8 (fleet B2B).
3. **Bundle + deploy the staged hotfix batch:** stale-root-caching fix (`.htaccess` no-cache on HTML entry docs), affiliate placeholder card, FAB fix, dark mode, feedback link, monthly tax-CSV export — all built and QA'd but sitting undeployed; needs user-coordinated deploy since prod is live.
4. **Phase 2 — soft launch:** 10–30 real Thai drivers via Play closed testing/direct link, with an in-app feedback link, once Phase 0/1 land.
5. **Deprioritized for now:** P7 (Gig Log generalization) and P8 (fleet B2B) — explicitly hold until Phase 2 usage data justifies them.
