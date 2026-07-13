/* DriverLog service worker
 * P2: app-shell precache + offline
 * P3: background sync (drain-outbox) — see bottom
 * Bump SW_VERSION on every deploy so clients pick up new HTML/assets.
 */
const SW_VERSION = 'v1.8.1';  // v1.8.1: dashboard "Avg / session" -> "Avg revenue / trip"; APP_VERSION 2.8.0->2.8.1
// prior: v1.8.0: shift timer (start/log-trip/end-shift UI, local-only laps); APP_VERSION 2.7.1->2.8.0
// prior: v1.7.1: same-origin api/ (single Vercel project for site/+info/+api/, Netlify mirror + Hostinger FTP retired); APP_VERSION 2.7.0->2.7.1
// prior: v1.7.0: PocketBase dropped entirely — cloud sync/auth now runs against this project's own Vercel api/ functions on Neon (see lib/db.js, lib/auth.js, api/auth-*.js, api/records-*.js, api/line-login-*.js); background sync now calls /api/records-* instead of PocketBase's REST convention, cached config moved from /__pb_cfg__ to /__api_cfg__; APP_VERSION 2.6.12->2.7.0
// prior: v1.6.14: localized aria-labels for icon-only controls (FAB, avatar, reminder toggle) via new data-i18n-aria applyLang() pass, EN+TH; APP_VERSION 2.6.9->2.6.10
// prior: v1.6.13: personalized dashboard empty-state welcome title with first name (EN+TH); APP_VERSION 2.6.8->2.6.9
// prior: v1.6.12: first-name capture at registration + time-of-day dashboard greeting (morning/afternoon/evening, EN+TH); APP_VERSION 2.6.7->2.6.8
// prior: v1.6.11 hero card readability + alignment restyle (styles.css: branded tint, dark high-contrast amount, even gap, dark-mode variant); APP_VERSION 2.6.6->2.6.7
// prior: v1.6.10 local JSON Backup RESTORE/import (overwrite this account's sessions+fuel, DriverLog-file validation + confirm); APP_VERSION 2.6.5->2.6.6
// v1.6.8: sync stale APP_VERSION 2.6.3->2.6.4 (was stuck at the split build across 7 user-facing patches) + app.html version fallback; display-only, no logic change
// v1.6.7: login.html a11y — #auth-err role="alert" + #toast aria-live (login errors/toasts now announced to screen readers, matching app.html)
// v1.6.6: CSV exports prepend a UTF-8 BOM (฿/Thai text render in Excel) + logbook export toast localized via t('exported')
// v1.6.5: CSV export escapes free-text fields (provider/type) + neutralizes spreadsheet formula injection
// v1.6.4: toast now role=status aria-live=polite so validation/save messages are announced to screen readers
// v1.6.3: hero delta colors -> neutral-card tints (#047857/red) matching insight rows; were pastels tuned for the old red hero
// v1.6.2: dark-mode hero amount -> neutral (red text was hard to read)
// v1.6.1: net-revenue hero card restyle (readable in light+dark)
// v1.6.0: split index.html into login.html + app.html
const SHELL_CACHE = `driverlog-shell-${SW_VERSION}`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/app.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/vendor/chart.umd.min.js',
  '/vendor/html2canvas.min.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-180.png'
];

// Requests we must never serve from cache (live data / auth).
function isApi(url) {
  return url.pathname.startsWith('/api/')            // this project's own auth/sync API
      || url.hostname.includes('pagead')             // ads
      || url.hostname.includes('googlesyndication');
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

const KEEP_CACHES = [SHELL_CACHE, 'driverlog-cfg'];
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !KEEP_CACHES.includes(k)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // let POST/PATCH/DELETE hit network
  const url = new URL(req.url);

  if (isApi(url)) return;                            // network-only, don't intercept

  // Navigations → serve the matching page from the app shell (cache-first, offline-safe).
  // Each of index.html/login.html/app.html is precached; fall back to index.html
  // (the redirector) if a path was never cached, e.g. a stale deep link.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cached = await caches.match(url.pathname);
      if (cached) return cached;
      try {
        return await fetch(req);
      } catch {
        return (await caches.match(url.pathname)) || (await caches.match('/index.html'));
      }
    })());
    return;
  }

  // Same-origin static assets → cache-first, then populate cache.
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((cached) =>
        cached || fetch(req).then((resp) => {
          const copy = resp.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          return resp;
        }).catch(() => cached))
    );
  }
});

// Allow the page to tell a waiting SW to activate immediately.
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

/* ─────────────────────────────────────────────────────────────
 * P3: Background Sync — drain the offline outbox to the Neon-backed API.
 * The page registers sync tag 'drain-outbox' after each write.
 * ───────────────────────────────────────────────────────────── */
const OUTBOX_DB = 'gritdrive-v2';   // same IndexedDB the app uses
const OUTBOX_STORE = 'outbox';

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(OUTBOX_DB);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function idbAll(db, store) {
  return new Promise((res) => {
    const tx = db.transaction(store, 'readonly');
    tx.objectStore(store).getAll().onsuccess = (e) => res(e.target.result || []);
  });
}
function idbDel(db, store, key) {
  return new Promise((res) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key).onsuccess = () => res();
  });
}

async function drainOutbox() {
  let db;
  try { db = await idb(); } catch { return; }
  if (!db.objectStoreNames.contains(OUTBOX_STORE)) return;
  const items = await idbAll(db, OUTBOX_STORE);
  if (!items.length) return;

  // Read the API config the page stashed in a cache entry (url + token).
  const cfgResp = await caches.match('/__api_cfg__');
  if (!cfgResp) return;               // not logged into an account → nothing to push
  const cfg = await cfgResp.json();
  if (!cfg.url || !cfg.token) return;

  for (const item of items) {
    try {
      const ok = await pushOne(cfg, item);
      if (ok) await idbDel(db, OUTBOX_STORE, item.key);
    } catch { /* leave in outbox for next sync */ }
  }
  // Tell open clients to refresh their synced badges.
  const clients = await self.clients.matchAll();
  clients.forEach((c) => c.postMessage({ type: 'sync-complete' }));
}

async function pushOne(cfg, item) {
  const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.token };
  if (item.op === 'delete') {
    if (!item.sid) return true;       // never synced → nothing to delete server-side
    const q = new URLSearchParams({ collection: item.collection, sid: item.sid });
    const resp = await fetch(`${cfg.url}/api/records-remove?${q}`, { method: 'DELETE', headers });
    return resp.ok;                  // api/records-remove.js is a no-op success if already gone
  }
  let sid = item.sid;
  if (!sid && item.cuid) {            // dedupe: has this cuid already synced?
    try {
      const q = new URLSearchParams({ collection: item.collection, cuid: item.cuid });
      const found = await fetch(`${cfg.url}/api/records-find?${q}`, { headers });
      if (found.ok) { const j = await found.json(); if (j.item) sid = j.item.id; }
    } catch { /* ignore, fall through to create */ }
  }
  const resp = await fetch(`${cfg.url}/api/records-save`, {
    method: 'POST', headers, body: JSON.stringify({ collection: item.collection, sid, data: item.data })
  });
  return resp.ok;
}

self.addEventListener('sync', (e) => {
  if (e.tag === 'drain-outbox') e.waitUntil(drainOutbox());
});
