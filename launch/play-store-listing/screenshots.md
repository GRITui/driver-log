# Screenshot plan

Play requires: phone screenshots **min 320px, max 3840px** on the long side;
2–8 images recommended for a strong listing; JPEG or 24-bit PNG (no alpha).

## Shot list (in priority order)

| # | Screen | What to capture | Why |
|---|---|---|---|
| 1 | Dashboard with real data | 2+ weeks of sessions logged: revenue hero card, stat grid, trend chart populated | The money shot — proves the core loop works |
| 2 | Shift timer mid-shift | Timer running + 3-4 logged trip laps visible | The differentiator vs. manual logbooks |
| 3 | Session form (revenue-first) | Revenue at top, trips breakdown visible | Shows the revenue-first ordering |
| 4 | Maintenance log | A few service records + upcoming due date | New feature (v2.10.x); niche but sticky |
| 5 | Fleet console (desktop-width, scaled to 16:9-ish) | Aggregated stats across 3-4 fake drivers | Speaks to B2B installs |
| 6 | Thai-language dashboard | Same as #1 but TH locale | Critical for the Thai driver audience |

## How to produce them honestly
- Use the **live app** (`driverlog.link/app.html`) in a browser device-emulator
  (iPhone/Pixel profile), NOT mocked-up images — Google rejects mockups with
  fake UI.
- Seed demo data through the real UI (add sessions/fuel manually or restore a
  crafted backup file via Settings ▸ Export ▸ Restore). Use plausible Thai
  provider names and realistic Bangkok fares/distances. Do NOT put any real
  person's data or plate numbers in.
- Capture at **1080×1920 or 1080×2400**, then verify text is legible at a
  glance (Play thumbnails are small).
- Feature graphic **1024×500**: render from `brand/` assets (logo-icon +
  wordmark on brand red gradient `#D0021B`) — no text beyond the wordmark so
  it survives localization.

## Icon
Already done — see BACKLOG § Android ("Real app icon/splash art — done").
Reuse `brand/logo-icon.svg` renders; don't regenerate.
