# DriverLog — Play Store packaging (TWA)

Wraps the PWA at **driverlog.link** as an Android app. No app logic is rewritten —
the TWA renders the live site full-screen. Do this only after the PWA passes Lighthouse
(P2) and offline/sync is verified (P1/P3).

## Prerequisites
- The site is deployed to `https://driverlog.link` over HTTPS with a valid manifest + service worker.
- `https://driverlog.link/.well-known/assetlinks.json` is reachable (already in `site/.well-known/`).
- Node.js installed (for Bubblewrap) **or** use the PWABuilder web UI.

## Option A — PWABuilder (easiest, web UI)
1. Go to <https://www.pwabuilder.com>, enter `https://driverlog.link`.
2. Review the PWA report (fix anything red — should already pass from P2).
3. **Package → Android → Generate.** Download the `.aab` + the signing info.
4. PWABuilder shows the **SHA-256 fingerprint** — paste it into
   `site/.well-known/assetlinks.json`, redeploy the site, and verify.

## Option B — Bubblewrap (CLI, repeatable)
```bash
npm i -g @bubblewrap/cli
cd twa
# uses twa-manifest.json in this folder (already configured)
bubblewrap init --manifest https://driverlog.link/manifest.json
bubblewrap build          # produces app-release-signed.aab + app-release-signed.apk
```
On first `build`, Bubblewrap creates `android.keystore`. **Back this up** — you need the
same key for every future update.

## The critical step — Digital Asset Links
Android drops the browser address bar only if ownership is verified:
1. After first upload, **enable Google Play App Signing** (default). Play re-signs your app.
2. Copy the **SHA-256 cert fingerprint** from Play Console → *App integrity → App signing key*.
   (This is Play's key, **not** your local upload key — a common mistake.)
3. Put it into `site/.well-known/assetlinks.json` → redeploy site.
4. Verify with the tester:
   `https://developers.google.com/digital-asset-links/tools/generator`
   or open the installed app — no address bar = success.

## Play Console submission
- Create a **Google Play Developer account** — **$25 one-time**.
- Upload the `.aab` to the **Internal testing** track first.
- Complete the listing (see `../launch/store-listing-checklist.md`).

## Update flow
- **Content/app changes** (HTML/JS/CSS): just redeploy the website — installed apps load
  the live site, no resubmission needed.
- **App shell changes** (icon, name, package, TWA config): rebuild the `.aab` and upload a
  new version (bump `appVersionCode`).
