# DriverLog — Google Play Store Listing Kit

Everything needed to take the app from "signed .aab exists" to "internal
testing live". Pair this with `docs/BACKLOG.md` § Android / Play Store.

**App facts (verify before submitting):**
| Field | Value | Source |
|---|---|---|
| Package name | `com.prod.driverlog_1_0_1` | `fix/android-package-name` (#46) |
| versionName | `1.0.0` | Play Console convention |
| versionCode | `1` (plain integer — never `1.0.0`, see BACKLOG war story) | same |
| Build source | `.aab` artifact from **Android release build** workflow (`android-release.yml`, workflow_dispatch) | GitHub Actions |
| Signing | CI-signed via 4 repo secrets (`ANDROID_KEYSTORE_*`) | workflow file |
| Privacy policy | `https://driverlog.link/privacy` | `site/privacy.html` |

---

## Step-by-step (Console all-access ▸ Create app)

1. **Create app** — name `DriverLog`, default language **English (United States)
   + add Thai (Thailand)** translation later in Store listing; App/Game: **App**;
   Free/Paid: **Free**.
2. **App signing** (Setup ▸ App signing): accept Google-managed keys. After the
   first `.aab` upload, copy the **SHA-256** of the *Play-signing* key from that
   page — you need it for step 5.
3. **Upload the .aab** — Actions ▸ "Android release build" ▸ Run workflow
   (`versionCode: 1`, `versionName: 1.0.0`) ▸ download the `.aab` artifact ▸
   Production? No — **Testing ▸ Internal testing**, create the track, upload.
4. **Store listing** — paste everything from [`store-listing.md`](store-listing.md)
   (EN + TH both provided). Screenshots per [`screenshots.md`](screenshots.md).
5. **assetlinks.json** — required because the Capacitor shell loads the live site
   (`server.url`). Build the statement with the SHA-256 from step 2 and land it at
   `https://driverlog.link/.well-known/assetlinks.json`
   (add `site/.well-known/assetlinks.json`; Vercel serves `site/` statically):

   ```json
   [{
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": {
       "namespace": "android_app",
       "package_name": "com.prod.driverlog_1_0_1",
       "sha256_cert_fingerprints": ["PASTE:PLAY_SIGNING_SHA256"]
     }
   }]
   ```

   Verify after deploy: `curl -s https://driverlog.link/.well-known/assetlinks.json`.
6. **Content rating** questionnaire — truthful answers that follow from the code:
   - Shares data with other users? **Yes** (fleet owners see invited drivers'
     aggregated revenue/km-per-L) — but it is consensual, invite-based, and not
     public. Answer the sharing follow-ups accordingly; expect Everyone-ish rating.
   - User-generated content shared publicly? **No** (no feeds/comments/public posts).
   - Does the app contain ads? **No** (the AdSense units serve on the *web* info
     guides, not inside the wrapped app surface).
   - Personal data collection: account email/name + driving/revenue records +
     FCM push token (`api/push-register.js`) — declare in the Data safety form
     (collected, stored server-side on Neon, not sold, deletable by account).
7. **Data safety form** — mirror the schema: `users(email, first_name,
   line_sub, line_picture, push_token)`, `driver_sessions`, `fuel_records`,
   `vehicle_maintenance`, fleets tables. Encryption in transit: yes (HTTPS).
   Account deletion: state your chosen mechanism before submitting (there is
   **no self-serve delete endpoint today** — decide: support-email request vs.
   building `api/auth-delete.js`. Play requires a deletion path either way).
8. **Target audience** — 18+ (income tracking tool); not child-directed.
9. **Release to internal testing** ▸ invite up to 100 testers by email list ▸
   share the opt-in link with the soft-launch cohort (see roadmap Phase 2).

## Open decisions before submission (owner)
- [ ] Account-deletion mechanism (step 7) — email-request is acceptable to ship;
      a self-serve endpoint is the better answer and is small (`auth-delete.js`).
- [ ] Tester cohort list (roadmap targets 10–30 Thai drivers).
- [ ] Whether to bump `versionName` beyond `1.0.0` for the public lane later
      (keep `versionCode` strictly increasing forever).
