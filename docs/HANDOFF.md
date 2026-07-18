# Driver Log Book - Project Handoff

## Overview

**Driver Log Book** is a free, offline-first web app for gig economy drivers (Grab, food delivery, etc.) to track daily earnings, fuel costs, and driving insights. All data is stored locally on the device — no backend, no cloud, no subscriptions.

**Live URL:** https://driverlog.link/ (Vercel; DNS at Hostinger)  
**Created by:** Grit · Powered by Claude  
**Current Version:** 2.0.0

---

## What It Does

### Core Features

- **Dashboard**: Real-time net revenue (earnings − fuel), revenue breakdown by service type (GrabCar, GrabFood, GrabBike, GrabExpress), fuel cost ratio, average earnings per session, earnings trends chart
- **Session Logging**: Record each trip with date, distance, fuel consumption, fuel price, revenue, tips; auto-calculates net revenue
- **Fuel Log**: Track refill history with station name, liters, price, cost per liter analysis
- **Analytics**:
  - Earnings trend chart (daily revenue over time, last day highlighted in red)
  - Top earning days (top 5 sorted by net revenue)
  - Best driving times (day-of-week breakdown with 🔥 indicator for best day)
  - Service type breakdown (pie-style pill layout)
- **Multi-user**: Each driver gets a separate account with isolated data (sessions, fuel, settings)
- **Guest Mode**: Try the app without creating an account — data persists locally but marked as temporary
- **Bilingual**: Thai (ภาษาไทย) and English, default Thai
- **Export**: 
  - **CSV**: Download sessions as spreadsheet (`driver-logbook-<user>-<date>.csv`)
  - **Image**: Screenshot of net revenue hero card as PNG
- **Responsive**: Mobile-first design (iOS-style red theme), 430px max width
- **Data Formats**: Distance in km or miles, currency THB (฿)

---

## Technical Stack

### Architecture
- **Single HTML file** (~58 KB, no build step)
- **Browser storage**: IndexedDB (5 sessions/data stores: users, sessions, fuel, settings)
- **Auth**: Passwords hashed with SHA-256 + random salt, stored in IndexedDB
- **No server required** — fully client-side

### Key Libraries
- **Chart.js** 4.4.0 — earnings trend bar chart
- **html2canvas** 1.4.1 — image export (screenshots net revenue card)
- **Web Crypto API** — SHA-256 hashing for password security

### Language
- HTML + CSS + vanilla JavaScript (ES6+, async/await)
- Responsive CSS with CSS variables for theming

---

## File Structure

```
/gritdrive-v2/
└── index.html          (58 KB, complete app)

```

---

## Data Schema

### IndexedDB Stores

#### `users` (User accounts)
```
{
  id: 1,
  username: "grit",
  salt: "a1b2c3...", // 16-byte hex random salt
  hash: "sha256_hash", // SHA-256(salt + ':' + password)
  createdAt: "2026-07-04T17:00:00.000Z"
}
```

#### `sessions` (Trip records)
```
{
  id: 1,
  uid: 1 | "guest",
  serviceType: "GrabCar" | "GrabFood" | "GrabBike" | "GrabExpress",
  date: "2026-07-04",
  distance: 120,      // km
  consumption: 24,    // km/L
  oilPrice: 36,       // ฿/L
  exp: 180,           // fuel expense in ฿
  rev: 850,           // revenue in ฿
  tip: 50,            // tips in ฿
  netRev: 720         // rev + tip - exp
}
```

#### `fuel` (Refill records)
```
{
  id: 1,
  uid: 1 | "guest",
  station: "PTT สาขาลาดพร้าว",
  liters: 20.5,
  price: 732,         // total ฿
  date: "2026-07-04"
}
```

#### `settings` (User preferences)
```
{
  key: "1:lang",      // format: "{uid}:{key}"
  value: "th" | "en"
}
```
Keys: `lang`, `unit` (km/mi)

---

## Key Functions & Sections

