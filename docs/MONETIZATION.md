# DriverLog — Monetization (P5)

**Principle:** DriverLog stays **free for drivers — no subscription, ever.** Revenue comes
from ads and partnerships that don't put the core logging behind a paywall.

## Shipped now — display ads (AdSense)

A single, non-intrusive **responsive ad unit** sits at the bottom of the dashboard
(below "Top earning days"), labeled "Sponsored" / "โฆษณา". It's placed *after* the data a
driver came to see, never blocking session logging, and the container reserves height to
avoid layout shift. Ads are already excluded from the offline cache (service worker).

**You must do one thing to turn on revenue:**
1. In your AdSense account (publisher `ca-pub-3349895945204021`), create a **Display ad unit**.
2. Copy its **ad slot id** (a 10-digit number).
3. In `site/index.html`, set to real ad-unit slot 9769218389 (done).
4. Redeploy `site/`.

Until then the slot renders empty (no errors). AdSense also requires the site/domain to be
**approved** in your account, and ads only serve on the live `driverlog.link` domain.

## Consent — Google EU User Consent Policy (required for EEA / UK / Switzerland)

Serving ads to users in the EEA, UK, or Switzerland requires a **Google-certified Consent
Management Platform (CMP)** integrated with the IAB TCF. Two parts:

1. **Code (done, shipped):** `index.html` now sets **Google Consent Mode v2** to *denied* by
   default (ad_storage, ad_user_data, ad_personalization, analytics_storage) until consent is
   granted. `privacy.html` discloses consent handling and the opt-out path.
2. **Account (you must do this):** in AdSense → **Privacy & messaging**, create and publish the
   **European regulations (GDPR) message**. Google's own message is a certified CMP (TCF CMP ID
   300) and is free — once published it auto-shows the consent banner to EEA/UK/CH visitors
   through the AdSense tag already on the page, and updates Consent Mode automatically. Also
   publish a **California (CCPA)** message if you want US-state coverage. Ref:
   https://support.google.com/adsense/answer/13554116

Without a published certified CMP, EEA/UK/CH traffic is limited to non-personalized / limited
ads (or none), so publishing the message is what unlocks full ad revenue there.

**UX guardrails to keep:** one ad per screen max; never inside the log-session modal or the
net-revenue hero; keep the "Sponsored" label; consider hiding the ad on a brand-new empty
dashboard so first-run onboarding stays clean (future tweak).

## Next non-subscription levers (backlog, in rough priority)

1. **Affiliate / referral placements** — fuel-station loyalty cards, motorbike/vehicle
   insurance, phone plans, EV charging. High relevance to drivers, better RPM than generic
   display. Implement as native "recommended" cards, clearly labeled.
2. **Sponsored provider tie-ins** — since sessions now tag a provider (Grab/Lineman/Bolt/
   Shopee/Taxi), there's room for provider-specific promos or sign-up bounties.
3. **Fleet / B2B tier (this is roadmap P8)** — fleet managers pay for aggregated dashboards
   and CSV/API export across many drivers. The drivers' app stays free; the *business* pays.
4. **Voluntary "tip jar" / one-time supporter unlock** — optional cosmetic (themes, extra
   export formats) for drivers who want to chip in. Never gates core features.

## Measurement
Once live, watch AdSense RPM and CTR by screen, and keep an eye on retention — if ads dent
day-2 retention, dial back frequency. The whole point is a free tool drivers keep using.
