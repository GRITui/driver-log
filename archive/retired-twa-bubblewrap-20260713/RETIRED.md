Retired 2026-07-13: this was the planned TWA (Trusted Web Activity) /
Bubblewrap packaging path for the Play Store — a thin Chrome-shell wrapper,
never actually built. Replaced by a Capacitor-based native Android shell
(root `capacitor.config.json` + `android/`), which gives access to native
plugins (push notifications, geolocation) that a TWA can't provide. See
`docs/roadmap-android.md` and the root README's Android section. Kept for
reference only — `android/` now holds the real Capacitor project.
