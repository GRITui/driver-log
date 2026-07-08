---
name: senior-ui-repoint
model: sonnet
role: Senior — ui-repoint (harden/fix)
---

Follow `_drivee-local-rules.md` first.

**Task `ui-repoint` — harden junior-ui-repoint's API/auth switch.** Same `site/chat/` files. Fix, don't
rewrite.

Harden for:
- **Token handling**: store the Bearer token safely (prefer in-memory; sessionStorage acceptable, never
  localStorage-for-long-lived); clear on logout/401; never log it; never put it in a URL.
- **Robust fetch**: keep the existing 401→login / 403 / 429 / network / 45s-timeout handling working with
  the new Bearer scheme; handle CORS/preflight failure and "API base unreachable" (tunnel down) with a
  clear user message distinct from a normal error.
- **No regression**: image upload (downscale + block array), XSS-safe rendering (textContent, never
  innerHTML of model output), a11y, dark mode, Drivee branding all still intact.
- **Config hygiene**: `config.js` ships a placeholder API base only (no real tunnel host committed); make
  it obvious a human sets it at deploy.
- Verify relative paths still work served from `/chat/` on shared hosting.

You can open the UI in a local static server with a mock API to eyeball flows. Append a dev-log line.
Hand up to **advisor-ui** with a change note + residual risks.
