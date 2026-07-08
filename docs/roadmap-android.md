# DriverLog — Android Roadmap (Web-Based App)

**Approach:** Wrap the existing [driverlog.link](https://driverlog.link) website as an Android app — one codebase, no native rewrite.
**Product:** DriverLog · Hosted on Hostinger
**Last updated:** July 2026

---

## The strategy in one line

Turn the current website into an installable Android app by making it a **PWA (Progressive Web App)** first, then packaging it as a **TWA (Trusted Web Activity)** for the Google Play Store. Same site, same deploys — it just runs full-screen and installs like a native app.

### Why this path (not native)
- Reuses the website you already have — no separate Android codebase to maintain.
- One deploy updates both web and app (the app loads your live site).
- Fastest route to a Play Store listing.
- Trade-off: some deep native features are limited. Covered in the "Known limits" section below.

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

## Phase 3 — Package as a Play Store app (TWA)
Wrap the PWA so it installs from Google Play.

- Use **PWABuilder** (easiest, web UI) or **Bubblewrap** (Google's CLI) to generate the TWA/Android package.
- Add **Digital Asset Links** (`assetlinks.json` on your domain) so the app opens without a browser address bar — this proves you own driverlog.link.
- Generate signed APK/AAB, create a **Google Play Developer account** ($25 one-time), and submit.
- Prepare store listing: icon, screenshots, description, privacy policy (required).

**Outcome:** DriverLog is downloadable from the Play Store, full-screen, no browser chrome.

---

## Phase 4 — Native-feeling features
Close the gap between web and native.

- **Push notifications** (Web Push / FCM) — shift reminders, "log your fuel," weekly earnings summary.
- **Home-screen widget** — hardest via web; consider a thin native shell later if this becomes a priority.
- **Camera / receipt capture** — use the browser file/camera input for photos of receipts.
- **Geolocation** — request permission for mileage/trip logging.
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
| **3** | TWA packaging + Play Store submission | Downloadable app |
| **4** | Push, camera, geolocation | Native-feeling |
| **5** | Polish + soft launch → public launch | Live in Play Store |

---

## Known limits of the web-based approach
Worth knowing up front so there are no surprises:

- **True home-screen widgets** and deep OS integration need native code — plan a thin native shell if these become essential.
- **Background GPS tracking** (continuous, app closed) is limited in a web wrapper — fine for on-demand "start/stop trip," not for always-on tracking.
- **iOS PWA support** is weaker than Android — this roadmap is Android-first for that reason. iOS may later need a different wrapper (e.g. Capacitor).
- If native needs grow, **Capacitor** is the natural next step: wraps the same web app but gives access to native plugins without a full rewrite.

---

## Tooling cheat-sheet
- **PWABuilder** — packages PWA → Android app via web UI.
- **Bubblewrap** — Google's CLI for TWA generation.
- **Capacitor** — bridge to native features if/when the TWA hits limits.
- **Lighthouse** — audits PWA readiness.
- **Firebase Cloud Messaging (FCM)** — push notifications.

---

*Living document — Android-first, web-based. Revisit native shell only if widget/background-GPS needs emerge.*
