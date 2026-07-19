# DriverLog — Play Store launch checklist

## Gate (must pass before packaging)
- [ ] Lighthouse PWA category all green (installable, manifest, SW, HTTPS).
- [ ] Offline: create/edit/delete works in airplane mode; entries show "• saved".
- [ ] Reconnect: entries push automatically; badge flips to ✓.
- [ ] Two-device: edit on A → appears on B (last-write-wins, no data loss).
- [ ] `driverlog.link/.well-known/assetlinks.json` reachable and fingerprint matches Play signing key.

## Store listing assets
- [x] App icon 512×512 — `site/icons/icon-512.png` (already real brand art, confirmed).
- [x] Feature graphic 1024×500 — `launch/store-assets/feature-graphic.png` (brand gradient,
      the real icon mark + two-tone "DriverLog" wordmark, per brand/CI-brand-guidelines.html).
- [x] 2 phone screenshots — `launch/store-assets/screenshot-dashboard.png` and
      `screenshot-sessions.png`. Built from the real site/styles.css classes with
      realistic seeded data (not live IndexedDB — headless-Chrome IndexedDB timing
      wasn't reliable enough to seed via app.js's actual boot flow in this sandbox);
      visually authentic to the shipping CSS, not a live capture through app logic.
      Worth a real on-device recapture before final submission if time allows.
- [x] Short + full description (EN + TH) — drafted in `launch/store-copy.md`.
- [ ] App category: Finance or Business/Productivity.
- [ ] Contact email: grit4game@gmail.com.

## Compliance forms
- [ ] **Privacy policy URL** → `https://driverlog.link/privacy.html` (already built).
- [ ] **Data safety form:** declare collected data = email (account), app activity /
      driving entries; encrypted in transit (HTTPS); user can request deletion via
      contact email. No location data collected (a geolocation helper exists in
      site/app.js but is dead code, never called from any UI path — confirmed by
      grep). **Check whether `chore/remove-guest-login` has merged before filling
      this out** — unmerged as of this checklist update: if still unmerged, a guest
      mode exists where data never leaves the device (declare as optional/local-only
      collection); if merged, an account is required for every user and data syncs to
      the cloud by default with no local-only mode.
- [ ] **Content rating** questionnaire completed (expected: Everyone).
- [ ] **Ads** declaration: **No** — ads were removed from the app itself (see
      "Fix AdSense policy violations" commit); confirmed zero adsbygoogle/pagead
      references anywhere in site/app.html, login.html, index.html. Ads only run on
      the separate info.driverlog.link marketing pages, which the installed Android
      app never loads (capacitor.config.json's server.url is driverlog.link, not the
      info pages).
- [ ] Target audience: adults / working drivers (not children).

## Release
- [ ] Upload `.aab` to **Internal testing**; test on ≥2 physical devices/screen sizes.
- [ ] Promote to **Closed testing** → soft-launch to a small driver group; gather feedback.
- [ ] Promote to **Production**.

## Post-launch
- [ ] Confirm content updates propagate by redeploying the site (no resubmission).
- [ ] Monitor Play Console vitals (ANRs, crashes) and reviews.
