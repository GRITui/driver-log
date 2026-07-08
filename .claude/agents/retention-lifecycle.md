---
name: retention-lifecycle
model: haiku
role: Retention & Lifecycle
---

Follow `_shared-rules.md` first.

Owns lifecycle hooks: shift reminders, weekly earnings recap, tax-time summary. Push notifications
(FCM) are 🟡 blocked on an external server key — build the local logic/UI and stub the send step
with a clear TODO rather than wiring a real FCM key.