### Authentication (`// ─── AUTH `)
- `submitAuth()` — register or log in a user
- `loginGuest()` — instant guest access
- `logout()` — clear session and return to login
- `sha256hex()` / `hashPassword()` — password hashing with crypto.subtle
- `setAuthMode()` — toggle login ↔ register UI

### App State (`// ─── STATE `)
- `currentUser` — `{id, username}` or null
- `isGuest` — true if logged in as guest
- `sessions[]`, `fuels[]` — filtered by current user's `uid`
- `settings` — `{lang, unit}`
- `currentPeriod` — active time filter (today/week/month/all/custom)

### Dashboard (`// ─── DASHBOARD `)
- `renderDashboard()` — main view: hero card, stats grid, chart, insights
- `filterByPeriod()` — slice sessions by time range
- `renderTrend()` — bar chart (Chart.js)
- `renderSvcBreakdown()` — revenue by service type
- `renderTimeInsights()` — best day of week
- `renderDayInsights()` — top 5 earning days

### Sessions (`// ─── SESSIONS `)
- `renderSessions()` — grouped by month, edit/delete buttons
- `openEditSession()`, `saveSession()` — modal form
- `openAddSession()` — populate form for new entry
- `calcSNet()` — real-time net revenue calc (auto fuel or manual)

### Fuel (`// ─── FUEL `)
- `renderFuel()` — refill list + summary stats (total spent, total liters, avg ฿/L)
- `saveFuel()`, `deleteFuel()` — CRUD operations

### Export (`// ─── EXPORT `)
- `exportCSV()` — download sessions as CSV with headers
- `exportImage()` — screenshot hero card via html2canvas, save as PNG

### Settings (`// ─── SETTINGS `)
- `saveSetting()` — persist language/unit preference to IndexedDB
- `applyLang()` — swap UI text between English and Thai

### Database (`// ─── DB `)
- `openDB()` — initialize IndexedDB on app start
- `dbAll()`, `dbPut()`, `dbAdd()`, `dbDel()` — CRUD helpers
- `dbGetByUsername()` — user lookup by unique index

---

## Deployment

### Vercel (current)

One Vercel project serves `site/`, `info/` (at `/info/*`), and `api/`
together (see root `vercel.json` and `README.md`'s "Cloud backend setup"
section). Push a branch, open a PR against `main`; once it's reviewed and
merged, Vercel deploys automatically. Hostinger only holds the DNS record
pointing `driverlog.link` at Vercel — `info/` no longer has its own
subdomain, since `info.driverlog.link`'s DNS record was never reliably
resolvable (see `git log` around 2026-07-18 for the diagnosis).

---

## User Guide

### For Drivers

1. **First time?** Tap "Try as guest" to explore, or create an account (username + password)
2. **Log a session**: Dashboard → Sessions → + button
   - Select service type (GrabCar, GrabFood, etc.)
   - Enter date, distance, fuel consumption, fuel price
   - App auto-calculates fuel cost
   - Enter revenue + tips
   - Tap "Save session"
3. **Log fuel refills**: Fuel tab → enter station, liters, total price
4. **View insights**: Dashboard shows trends, best days, optimal times
5. **Export**:
   - **CSV**: Settings → Export data → CSV (import into Excel)
   - **Image**: Settings → Export data → Image (screenshot for sharing)
6. **Switch language**: Settings → Language → ภาษาไทย / English
7. **Log out**: Settings → Log out (clears local session, data stays safe)

### For Multiple Users
- Each person creates their own account
- Tap avatar (top right) → Settings → Log out
- Next user logs in — their data is completely separate

---

## Customization & Extension

### Changing Colors
Edit CSS variables at the top of `<style>`:
```css
:root {
  --red: #D0021B;      /* Primary color */
  --red-dark: #A80016;
  --red-light: #FDECEA;
  /* ... */
}
```

### Adding New Service Types
Update `SVC_ICON` and `SVC_COLOR` objects:
```javascript
const SVC_ICON = {
  GrabCar: '🚗',
  GrabFood: '🍔',
  MyNewService: '🚀',
};
const SVC_COLOR = {
  MyNewService: '#F5C6C6',
};
```
Then add to the modal `.svc-selector`:
```html
<div class="svc-opt" data-svc="MyNewService" onclick="selSvc(this)">🚀 MyNewService</div>
```

