/* DriverLog service worker
 * P2: app-shell precache + offline
 * P3: background sync (drain-outbox) — see bottom
 * Bump SW_VERSION on every deploy so clients pick up new HTML/assets.
 */
const SW_VERSION = 'v1.6.0';   // v1.6.0: split index.html into login.html + app.html
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
  '/vendor/pocketbase.umd.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-180.png'
];

// Requests we must never serve from cache (live data / auth).
function isApi(url) {
  return url.pathname.startsWith('/api/')            // PocketBase REST/auth
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
 * P3: Background Sync — drain the offline outbox to PocketBase.
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

  // Read PB config the page stashed in a cache entry (url + token).
  const cfgResp = await caches.match('/__pb_cfg__');
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
  const base = `${cfg.url}/api/collections/${item.collection}/records`;
  const headers = { 'Content-Type': 'application/json', 'Authorization': cfg.token };
  let resp;
  if (item.op === 'delete') {
    if (!item.sid) return true;       // never synced → nothing to delete server-side
    resp = await fetch(`${base}/${item.sid}`, { method: 'DELETE', headers });
    return resp.ok || resp.status === 404;
  }
  let sid = item.sid;
  if (!sid && item.cuid) {            // dedupe: has this cuid already synced?
    try {
      const q = `${base}?perPage=1&filter=` + encodeURIComponent(`cuid='${item.cuid}'`);
      const found = await fetch(q, { headers });
      if (found.ok) { const j = await found.json(); if (j.items && j.items[0]) sid = j.items[0].id; }
    } catch { /* ignore, fall through to create */ }
  }
  if (sid) {                          // update existing
    resp = await fetch(`${base}/${sid}`, { method: 'PATCH', headers, body: JSON.stringify(item.data) });
    if (resp.status === 404) resp = await fetch(base, { method: 'POST', headers, body: JSON.stringify(item.data) });
  } else {                            // create
    resp = await fetch(base, { method: 'POST', headers, body: JSON.stringify(item.data) });
  }
  // 400 with a duplicate cuid means another path already created it → treat as done
  if (resp.status === 400) return true;
  return resp.ok;
}

self.addEventListener('sync', (e) => {
  if (e.tag === 'drain-outbox') e.waitUntil(drainOutbox());
});
