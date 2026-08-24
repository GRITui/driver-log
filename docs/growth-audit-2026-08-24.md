# Growth & monetization readiness audit — 2026-08-24

Read-only audit ahead of Play soft launch. Every claim cites live evidence
(curl of production URLs, HTTP status in parentheses) or repo files.

## 1. SEO / discoverability — **GAP (being fixed in this PR)**

| Check | Evidence | Verdict |
|---|---|---|
| robots.txt | `GET /robots.txt` → allows full crawl, mentions ads.txt crawlability | ✅ |
| sitemap.xml | `GET /sitemap.xml` → **404** | ❌ gap |
| Title/meta desc | `<title>DriverLog — Driver Log Book` + description meta present on `/` | ✅ |
| Open Graph / social tags | none found on `/` (grep og:) | ⚠️ weak sharing previews |
| hreflang | absent; TH content is inline-translated, no separate URLs | ℹ️ acceptable at this scale |

**Fixed here:** `site/sitemap.xml` added (index, /info/, all 3 guides, /privacy)
+ `Sitemap:` line in robots.txt. Still open: OG/Twitter meta tags (S effort).

## 2. AdSense readiness — **PARTIAL**

| Check | Evidence | Verdict |
|---|---|---|
| ads.txt | `GET /ads.txt` → `google.com, pub-3349895945204021, DIRECT, f08c47fec0942fa0` | ✅ well-formed |
| Ad units on guides | per `docs/MONETIZATION.md` (slot 9769218389 on guide pages); dashboard unit removed on policy grounds | ✅ matches docs |
| Content depth | only **3 guide pages** (`calculate-profit`, `choosing-app`, `fuel-saving-tips` — all 200) | ⚠️ thin-content rejection risk |
| Privacy policy | `GET /privacy` → 200 | ✅ |
| Consent Mode | `app.html` carries `gtag('consent','default',…)` scaffolding; whether Google-side consent message is published is console state — **UNKNOWN, owner must check** | ⚠️ |

## 3. Analytics — **BLOCKER for learning**

Zero analytics property anywhere (`gtag` appears only as the Consent Mode
stub; grep across `/` and `/app.html`: no GA4/Plausible/Umami/Matomo).
`@vercel/speed-insights` covers Web Vitals only — not usage.
Soft launch without usage data = flying blind; roadmap Phase 2 depends on it.
**Recommendation:** one privacy-friendly property (Plausible EU cloud or a
single GA4 stream) loaded only after consent, given the existing gate. Effort M.

## 4. Feedback loop — **READY**

Settings ▸ feedback row already points to
`mailto:grit4game@gmail.com?subject=DriverLog%20feedback`. Upgrade path for
Thai LINE-first users later: LINE Official Account link (M).

## 5. LINE login external signals — **NOT TESTED**

Requires a real OAuth round-trip with credentials; out of scope for a
read-only audit. Docs were reconciled today (#51). Owner should smoke-test one
LINE login against prod before inviting testers.

## Top-5 quick wins (next 2 weeks, zero budget)

| # | Action | Effort | Why now |
|---|---|---|---|
| 1 | Land this PR's sitemap + submit to Google Search Console | S (done + clicks) | indexing starts before any campaign |
| 2 | Publish GDPR consent message in AdSense + submit site for review | S (console) | revenue clock starts at approval, which lags |
| 3 | Add OG/Twitter meta to index + guides | S | every shared link converts better |
| 4 | Install consent-gated analytics | M | Phase 2 "watch what drivers do" needs it day one |
| 5 | Grow info/guides 3 → 6–8 articles | M/L content | defends AdSense review; each guide is an SEO entry point |
