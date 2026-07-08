# Driver Log Book — Feature List

Live at: https://driverlog.link
Last updated: 2026-07-04

> **Maintenance note:** this file is the single source of truth for what's shipped. When a feature changes, only edit the affected line(s)/section — don't regenerate the whole file. Mark new work as `[ ]` (planned), flip to `[x]` once deployed and verified live.

## Auth & Accounts
- [x] Username/password accounts, stored locally (IndexedDB, SHA-256 + salt hash)
- [x] "Login as Guest" button on the login screen — one-click bypass, ignores username/password fields entirely
- [x] Guest sessions persist across page refresh (own `guest` uid bucket, no data loss)
- [x] Logout (Settings screen) clears session but preserves guest's local data for next guest login
- [x] Real-account sessions persist across refresh

## Dashboard
- [x] Net revenue hero card (period-filtered: Today/Week/Month/All/Custom)
- [x] Stat cards: Distance, Fuel cost ratio, Avg/session, Total revenue
- [x] **Earnings / hour** stat card — sum(netRev)/sum(hoursWorked) for sessions that have working-time logged; sessions without it are excluded (shows "N sessions timed")
- [x] Earnings trend chart, by-service-type breakdown, best time to drive, top earning days
- [x] Quick TH/EN language toggle pill in header (synced with Settings dropdown)
- [x] "+" FAB visible on both Dashboard and Sessions screens (opens Log Session modal)

## Sessions
- [x] Provider selector: **Grab** (with sub-types GrabCar/GrabFood/GrabBike/GrabExpress), **Lineman**, **Bolt**, **Shopee**, **Other** (free-text custom name, e.g. "Taxi")
- [x] Custom "Taxi" provider gets a distinct 🚕 icon on a yellow/green split background; other custom names fall back to a generic 🚗 icon
- [x] Working time: Start time / End time inputs, live-computed "Hours worked" (handles overnight/midnight-crossing shifts)
- [x] Legacy sessions (pre-provider-system) auto-migrated to `provider: 'Grab'` on load, no data loss
- [x] Trip details: date, distance, consumption, oil price, auto/manual fuel expense
- [x] Revenue + tip entry with live net revenue preview
- [x] Edit/delete existing sessions

## Fuel Log
- [x] Refill history with station, liters, total price
- [x] Summary stats (total spent, total liters, avg ฿/L)

## Settings
- [x] Language: English / ภาษาไทย (dropdown, synced with dashboard toggle)
- [x] Distance unit: km / mi
- [x] Currency: THB (฿)
- [x] Export: CSV, Image (screenshot of net revenue card)
- [x] Logout

## Monetization
- [x] Google AdSense auto ads embedded (`ca-pub-3349895945204021`)
- [ ] `ads.txt` uploaded to site root (created locally, not yet deployed as a standalone file — confirm if still needed)

## Deployment
- [x] Hosted on Hostinger, domain `driverlog.link`, deployed via MCP (`hosting_deployStaticWebsite`)
- [x] Single-file `index.html`, no build step

## Known gaps / not built
- [ ] Google Login (OAuth) — explicitly dropped per user decision, not in scope
- [ ] Cloud sync / multi-device (data is device-local only, by design)
