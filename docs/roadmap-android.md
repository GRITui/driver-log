# DriverLog — Android Roadmap (Web-Based App)

**Approach:** Wrap the existing [driverlog.link](https://driverlog.link) website as an Android app — one codebase, no native rewrite.
**Product:** DriverLog · Hosted on Vercel, DNS at Hostinger
**Last updated:** 13 July 2026 — switched the packaging plan from TWA to Capacitor (see below); everything before Phase 3 is unaffected.

---

## The strategy in one line

Turn the current website into an installable Android app by making it a **PWA (Progressive Web App)** first, then packaging it with **Capacitor** for the Google Play Store, configured in *remote mode* (`capacitor.config.json`'s `server.url` points at `https://driverlog.link`). Same site, same deploys — redeploying the website updates the installed app instantly, same as a TWA would, but Capacitor also gives access to native plugins (push notifications, geolocation) that a TWA can't provide.

### Why Capacitor over a plain TWA
- Still reuses the website you already have — no content fork, no bundled snapshot.
- One deploy updates both web and app, same as TWA would have.
- Unlocks native plugins: push notifications (FCM) and geolocation are already scaffolded (see `README.md`'s "Android app (Capacitor)" section).
- Trade-off vs. TWA: a real native `android/` Gradle project now exists to maintain (rebuild needed for plugin/icon/version changes), and there's more first-time setup (Android Studio, signing keystore) than a TWA's near-zero native footprint.
- The originally-planned TWA/Bubblewrap path is retired — see `archive/retired-twa-bubblewrap-20260713/`.

---

## Phase 1 — Make the website a proper PWA
This is the foundation. Do this before any packaging.

- **Add a Web App Manifest** (`manifest.json`): app name, icons (192px + 512px), theme color, `display: standalone`, start URL.
- **Add a Service Worker** for offline support and caching — critical for drivers with patchy signal. At minimum, cache the app shell so it opens offline.
- **Serve over HTTPS** (required — confirm Hostinger SSL is active on driverlog.link).
- **Make it responsive / mobile-first** — one-tap logging, thumb-friendly buttons, no pinch-zoom needed.
- **Test with Lighthouse** (Chrome DevTools) until the PWA score passes all checks.

**Outcome:** users can "Add to Home Screen" from mobile Chrome and it opens full-screen.

---

## Phase 2 — Offline & local data
Drivers log entries mid-shift, often with no connection.

- Store entries locally with **IndexedDB** when offline.
- **Background Sync**: queue offline entries, push to server when signal returns.
- Show a clear "saved locally / synced" indicator so drivers trust it.
- Cache the last-known dashboard so numbers show instantly on open.

---

## Phase 3 — Package as a Play Store app (Capacitor)
Wrap the PWA so it installs from Google Play.

- `android/` is already scaffolded (Capacitor, remote mode — see `README.md`'s
  "Android app (Capacitor)" section for the exact build commands; needs
  Android Studio/Gradle locally, not available in this dev sandbox).
- Generate signed APK/AAB (`./gradlew bundleRelease`), create a **Google
  Play Developer account** ($25 one-time; new personal accounts also need a
  14-day/20-tester closed test before Production), and submit.
- Prepare store listing: icon, screenshots, description, privacy policy (required).
- Note: Capacitor apps don't need Digital Asset Links the way a TWA does
  (there's no browser address bar to hide) — skip `assetlinks.json` unless
  you later want Android App Links (opening `driverlog.link` URLs directly
  in the app).

**Outcome:** DriverLog is downloadable from the Play Store, full-screen, no browser chrome.

---

## Phase 4 — Native-feeling features
Close the gap between web and native.

- **Push notifications (FCM)** — client-side registration is scaffolded
  (`initPushNotifications()` in `site/app.js`, `api/push-register.js`
  stores the device token). Still needed: a Firebase project
  (`google-services.json`) and a send-push endpoint using an FCM server
  key — see `README.md`.
- **Home-screen widget** — still needs native code; not started.
- **Camera / receipt capture** — not started; `@capacitor/camera` is the
  natural plugin once this is prioritized.
- **Geolocation** — plugin scaffolded (`getCurrentPositionNative()` in
  `site/app.js`), not yet wired into any trip-mileage UI.
- **Install prompt** — custom "Install app" button when the browser allows it.

---

## Phase 5 — Polish & launch
- App icon + splash screen matching brand.
- Onboarding flow for first-time drivers.
- Test across real Android devices (various screen sizes, older versions).
- Soft launch to a small driver group → gather feedback → iterate.
- Public Play Store launch.

---

## Suggested sequencing

| Phase | Focus | Outcome |
|-------|-------|---------|
| **1** | PWA foundation (manifest + service worker + HTTPS) | Installable from mobile browser |
| **2** | Offline data + background sync | Works with no signal |
| **3** | Capacitor packaging + Play Store submission | Downloadable app |
| **4** | Push, camera, geolocation | Native-feeling |
| **5** | Polish + soft launch → public launch | Live in Play Store |

---

## Known limits of the web-based approach
Worth knowing up front so there are no surprises:

- **True home-screen widgets** and deep OS integration need native code — plan a thin native shell if these become essential.
- **Background GPS tracking** (continuous, app closed) is limited even with Capacitor's Geolocation plugin — fine for on-demand "start/stop trip," not for always-on tracking.
- **iOS**: Capacitor supports it (same web codebase, `npx cap add ios`), unlike the old TWA path — worth revisiting once Android ships, no separate wrapper decision needed this time.

---

## Tooling cheat-sheet
- **Capacitor** — native Android (and future iOS) shell around the live site; `android/` in this repo.
- **PWABuilder** — alternative packaging tool, no longer the chosen path here (see the retired TWA plan).
- **Lighthouse** — audits PWA readiness.
- **Firebase Cloud Messaging (FCM)** — push notifications (needs its own Firebase project, not yet created).

---

*Living document — Android-first, web-based, Capacitor-packaged. Revisit iOS once Android ships.*
