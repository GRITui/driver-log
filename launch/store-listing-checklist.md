# DriverLog — Play Store launch checklist

## Gate (must pass before packaging)
- [ ] Lighthouse PWA category all green (installable, manifest, SW, HTTPS).
- [ ] Offline: create/edit/delete works in airplane mode; entries show "• saved".
- [ ] Reconnect: entries push automatically; badge flips to ✓.
- [ ] Two-device: edit on A → appears on B (last-write-wins, no data loss).
- [ ] `driverlog.link/.well-known/assetlinks.json` reachable and fingerprint matches Play signing key.

## Store listing assets
- [ ] App icon 512×512 (use `site/icons/icon-512.png`).
- [ ] Feature graphic 1024×500 (needs to be created — brand red, steering-wheel mark + "DriverLog").
- [ ] ≥2 phone screenshots (dashboard, session logging) captured in standalone mode (no address bar).
- [ ] Short description (≤80 chars), e.g. "Track earnings, fuel & driving insights. Free & offline."
- [ ] Full description (TH + EN recommended for the driver audience).
- [ ] App category: Finance or Business/Productivity.
- [ ] Contact email: grit4game@gmail.com.

## Compliance forms
- [ ] **Privacy policy URL** → `https://driverlog.link/privacy.html` (already built).
- [ ] **Data safety form:** declare collected data = email (account), app activity /
      driving entries; encrypted in transit; user can request deletion; ads via Google.
- [ ] **Content rating** questionnaire completed (expected: Everyone).
- [ ] **Ads** declaration: Yes (Google AdSense present).
- [ ] Target audience: adults / working drivers (not children).

## Release
- [ ] Upload `.aab` to **Internal testing**; test on ≥2 physical devices/screen sizes.
- [ ] Promote to **Closed testing** → soft-launch to a small driver group; gather feedback.
- [ ] Promote to **Production**.

## Post-launch
- [ ] Confirm content updates propagate by redeploying the site (no resubmission).
- [ ] Monitor Play Console vitals (ANRs, crashes) and reviews.
