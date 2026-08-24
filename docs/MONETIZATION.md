# DriverLog — Monetization (P5)

**Principle:** DriverLog stays **free for drivers — no subscription, ever.** Revenue comes
from ads and partnerships that don't put the core logging behind a paywall.

*Last reconciled with the codebase: 24 Aug 2026.* Earlier versions of this file described
a bottom-of-dashboard ad unit, listed affiliate placement as an unbuilt lever, and
counted the fleet tier as future work — all superseded since. Current reality below.

## Shipped now — display ads (AdSense) on the info/ guide pages

Display ads run on the **content guide pages under `info/guides/`**
(`calculate-profit`, `choosing-app`, `fuel-saving-tips`), not inside the driver app:
Google policy prohibits ads on behavioral/tool screens, so the earlier
bottom-of-dashboard unit was **removed from `site/index.html`** (v2.10.1). The guides
load the AdSense tag for publisher `ca-pub-3349895945204021` and render responsive
units using ad slot **9769218389** (already set — nothing to configure).

**Still outstanding:** AdSense site review/approval for `driverlog.link`. Until the
domain is approved, slots render empty (no errors).

## Voluntary support — "Buy me a coffee" (shipped)

The driver dashboard (`site/app.html`) carries a clearly-labeled voluntary donation
card linking to `https://buymeacoffee.com/kritkritth9` (merged from PR #32,
`a7b0dc7`). It replaces both the old static "Fuel card partner — coming soon"
placeholder and the previously-considered affiliate/referral placements idea — a
direct support link won out over commission-based links. Never gates any feature.

## Shipped now — Fleet / B2B tier

The fleet tier is **live**, no longer roadmap P8: fleet owners create a fleet and
invite drivers (`api/fleet-*.js`, owner console at `site/fleet.html`) with aggregated
revenue/net/trips/km-per-L dashboards across active drivers. Creating/joining is free
and ungated — the originally-envisioned seat-based payment layer was never built
(track in `docs/BACKLOG.md` → "Fleet billing").

## Consent — Google EU User Consent Policy (required for EEA / UK / Switzerland)

Serving ads to users in the EEA, UK, or Switzerland requires a **Google-certified Consent
Management Platform (CMP)** integrated with the IAB TCF:

1. **Code (shipped):** the guide pages carry the AdSense tag, and by default consent is
   *denied* until granted — `site/privacy.html` discloses the certified-CMP handling and
   the opt-out path to visitors.
2. **Account (you must do this):** in AdSense → **Privacy & messaging**, create and publish
   the **European regulations (GDPR) message**. Google's own message is a certified CMP
   (TCF CMP ID 300) and is free — once published it auto-shows the consent banner to
   EEA/UK/CH visitors through the AdSense tag already on the page. Also publish a
   **California (CCPA)** message if you want US-state coverage. Ref:
   https://support.google.com/adsense/answer/13554116

Without a published certified CMP, EEA/UK/CH traffic is limited to non-personalized /
limited ads (or none), so publishing the message is what unlocks full ad revenue there.

## Remaining non-subscription levers (backlog, in rough priority)

1. **Sponsored provider tie-ins** — sessions tag a provider (Grab/Lineman/Bolt/
   Shopee/Taxi), so there's room for provider-specific promos or sign-up bounties.
2. **Fleet billing** — see above; the tier is live but monetization of it is undecided.
3. **Cosmetic supporter unlocks** — optional themes or extra export formats for drivers
   who want to chip in beyond the coffee link. Never gates core features.

## Measurement
Once live, watch AdSense RPM and CTR by screen, and keep an eye on retention — if ads dent
day-2 retention, dial back frequency. The whole point is a free tool drivers keep using.
