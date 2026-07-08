/* ============================================================
   Drivee — deploy config (NON-SECRET)
   ------------------------------------------------------------
   The ONLY thing a human sets at deploy time: the public base
   URL of the Drivee orchestrator, reached through the Cloudflare
   tunnel. All API calls in chat.js use window.DRIVEE_API_BASE.

   HUMAN: replace the placeholder below with the live tunnel host,
   e.g. 'https://drivee.example.trycloudflare.com' (NO trailing
   slash). No secrets, tokens, or keys ever go in this file — it
   is served publicly as a static asset.
   ============================================================ */
window.DRIVEE_API_BASE = 'https://REPLACE-WITH-TUNNEL-HOST';