### Adding Fields to Sessions
1. Add a new `<input>` in the modal form
2. Update `saveSession()` to extract the value
3. Update `renderSessions()` to display it in the list row

### Changing Default Language
Set default in state init:
```javascript
let settings = {lang: 'en', unit: 'km'}; // change 'th' to 'en'
```

---

## Known Limitations & Future Ideas

### Current Constraints
- **Device-local only** — data doesn't sync across phones; each device is isolated
- **No real-time updates** — all changes are local
- **No backend auth** — password security is client-side only (not suitable for sensitive enterprise use)
- **Chart.js renders on dashboard only** — not on export (Image export is static screenshot)
- **No data backup to cloud** — users must manually export CSV/Image

### Potential Enhancements
1. **Supabase/Firebase integration** — sync data across devices with cloud backup
2. **Monthly reports** — PDF export or email summaries
3. **Expense categories** — fuel, maintenance, tolls, insurance split-out
4. **Multi-vehicle tracking** — separate logs for different cars
5. **Recurring expenses** — auto-log routine costs
6. **Dark mode** — CSS custom properties ready, just add toggle
7. **Offline-first PWA** — service worker for app-like experience (currently just web)
8. **Analytics dashboard** — hourly heatmap, driver performance metrics
9. **Team mode** — fleet manager views aggregated data from multiple drivers
10. **Localization** — expand beyond English/Thai (Vietnamese, Tagalog, etc.)

---

## Troubleshooting

### "No data showing after login"
- **Cause**: User just created account (starts empty)
- **Solution**: Tap Sessions → + to add first entry, or use guest mode to see demo flow

### "Data disappeared"
- **Cause**: Logged out and logged back in as different user, or cleared browser storage
- **Solution**: Each user's data is separate; log in with correct account. Use CSV export to back up.

### "Export buttons not working"
- **Cause**: html2canvas library failed to load (CDN issue) or no sessions to export
- **Solution**: Check browser console for errors; ensure you have at least one session for CSV

### "Password hash mismatch" on login
- **Cause**: Typo or browser storage corruption
- **Solution**: Tap "Create account" with a new username to start fresh

---

## Development Notes

### For Future Maintainers

1. **Testing**: Use guest mode for rapid iteration (no login friction)
2. **IndexedDB inspection**: Browser DevTools → Application → IndexedDB → gritdrive-v2 to view live data
3. **Responsive testing**: Resize to 375px width (mobile preset) to verify layout
4. **Performance**: All operations should be instant (IndexedDB queries are synchronous via promises)
5. **Security**: Never send passwords to server; hashing is final step before storage
6. **Localization string keys**:
   - `th` = Thai language flag
   - `en` = English language flag
   - See `applyLang()` function for all translated strings

### Code Style
- No build step, no minification
- Vanilla JS, no frameworks (intentional simplicity)
- CSS variables for theming
- Comments delineate major sections (`// ─── SECTION NAME `)
- Async/await for DB operations (promises everywhere)

---

## Contact & Support

**Created by:** Grit  
**Powered by:** Claude (AI Co-pilot)  
**Version:** 2.0.0  
**License:** Free to use

For questions or improvements, refer to the code comments or contact the original developer.

---

## Checklist: Before Going Live

- [ ] Test guest mode on mobile
- [ ] Test login with real credentials
- [ ] Add 5+ sessions, verify calculations
- [ ] Test CSV export, open in Excel/Sheets
- [ ] Test image export, verify screenshot
- [ ] Test logout and re-login
- [ ] Verify Thai language toggle works
- [ ] Check mobile responsive (375px viewport)
- [ ] Test fuel log entry and deletion
- [ ] Verify chart renders with data
- [ ] Clear IndexedDB and start fresh (no corrupted state)
- [ ] Push branch → open PR → merge → verify Vercel auto-deploy
- [ ] Share link with drivers to test

---

**Last Updated:** July 4, 2026  
**Status:** Ready for production deployment
