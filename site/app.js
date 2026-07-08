// ─── DB ───────────────────────────────────────────────────────────────
let db;
const APP_VERSION = '2.6.9';   // bump on every deploy — 2.6.9: personalized dashboard empty-state welcome title using first name (EN+TH; SW v1.6.13). 2.6.8: optional first-name capture at registration (both PB/Sync and local-only paths) + time-of-day dashboard greeting (morning/afternoon/evening, EN+TH; SW v1.6.12). 2.6.7: hero card readability + alignment (soft branded tint, dark high-contrast amount, even gap to stat grid, dark-mode hero variant; SW v1.6.11). 2.6.6: local JSON Backup RESTORE/import (overwrite this account's sessions+fuel, DriverLog-file validation + confirm, SW v1.6.10). 2.6.5: local JSON "Backup" export (full sessions+fuel+settings, SW v1.6.9). 2.6.4: post-split staged fixes (SW v1.6.1–v1.6.8): hero-card restyle, dark-mode hero, toast + login a11y, CSV formula-injection escaping + UTF-8 BOM. 2.6.3 was the login.html/app.html split (SW v1.6.0).
const DB_NAME = 'gritdrive-v2', DB_VER = 2;
function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('users')) {
        const u = d.createObjectStore('users', {keyPath:'id', autoIncrement:true});
        u.createIndex('username', 'username', {unique:true});
      }
      if (!d.objectStoreNames.contains('sessions'))
        d.createObjectStore('sessions', {keyPath:'id', autoIncrement:true});
      if (!d.objectStoreNames.contains('fuel'))
        d.createObjectStore('fuel', {keyPath:'id', autoIncrement:true});
      if (!d.objectStoreNames.contains('settings'))
        d.createObjectStore('settings', {keyPath:'key'});
      // v2: offline sync support
      if (!d.objectStoreNames.contains('outbox'))
        d.createObjectStore('outbox', {keyPath:'key', autoIncrement:true});
      if (!d.objectStoreNames.contains('meta'))
        d.createObjectStore('meta', {keyPath:'key'});
    };
    req.onsuccess = e => { db = e.target.result; res(db); };
    req.onerror = () => rej(req.error);
  });
}
function dbAll(store) {
  return new Promise(res => {
    const tx = db.transaction(store, 'readonly');
    tx.objectStore(store).getAll().onsuccess = e => res(e.target.result);
  });
}
function dbPut(store, obj) {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(obj);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
function dbAdd(store, obj) {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).add(obj);
    req.onsuccess = () => res(req.result);
    req.onerror = e => { e.preventDefault(); rej(req.error); };
  });
}
function dbDel(store, id) {
  return new Promise(res => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(id).onsuccess = () => res();
  });
}
function dbGetByUsername(username) {
  return new Promise(res => {
    const tx = db.transaction('users', 'readonly');
    tx.objectStore('users').index('username').get(username).onsuccess = e => res(e.target.result);
  });
}
function dbGet(store, key) {
  return new Promise(res => {
    const tx = db.transaction(store, 'readonly');
    tx.objectStore(store).get(key).onsuccess = e => res(e.target.result);
  });
}

// ─── SYNC BACKEND (adapter) ─────────────────────────────────────────────
// Swappable: PocketBase today; a Firebase adapter can implement the same
// interface later (configure/signUp/signIn/signOut/authed/uid/token/list/save/remove).
// Configure the server URL once deployed, e.g. localStorage.pb_url = 'https://api.driverlog.link'
const PB_URL = localStorage.getItem('pb_url') || '';   // '' → cloud sync off (local + guest only)
const COLLECTION = { sessions: 'sessions', fuel: 'fuel', settings: 'settings' };

const PBBackend = (() => {
  let pb = null;
  function client() {
    if (!pb && PB_URL && window.PocketBase) pb = new PocketBase(PB_URL);
    return pb;
  }
  return {
    enabled: () => !!PB_URL && !!window.PocketBase,
    authed: () => { const c = client(); return !!(c && c.authStore.isValid); },
    uid: () => { const c = client(); return c && c.authStore.record ? c.authStore.record.id : null; },
    email: () => { const c = client(); return c && c.authStore.record ? c.authStore.record.email : ''; },
    token: () => { const c = client(); return c ? c.authStore.token : ''; },
    async signUp(email, password, firstName) {
      const c = client();
      // NOTE: the live PB `users` collection schema needs a `firstName` text field added
      // before this survives against a real server; until then this is a no-op extra field
      // server-side and firstName is preserved locally via pb_firstName_<uid>.
      await c.collection('users').create({ email, password, passwordConfirm: password, firstName: firstName || '' });
      return c.collection('users').authWithPassword(email, password);
    },
    signIn(email, password) { return client().collection('users').authWithPassword(email, password); },
    signOut() { const c = client(); if (c) c.authStore.clear(); },
    // list records updated after ISO cursor (server-side filter on PB's `updated`)
    async list(collection, sinceISO) {
      const c = client();
      const filter = sinceISO ? c.filter('updated > {:s}', { s: sinceISO }) : '';
      return c.collection(collection).getFullList({ filter, sort: 'updated' });
    },
    async findByCuid(collection, cuidVal) {
      const c = client();
      try { return await c.collection(collection).getFirstListItem(c.filter('cuid = {:v}', { v: cuidVal })); }
      catch (e) { return null; }   // 404 → not found
    },
    async save(collection, sid, data) {
      const c = client();
      if (sid) {
        try { return await c.collection(collection).update(sid, data); }
        catch (e) { if (e && e.status === 404) return c.collection(collection).create(data); throw e; }
      }
      return c.collection(collection).create(data);
    },
    async remove(collection, sid) {
      const c = client();
      try { await c.collection(collection).delete(sid); }
      catch (e) { if (!(e && e.status === 404)) throw e; }
    }
  };
})();
const Sync = PBBackend;   // alias — point this at a FirebaseBackend later

// ─── SYNC ENGINE ────────────────────────────────────────────────────────
// Local IndexedDB is the working copy; server is source of truth for account
// users. Each syncable record carries: cuid (stable client id for dedupe),
// sid (server id once pushed), updatedAt (ISO), deleted (soft delete), dirty.
const SYNC_STORES = ['sessions', 'fuel'];   // settings stay device-local (prefs)

function cuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
function nowISO() { return new Date().toISOString(); }

// Map a local record → the server payload (server owns `user`, `updated`).
function toServer(store, rec) {
  const base = { cuid: rec.cuid, updatedAt: rec.updatedAt, deleted: !!rec.deleted, user: currentUser && currentUser.id };
  if (store === 'sessions') return { ...base,
    provider: rec.provider || '', serviceType: rec.serviceType, date: rec.date, endDate: rec.endDate || '', startTime: rec.startTime || '', endTime: rec.endTime || '',
    distance: rec.distance, consumption: rec.consumption,
    oilPrice: rec.oilPrice, exp: rec.exp, rev: rec.rev, tip: rec.tip, vehicle: rec.vehicle || '', netRev: rec.netRev };
  return { ...base, station: rec.station, liters: rec.liters, price: rec.price, date: rec.date };
}

async function enqueue(op, store, rec) {
  await dbAdd('outbox', { op, collection: COLLECTION[store], cuid: rec.cuid,
    sid: rec.sid || null, localStore: store, localId: rec.id, data: op === 'delete' ? null : toServer(store, rec) });
  triggerSync();
}

// Register a background sync (fires when connectivity returns, even if app closed),
// and also try an immediate foreground drain when we're online.
async function triggerSync() {
  try {
    const reg = await navigator.serviceWorker.ready;
    if (reg.sync) await reg.sync.register('drain-outbox');
  } catch { /* Background Sync unsupported (e.g. iOS) — foreground path covers it */ }
  if (navigator.onLine) pushOutbox();
}

let pushing = false;
async function pushOutbox() {
  if (pushing || !Sync.enabled() || !Sync.authed() || !navigator.onLine) return;
  pushing = true;
  updateSyncStatus('syncing');
  try {
    const items = await dbAll('outbox');
    for (const item of items) {
      try {
        if (item.op === 'delete') {
          if (item.sid) await Sync.remove(item.collection, item.sid);
        } else {
          let sid = item.sid;
          if (!sid) { const ex = await Sync.findByCuid(item.collection, item.cuid); if (ex) sid = ex.id; }
          const saved = await Sync.save(item.collection, sid, item.data);
          // stamp the server id back onto the local record + clear dirty
          const rec = await dbGet(item.localStore, item.localId);
          if (rec) { rec.sid = saved.id; rec.dirty = false; await dbPut(item.localStore, rec); }
        }
        await dbDel('outbox', item.key);
      } catch (e) { /* leave item in outbox; retry next trigger */ }
    }
  } finally {
    pushing = false;
    const left = await dbAll('outbox');
    updateSyncStatus(left.length ? 'pending' : 'synced');
    if (typeof reload === 'function') await reload();
  }
}

// Pull server changes since the stored cursor and merge into IndexedDB.
async function pullFromServer() {
  if (!Sync.enabled() || !Sync.authed() || !navigator.onLine) return;
  for (const store of SYNC_STORES) {
    const cur = await dbGet('meta', 'cursor:' + store);
    const since = cur ? cur.value : null;
    let recs;
    try { recs = await Sync.list(COLLECTION[store], since); } catch { continue; }
    let maxUpdated = since || '';
    for (const sr of recs) {
      if (sr.updated && sr.updated > maxUpdated) maxUpdated = sr.updated;
      await applyServerRecord(store, sr);
    }
    if (maxUpdated) await dbPut('meta', { key: 'cursor:' + store, value: maxUpdated });
  }
}

// Merge one server record into the local store (match by cuid; last-write-wins).
async function applyServerRecord(store, sr) {
  const all = await dbAll(store);
  const local = all.find(r => r.cuid && r.cuid === sr.cuid) || all.find(r => r.sid && r.sid === sr.id);
  if (sr.deleted) {                       // server says deleted → remove locally
    if (local) await dbDel(store, local.id);
    return;
  }
  // last-write-wins: skip if our local copy is newer and still unsynced
  if (local && local.dirty && local.updatedAt && sr.updatedAt && local.updatedAt > sr.updatedAt) return;
  const merged = fromServer(store, sr, local);
  await dbPut(store, merged);
}

function fromServer(store, sr, local) {
  const uid = currentUser.id;
  const common = { uid, cuid: sr.cuid, sid: sr.id, updatedAt: sr.updatedAt || sr.updated, dirty: false, deleted: false };
  let rec;
  if (store === 'sessions') rec = { provider: sr.provider || '', serviceType: sr.serviceType, date: sr.date, endDate: sr.endDate || '', startTime: sr.startTime || '', endTime: sr.endTime || '', distance: sr.distance,
    consumption: sr.consumption, oilPrice: sr.oilPrice, exp: sr.exp, rev: sr.rev, tip: sr.tip, vehicle: sr.vehicle || '', netRev: sr.netRev };
  else rec = { station: sr.station, liters: sr.liters, price: sr.price, date: sr.date };
  rec = { ...rec, ...common };
  if (local) rec.id = local.id;           // preserve local idb key
  return rec;
}

async function fullSync() {               // on login: push local, then pull cloud
  if (!Sync.enabled() || !Sync.authed()) return;
  // adopt any pre-existing local rows created before login (guest/local) → push them
  await pushOutbox();
  await pullFromServer();
  await pushOutbox();
  if (typeof reload === 'function') await reload();
}

// Cache PB url+token so the service worker can drain the outbox when app is closed.
async function writePbConfig() {
  if (!('caches' in window)) return;
  const cache = await caches.open('driverlog-cfg');
  const body = JSON.stringify({ url: PB_URL, token: Sync.token() });
  await cache.put('/__pb_cfg__', new Response(body, { headers: { 'Content-Type': 'application/json' } }));
}
async function clearPbConfig() {
  if (!('caches' in window)) return;
  const cache = await caches.open('driverlog-cfg');
  await cache.delete('/__pb_cfg__');
}

function updateSyncStatus(state) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  if (isGuest) { el.textContent = 'Guest — this device only'; el.style.color = 'var(--text3)'; return; }
  if (!Sync.enabled()) { el.textContent = 'Local only (no server set)'; el.style.color = 'var(--text3)'; return; }
  if (!Sync.authed()) { el.textContent = 'Not synced'; el.style.color = 'var(--text3)'; return; }
  const map = {
    syncing: ['Syncing…', 'var(--text3)'],
    pending: ['Changes waiting for signal', '#B45309'],
    synced: ['✓ All changes synced', '#047857'],
    offline: ['Offline — changes saved locally', '#B45309']
  };
  const [txt, col] = map[state] || map.synced;
  el.textContent = txt; el.style.color = col;
}

// ─── AUTH ─────────────────────────────────────────────────────────────
const SESSION_KEY = 'gritdrive_uid';
let currentUser = null;
let authMode = 'login';
let isGuest = false;

async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
}
function randomSalt() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2,'0')).join('');
}
async function hashPassword(password, salt) {
  return sha256hex(salt + ':' + password);
}

function setAuthMode(mode) {
  authMode = mode;
  document.getElementById('tab-login').classList.toggle('active', mode === 'login');
  document.getElementById('tab-register').classList.toggle('active', mode === 'register');
  document.getElementById('auth-confirm-wrap').style.display = mode === 'register' ? 'block' : 'none';
  document.getElementById('auth-firstname-wrap').style.display = mode === 'register' ? 'block' : 'none';
  document.getElementById('auth-submit').textContent = mode === 'register' ? t('create_account') : t('login');
  document.getElementById('auth-pass').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  authError('');
}
function authError(msg) {
  const el = document.getElementById('auth-err');
  el.textContent = msg;
  el.classList.toggle('show', !!msg);
}

function guestUsername() {
  // Stable per-device guest identity: "Guest" + 6-digit running number (Guest000001, ...)
  let u = localStorage.getItem('guest_username');
  if (!u) {
    const n = (parseInt(localStorage.getItem('guest_counter') || '0', 10) + 1);
    localStorage.setItem('guest_counter', String(n));
    u = 'Guest' + String(n).padStart(6, '0');
    localStorage.setItem('guest_username', u);
  }
  return u;
}
async function loginGuest() {
  isGuest = true;
  currentUser = {id: 0, username: guestUsername()};
  localStorage.setItem(SESSION_KEY, 'guest');
  sessionStorage.setItem('post_login_toast', t('welcome') + ', ' + currentUser.username + '!');
  location.href = '/app.html';
}

async function submitAuth() {
  const id0 = document.getElementById('auth-user').value.trim().toLowerCase();
  const password = document.getElementById('auth-pass').value;
  const firstNameEl = document.getElementById('auth-firstname');
  const firstName = firstNameEl ? firstNameEl.value.trim() : '';
  const emailish = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(id0);

  if (Sync.enabled()) {
    // Cloud (PocketBase) path — email required
    if (!emailish) { authError('Please enter a valid email address.'); return; }
    if (!password || password.length < 8) { authError('Password must be at least 8 characters.'); return; }
    if (authMode === 'register' && password !== document.getElementById('auth-confirm').value) {
      authError('Passwords do not match.'); return;
    }
    authError(''); setAuthBusy(true);
    try {
      if (authMode === 'register') await Sync.signUp(id0, password, firstName);
      else await Sync.signIn(id0, password);
    } catch (err) {
      setAuthBusy(false);
      authError(prettyAuthError(err)); return;
    }
    currentUser = { id: Sync.uid(), username: id0, email: id0 };
    if (authMode === 'register') {
      currentUser.firstName = firstName;
      if (firstName) localStorage.setItem('pb_firstName_' + Sync.uid(), firstName);
    } else {
      currentUser.firstName = localStorage.getItem('pb_firstName_' + Sync.uid()) || '';
    }
    isGuest = false;
    localStorage.setItem(SESSION_KEY, 'pb:' + Sync.uid());
    await writePbConfig();
    sessionStorage.setItem('post_login_toast', authMode === 'register' ? 'Account created — syncing enabled' : t('welcome_back') + '!');
    sessionStorage.setItem('post_login_fullsync', '1');
    location.href = '/app.html';
    return;
  }

  // Local-only fallback (no server configured) — keyed by email/username string
  if (!id0 || id0.length < 3) { authError('Enter an email or username (3+ chars).'); return; }
  if (!password || password.length < 4) { authError('Password must be at least 4 characters.'); return; }
  if (authMode === 'register') {
    if (password !== document.getElementById('auth-confirm').value) { authError('Passwords do not match.'); return; }
    if (await dbGetByUsername(id0)) { authError('That account already exists on this device.'); return; }
    const salt = randomSalt();
    const hash = await hashPassword(password, salt);
    const id = await dbAdd('users', {username:id0, salt, hash, firstName, createdAt: new Date().toISOString()});
    currentUser = {id, username:id0, firstName};
    isGuest = false;
    localStorage.setItem(SESSION_KEY, String(id));
    sessionStorage.setItem('post_login_toast', t('welcome') + ', ' + id0 + '!');
    location.href = '/app.html';
  } else {
    const user = await dbGetByUsername(id0);
    if (!user) { authError('No account with that email on this device.'); return; }
    const hash = await hashPassword(password, user.salt);
    if (hash !== user.hash) { authError('Incorrect password.'); return; }
    currentUser = {id: user.id, username: user.username, firstName: user.firstName || ''};
    isGuest = false;
    localStorage.setItem(SESSION_KEY, String(user.id));
    sessionStorage.setItem('post_login_toast', t('welcome_back') + ', ' + user.username + '!');
    location.href = '/app.html';
  }
}
function setAuthBusy(b) {
  const btn = document.getElementById('auth-submit');
  if (btn) { btn.disabled = b; btn.style.opacity = b ? '0.6' : '1'; }
}
function prettyAuthError(err) {
  const m = (err && err.message) || '';
  if (/failed to authenticate|invalid/i.test(m)) return 'Incorrect email or password.';
  if (/email.*already|unique/i.test(m)) return 'That email is already registered.';
  if (/Failed to fetch|network/i.test(m)) return 'Cannot reach the server. Check your connection.';
  return m || 'Something went wrong. Please try again.';
}

async function logout() {
  localStorage.removeItem(SESSION_KEY);
  if (Sync.enabled()) Sync.signOut();
  await clearPbConfig();
  sessionStorage.setItem('post_login_toast', t('logged_out'));
  location.href = '/login.html';
}

// ─── STATE ────────────────────────────────────────────────────────────
let sessions = [], fuels = [], settings = {lang:'th', unit:'km'};
let currentPeriod = 'today';
let trendChart = null;
const TYPE_ICON = {Car:'🚗',Bike:'🏍️',Food:'🍔',Express:'📦'};
const TYPE_COLOR = {Car:'#FEF3C7',Bike:'#FCE7F3',Food:'#DBEAFE',Express:'#D1FAE5'};
const PROVIDERS = ['Grab','Lineman','Bolt','Shopee','Taxi'];
// Split legacy combined serviceType ("GrabCar") -> {provider,type}; new records store both.
function normSvc(s) {
  if (s && s.provider) return {provider: s.provider, type: s.serviceType || 'Car'};
  const st = (s && s.serviceType) || '';
  for (const p of PROVIDERS) { if (st.startsWith(p)) return {provider: p, type: st.slice(p.length) || 'Car'}; }
  return {provider: 'Grab', type: st || 'Car'};
}
function typeLabel(type) { return t('type_' + String(type).toLowerCase()) || type; }
function svcLabel(s) { const n = normSvc(s); return `${n.provider} ${typeLabel(n.type)}`; }
const SVC_ICON = TYPE_ICON, SVC_COLOR = TYPE_COLOR;

// ─── I18N ─────────────────────────────────────────────────────────────
const I18N = {
  en: {
    login: 'Log in', create_account: 'Create account', email: 'Email', password: 'Password',
    confirm_password: 'Confirm password', login_guest: 'Login as Guest',
    auth_hint: 'Create an account to save your log on this device.<br>Cloud sync across devices is coming soon.<br>Guest mode is temporary.',
    nav_dashboard: 'Dashboard', nav_sessions: 'Sessions', nav_fuel: 'Fuel', nav_settings: 'Settings',
    period_today: 'Today', period_week: 'This week', period_month: 'This month', period_all: 'All time',
    period_custom: 'Custom', period_custom_range: 'Custom range', to: 'to',
    net_revenue: 'Net revenue', revenue: 'Revenue', tips: 'Tips', fuel_exp: 'Fuel exp',
    distance: 'Distance', fuel_cost_ratio: 'Fuel cost ratio', avg_per_session: 'Avg / session',
    net_revenue_lower: 'net revenue', total_revenue: 'Total revenue', before_expenses: 'before expenses',
    earnings_trend: 'Earnings trend', by_service_type: 'By service type', best_time: 'Best time to drive',
    top_days: 'Top earning days', no_data: 'No data yet', ratio_good: 'Good', ratio_watch: 'Watch it',
    ratio_high: 'High',
    sessions_title: 'Sessions', fuel_log_title: 'Fuel log', settings_title: 'Settings',
    refill_history: 'Refill history', add_refill: 'Add refill', gas_station: 'Gas station',
    liters: 'Liters', total_price: 'Total price (฿)', date: 'Date', save_refill: 'Save refill',
    total_spent: 'Total spent', total_liters: 'Total liters', avg_per_liter: 'Avg ฿/L',
    no_refills: 'No refills logged yet.', unknown_station: 'Unknown station',
    account: 'Account', local_account: 'Local account on this device', sync_app: 'Sync & app',
    sync_status: 'Sync status', local_only: 'Local only', install_app: 'Install app', install: 'Install',
    preferences: 'Preferences', language: 'Language', distance_unit: 'Distance unit',
    km_option: 'Kilometers (km)', mi_option: 'Miles (mi)', currency: 'Currency', export_data: 'Export data',
    image_word: 'Image', about: 'About', app_word: 'App', version: 'Version',
    total_sessions: 'Total sessions', created_by: 'Created by', logout: 'Log out',
    log_session: 'Log session', edit_session: 'Edit session', service_type: 'Service type',
    trip_details: 'Trip details', distance_km: 'Distance (km)', consumption: 'Consumption (km/L)',
    oil_price: 'Oil price (฿/L)', fuel_expense: 'Fuel expense (฿)', revenue_b: 'Revenue (฿)',
    extra_tip: 'Extra tip (฿)', save_session: 'Save session', cancel: 'Cancel',
    no_sessions: 'No sessions yet.', tap_to_log: 'Tap + to log your first drive.',
    onboard_welcome_title: 'Welcome to DriverLog!',
    onboard_welcome_title_named: 'Welcome, {name}!',
    onboard_welcome_body: 'Track your driving income, fuel costs, and profit per shift — right on your phone.',
    onboard_cta: 'Log your first session',
    fuel_word: 'fuel', rev_word: 'rev', session_word: 'session', sessions_count: 'sessions',
    per_session: 'session',
    session_saved: 'Session saved!', session_deleted: 'Session deleted', refill_saved: 'Refill saved!',
    deleted: 'Deleted', enter_date: 'Please enter a date', rev_gt_zero: 'Revenue must be greater than 0',
    neg_not_allowed: 'Values cannot be negative', liters_gt_zero: 'Liters must be greater than 0',
    enter_date_price: 'Please enter date and price', delete_session_confirm: 'Delete this session?',
    delete_refill_confirm: 'Delete this refill?', logged_out: 'Logged out', greeting: 'Hello',
    greeting_morning: 'Good morning, {name}', greeting_afternoon: 'Good afternoon, {name}', greeting_evening: 'Good evening, {name}',
    first_name: 'First name',
    welcome: 'Welcome', welcome_back: 'Welcome back',
    profitability: 'Is this shift profitable?', profit_margin: 'Profit margin', profit_per: 'Profit /',
    break_even: 'Break-even fuel', be_now: 'now', coach: 'Coach',
    verdict_loss: 'Losing money', verdict_breakeven: 'Breaking even', verdict_thin: 'Thin margin',
    verdict_ok: 'Profitable', verdict_great: 'Very profitable',
    tip_loss: 'This period ran at a loss. Cut fuel costs or take higher-paying trips.',
    tip_thin: 'Thin margins — fuel is {r}% of revenue. Aim under 25%.',
    tip_fuel: 'Fuel is {r}% of revenue. Try refueling at cheaper stations.',
    tip_healthy: 'Healthy margin — keep it up!',
    start_time: 'Start time', end_time: 'End time', duration: 'Duration',
    earn_per_hour: 'Earnings / hour', hour_unit: 'hr',
    vs_today: 'vs yesterday', vs_week: 'vs last week', vs_month: 'vs last month',
    vs_custom: 'vs previous', vs_prev: 'vs previous',
    image_exported: 'Image saved!', image_export_fail: 'Could not export image',
    select_provider: 'Select provider', end_date: 'End date',
    type_car: 'Car', type_bike: 'Bike', type_food: 'Food', type_express: 'Express',
    ad_label: 'Sponsored', privacy_policy: 'Privacy policy',
    affiliate_label: 'Partner offer', affiliate_fuel_title: 'Fuel card partner', affiliate_fuel_body: 'Save on every fill-up. Partner offers coming soon.', affiliate_cta: 'Coming soon',
    appearance: 'Appearance', theme_light: 'Light', theme_dark: 'Dark', theme_auto: 'Auto',
    send_feedback: 'Send feedback', monthly_word: 'Monthly', backup_word: 'Backup', exported: 'Exported!',
    restore_word: 'Restore',
    restore_confirm: 'Restore this backup? It will REPLACE this account\'s {n} current entries (sessions + fuel) with the backup. This cannot be undone.',
    restore_done: 'Restored {n} entries',
    restore_bad_file: 'Not a valid DriverLog backup file',
    weekly_recap: 'Weekly earnings recap', recap_this_week: 'This week so far', recap_shifts: 'Shifts',
    recap_vs_last_week: 'vs last week', recap_no_prev: 'No data for last week yet',
    vehicle: 'Vehicle', vehicle_placeholder: 'e.g. Honda Click 125i', all_vehicles: 'All vehicles',
    consent_text: 'We use cookies to show ads and understand basic usage. You can accept or reject non-essential cookies — the app works the same either way.',
    consent_accept: 'Accept', consent_reject: 'Reject', consent_thanks: 'Thanks!',
    ad_consent: 'Ad & cookie consent', consent_status_granted: 'Accepted · change', consent_status_denied: 'Rejected · change', consent_status_unset: 'Set preference',
    reminders: 'Reminders', shift_reminders: 'Shift reminders', shift_reminders_helper: 'Notifications require app permission (coming soon)',
  },
  th: {
    login: 'เข้าสู่ระบบ', create_account: 'สร้างบัญชี', email: 'อีเมล', password: 'รหัสผ่าน',
    confirm_password: 'ยืนยันรหัสผ่าน', login_guest: 'เข้าใช้แบบผู้เยี่ยมชม',
    auth_hint: 'สร้างบัญชีเพื่อบันทึกข้อมูลในเครื่องนี้<br>การซิงก์ข้ามอุปกรณ์กำลังจะมา<br>โหมดผู้เยี่ยมชมเป็นแบบชั่วคราว',
    nav_dashboard: 'แดชบอร์ด', nav_sessions: 'บันทึก', nav_fuel: 'เติมน้ำมัน', nav_settings: 'ตั้งค่า',
    period_today: 'วันนี้', period_week: 'สัปดาห์นี้', period_month: 'เดือนนี้', period_all: 'ทั้งหมด',
    period_custom: 'กำหนดเอง', period_custom_range: 'ช่วงที่กำหนด', to: 'ถึง',
    net_revenue: 'รายได้สุทธิ', revenue: 'รายได้', tips: 'ทิป', fuel_exp: 'ค่าน้ำมัน',
    distance: 'ระยะทาง', fuel_cost_ratio: 'สัดส่วนค่าน้ำมัน', avg_per_session: 'เฉลี่ย/รอบ',
    net_revenue_lower: 'รายได้สุทธิ', total_revenue: 'รายได้รวม', before_expenses: 'ก่อนหักค่าใช้จ่าย',
    earnings_trend: 'แนวโน้มรายได้', by_service_type: 'แยกตามประเภทบริการ', best_time: 'ช่วงเวลาที่ดีที่สุด',
    top_days: 'วันที่รายได้สูงสุด', no_data: 'ยังไม่มีข้อมูล', ratio_good: 'ดี', ratio_watch: 'ระวัง',
    ratio_high: 'สูง',
    sessions_title: 'บันทึก', fuel_log_title: 'บันทึกน้ำมัน', settings_title: 'ตั้งค่า',
    refill_history: 'ประวัติการเติม', add_refill: 'เพิ่มการเติม', gas_station: 'ปั๊มน้ำมัน',
    liters: 'ลิตร', total_price: 'ราคารวม (฿)', date: 'วันที่', save_refill: 'บันทึกการเติม',
    total_spent: 'ใช้จ่ายรวม', total_liters: 'ลิตรรวม', avg_per_liter: 'เฉลี่ย ฿/ล.',
    no_refills: 'ยังไม่มีการเติมน้ำมัน', unknown_station: 'ไม่ระบุปั๊ม',
    account: 'บัญชี', local_account: 'บัญชีในเครื่องนี้', sync_app: 'ซิงก์และแอป',
    sync_status: 'สถานะซิงก์', local_only: 'เฉพาะในเครื่อง', install_app: 'ติดตั้งแอป', install: 'ติดตั้ง',
    preferences: 'การตั้งค่า', language: 'ภาษา', distance_unit: 'หน่วยระยะทาง',
    km_option: 'กิโลเมตร (km)', mi_option: 'ไมล์ (mi)', currency: 'สกุลเงิน', export_data: 'ส่งออกข้อมูล',
    image_word: 'รูปภาพ', about: 'เกี่ยวกับ', app_word: 'แอป', version: 'เวอร์ชัน',
    total_sessions: 'รอบทั้งหมด', created_by: 'สร้างโดย', logout: 'ออกจากระบบ',
    log_session: 'บันทึกรอบ', edit_session: 'แก้ไขรอบ', service_type: 'ประเภทบริการ',
    trip_details: 'รายละเอียดการเดินทาง', distance_km: 'ระยะทาง (km)', consumption: 'อัตราสิ้นเปลือง (km/L)',
    oil_price: 'ราคาน้ำมัน (฿/ล.)', fuel_expense: 'ค่าน้ำมัน (฿)', revenue_b: 'รายได้ (฿)',
    extra_tip: 'ทิปเพิ่ม (฿)', save_session: 'บันทึกรอบ', cancel: 'ยกเลิก',
    no_sessions: 'ยังไม่มีรายการ', tap_to_log: 'แตะ + เพื่อบันทึกรอบแรก',
    onboard_welcome_title: 'ยินดีต้อนรับสู่ DriverLog!',
    onboard_welcome_title_named: 'ยินดีต้อนรับ, {name}!',
    onboard_welcome_body: 'บันทึกรายได้ ค่าน้ำมัน และกำไรในแต่ละรอบขับ ได้ง่ายๆ บนมือถือของคุณ',
    onboard_cta: 'บันทึกรอบแรกของคุณ',
    fuel_word: 'ค่าน้ำมัน', rev_word: 'รายได้', session_word: 'รอบ', sessions_count: 'รอบ',
    per_session: 'รอบ',
    session_saved: 'บันทึกรอบแล้ว', session_deleted: 'ลบรอบแล้ว', refill_saved: 'บันทึกการเติมแล้ว',
    deleted: 'ลบแล้ว', enter_date: 'กรุณาระบุวันที่', rev_gt_zero: 'รายได้ต้องมากกว่า 0',
    neg_not_allowed: 'ค่าต้องไม่ติดลบ', liters_gt_zero: 'จำนวนลิตรต้องมากกว่า 0',
    enter_date_price: 'กรุณาระบุวันที่และราคา', delete_session_confirm: 'ลบรอบนี้?',
    delete_refill_confirm: 'ลบการเติมนี้?', logged_out: 'ออกจากระบบแล้ว', greeting: 'สวัสดี',
    greeting_morning: 'สวัสดีตอนเช้า, {name}', greeting_afternoon: 'สวัสดีตอนบ่าย, {name}', greeting_evening: 'สวัสดีตอนเย็น, {name}',
    first_name: 'ชื่อจริง',
    welcome: 'ยินดีต้อนรับ', welcome_back: 'ยินดีต้อนรับกลับ',
    profitability: 'กะนี้คุ้มไหม?', profit_margin: 'อัตรากำไร', profit_per: 'กำไรต่อ',
    break_even: 'จุดคุ้มทุนน้ำมัน', be_now: 'ตอนนี้', coach: 'โค้ช',
    verdict_loss: 'ขาดทุน', verdict_breakeven: 'เท่าทุน', verdict_thin: 'กำไรบาง',
    verdict_ok: 'มีกำไร', verdict_great: 'กำไรดีมาก',
    tip_loss: 'ช่วงนี้ขาดทุน ลดค่าน้ำมันหรือรับงานที่ได้ค่าตอบแทนสูงขึ้น',
    tip_thin: 'กำไรบาง — ค่าน้ำมันคิดเป็น {r}% ของรายได้ ควรต่ำกว่า 25%',
    tip_fuel: 'ค่าน้ำมันคิดเป็น {r}% ของรายได้ ลองเติมที่ปั๊มที่ถูกกว่า',
    tip_healthy: 'อัตรากำไรดี รักษาไว้แบบนี้!',
    start_time: 'เวลาเริ่ม', end_time: 'เวลาสิ้นสุด', duration: 'ระยะเวลา',
    earn_per_hour: 'รายได้ต่อชั่วโมง', hour_unit: 'ชม.',
    vs_today: 'เทียบกับเมื่อวาน', vs_week: 'เทียบกับสัปดาห์ก่อน', vs_month: 'เทียบกับเดือนก่อน',
    vs_custom: 'เทียบกับช่วงก่อน', vs_prev: 'เทียบกับช่วงก่อน',
    image_exported: 'บันทึกรูปแล้ว!', image_export_fail: 'ส่งออกรูปไม่สำเร็จ',
    select_provider: 'เลือกผู้ให้บริการ', end_date: 'วันที่สิ้นสุด',
    type_car: 'รถยนต์', type_bike: 'มอเตอร์ไซค์', type_food: 'อาหาร', type_express: 'ส่งของ',
    ad_label: 'โฆษณา', privacy_policy: 'นโยบายความเป็นส่วนตัว',
    affiliate_label: 'ข้อเสนอจากพาร์ทเนอร์', affiliate_fuel_title: 'บัตรเติมน้ำมันพาร์ทเนอร์', affiliate_fuel_body: 'ประหยัดทุกครั้งที่เติมน้ำมัน ข้อเสนอพาร์ทเนอร์เร็วๆ นี้', affiliate_cta: 'เร็วๆ นี้',
    appearance: 'ธีม', theme_light: 'สว่าง', theme_dark: 'มืด', theme_auto: 'อัตโนมัติ',
    send_feedback: 'ส่งความคิดเห็น', monthly_word: 'รายเดือน', backup_word: 'สำรองข้อมูล', exported: 'ส่งออกแล้ว!',
    restore_word: 'กู้คืนข้อมูล',
    restore_confirm: 'กู้คืนข้อมูลสำรองนี้? จะ แทนที่ รายการปัจจุบัน {n} รายการ (กะงาน + น้ำมัน) ของบัญชีนี้ด้วยข้อมูลสำรอง ยกเลิกไม่ได้',
    restore_done: 'กู้คืน {n} รายการแล้ว',
    restore_bad_file: 'ไฟล์สำรองข้อมูล DriverLog ไม่ถูกต้อง',
    weekly_recap: 'สรุปรายได้ประจำสัปดาห์', recap_this_week: 'สัปดาห์นี้ (จนถึงตอนนี้)', recap_shifts: 'รอบงาน',
    recap_vs_last_week: 'เทียบกับสัปดาห์ก่อน', recap_no_prev: 'ยังไม่มีข้อมูลสัปดาห์ก่อน',
    vehicle: 'ยานพาหนะ', vehicle_placeholder: 'เช่น Honda Click 125i', all_vehicles: 'ทุกคัน',
    consent_text: 'เราใช้คุกกี้เพื่อแสดงโฆษณาและทำความเข้าใจการใช้งานเบื้องต้น คุณสามารถยอมรับหรือปฏิเสธคุกกี้ที่ไม่จำเป็นได้ แอปทำงานเหมือนเดิมไม่ว่าจะเลือกแบบไหน',
    consent_accept: 'ยอมรับ', consent_reject: 'ปฏิเสธ', consent_thanks: 'ขอบคุณค่ะ',
    ad_consent: 'โฆษณาและคุกกี้', consent_status_granted: 'ยอมรับแล้ว · แก้ไข', consent_status_denied: 'ปฏิเสธแล้ว · แก้ไข', consent_status_unset: 'ตั้งค่า',
    reminders: 'การแจ้งเตือน', shift_reminders: 'แจ้งเตือนกะ', shift_reminders_helper: 'ต้องได้รับอนุญาตจากแอป (เร็วๆ นี้)',
  }
};
function curLang() {
  return (currentUser && settings && settings.lang) || localStorage.getItem('ui_lang') || 'th';
}
function t(key) {
  const l = curLang();
  return (I18N[l] && I18N[l][key]) ?? I18N.en[key] ?? key;
}
function greetingPeriod() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : (h < 18 ? 'afternoon' : 'evening');
}

// ─── THAI DATES (Gregorian year, no Buddhist-era conversion) ───────────
const TH_MONTHS_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const TH_MONTHS_FULL = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
const TH_DAYS_SHORT = ["อา.","จ.","อ.","พ.","พฤ.","ศ.","ส."];
const TH_DAYS_FULL = ["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์"];
// fmt: 'short' -> "4 ก.ค. 2026", 'full' -> "วันเสาร์, 4 กรกฎาคม 2026", 'month-year' -> "กรกฎาคม 2026"
function thaiDate(d, fmt = 'short') {
  const day = d.getDate(), month = d.getMonth(), year = d.getFullYear(), dow = d.getDay();
  if (fmt === 'month-year') return `${TH_MONTHS_FULL[month]} ${year}`;
  if (fmt === 'full') return `${TH_DAYS_FULL[dow]}, ${day} ${TH_MONTHS_FULL[month]} ${year}`;
  return `${day} ${TH_MONTHS_SHORT[month]} ${year}`;
}

// ─── INIT ─────────────────────────────────────────────────────────────
// restoreSession(): reads the session key and, if valid, populates currentUser/
// isGuest. Returns true/false. Shared by both login.html and app.html so each
// page can decide whether to show its own screen or redirect to the other.
async function restoreSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  // Restore a cloud (PocketBase) session if the token is still valid
  if (raw && raw.startsWith('pb:') && Sync.enabled() && Sync.authed()) {
    const email = Sync.email() || 'Driver';
    currentUser = { id: Sync.uid(), username: email, email };
    currentUser.firstName = localStorage.getItem('pb_firstName_' + Sync.uid()) || '';
    isGuest = false;
    await writePbConfig();
    return true;
  }
  if (raw && raw.startsWith('pb:')) { localStorage.removeItem(SESSION_KEY); return false; }  // expired token
  if (raw === 'guest') {
    isGuest = true;
    currentUser = {id: 0, username: 'Guest'};
    return true;
  }
  const uid = parseInt(raw);
  if (uid) {
    const users = await dbAll('users');
    const u = users.find(x => x.id === uid);
    if (u) {
      currentUser = {id: u.id, username: u.username, firstName: u.firstName || ''};
      isGuest = false;
      return true;
    }
    localStorage.removeItem(SESSION_KEY);
  }
  return false;
}

// Toast left behind by a redirecting action (login/logout) on the other page.
function showPostLoginToast() {
  const msg = sessionStorage.getItem('post_login_toast');
  if (msg) { sessionStorage.removeItem('post_login_toast'); toast(msg); }
}

// Entry point for login.html: already-authed devices skip straight to the app.
async function bootLogin() {
  applyTheme();
  await openDB();
  if (await restoreSession()) { location.replace('/app.html'); return; }
  applyLang();
  showPostLoginToast();
}

// Entry point for app.html: no session → bounce to login.html.
async function bootApp() {
  applyTheme();
  { const _v = document.getElementById('app-version'); if (_v) _v.textContent = APP_VERSION; }
  await openDB();
  if (!(await restoreSession())) { location.replace('/login.html'); return; }
  await enterApp();
  if (sessionStorage.getItem('post_login_fullsync')) {
    sessionStorage.removeItem('post_login_fullsync');
    await fullSync();   // pull cloud data, push anything local, right after a fresh cloud login
  }
  showPostLoginToast();
  initConsentBanner();
}

// ─── CONSENT BANNER (EU User Consent Policy / Consent Mode v2) ───────────
// Google's consent defaults to fully "denied" (see the inline script in
// app.html's <head>) until this actually records a real visitor choice via
// gtag('consent','update', ...). Without this, ad_storage/analytics_storage
// stay denied forever and ads may never serve, even once AdSense approves
// the site — this closes that gap.
const CONSENT_KEY = 'consent_choice';   // 'granted' | 'denied'
function initConsentBanner() {
  const choice = localStorage.getItem(CONSENT_KEY);
  if (choice === 'granted' || choice === 'denied') {
    applyConsentChoice(choice, /*isInitialLoad*/ true);
    return;   // already decided on this device — don't nag the driver again
  }
  const el = document.getElementById('consent-banner');
  if (el) el.style.display = 'block';
}
function applyConsentChoice(choice, isInitialLoad) {
  if (typeof gtag !== 'function') return;
  const granted = choice === 'granted';
  gtag('consent', 'update', {
    ad_storage: granted ? 'granted' : 'denied',
    ad_user_data: granted ? 'granted' : 'denied',
    ad_personalization: granted ? 'granted' : 'denied',
    analytics_storage: granted ? 'granted' : 'denied'
  });
  if (!isInitialLoad) {
    const el = document.getElementById('consent-banner');
    if (el) el.style.display = 'none';
  }
}
function acceptConsent() {
  localStorage.setItem(CONSENT_KEY, 'granted');
  applyConsentChoice('granted', false);
  refreshConsentStatusLabel();
  toast(t('consent_thanks'));
}
function rejectConsent() {
  localStorage.setItem(CONSENT_KEY, 'denied');
  applyConsentChoice('denied', false);
  refreshConsentStatusLabel();
}
// Re-open the consent banner so a driver can withdraw or change a prior
// choice — EU consent policy requires withdrawing to be as easy as granting.
function manageConsent() {
  const el = document.getElementById('consent-banner');
  if (el) el.style.display = 'block';
}
// Reflect the stored choice on the Settings "Ad & cookie consent" control.
function refreshConsentStatusLabel() {
  const btn = document.getElementById('consent-manage-btn');
  if (!btn) return;
  const choice = localStorage.getItem(CONSENT_KEY);
  const key = choice === 'granted' ? 'consent_status_granted'
            : choice === 'denied'  ? 'consent_status_denied'
            : 'consent_status_unset';
  btn.textContent = t(key);
}

async function enterApp() {
  document.body.classList.add('authed');

  settings = {lang:'th', unit:'km'};
  const sAll = await dbAll('settings');
  const prefix = isGuest ? 'guest:' : (currentUser.id + ':');
  sAll.forEach(s => { if (s.key.startsWith(prefix)) settings[s.key.slice(prefix.length)] = s.value; });

  await reload();
  setToday();
  applyLang();
  applyUser();
  document.getElementById('set-lang').value = settings.lang || 'th';
  document.getElementById('set-unit').value = settings.unit || 'km';
  document.getElementById('set-theme').value = localStorage.getItem('ui_theme') || 'light';
  restoreShiftRemindersToggle();
  document.getElementById('f-fdate').value = todayISO();
  document.getElementById('s-date').value = todayISO();
  updateSyncStatus(navigator.onLine ? 'synced' : 'offline');
  switchScreen('dash');
  pushAds();
  // pull cloud changes in the background (won't block first paint)
  if (!isGuest && Sync.enabled() && Sync.authed()) pullFromServer().then(reload);
}

function applyUser() {
  const name = currentUser.username;
  const initial = name.charAt(0).toUpperCase();
  document.getElementById('dash-avatar').textContent = initial;
  document.getElementById('acct-avatar').textContent = initial;
  document.getElementById('acct-name').textContent = name + (isGuest ? ' (temporary)' : '');
  const sub = document.getElementById('acct-since');
  if (sub) sub.textContent = isGuest ? 'Temporary guest — not synced'
    : (Sync.enabled() && Sync.authed()) ? 'Synced across your devices' : 'Local account on this device';
  const logoutBtn = document.querySelector('.btn-logout');
  if (logoutBtn) logoutBtn.style.display = isGuest ? 'none' : 'block';
}

async function reload() {
  const uid = isGuest ? 'guest' : currentUser.id;
  sessions = (await dbAll('sessions')).filter(s => s.uid === uid);
  sessions.sort((a,b) => b.date.localeCompare(a.date));
  fuels = (await dbAll('fuel')).filter(f => f.uid === uid);
  fuels.sort((a,b) => b.date.localeCompare(a.date));
  renderDashboard();
  renderSessions();
  renderFuel();
  document.getElementById('set-count').textContent = sessions.length;
  const badge = document.getElementById('sessions-badge');
  if (sessions.length > 0) {
    badge.textContent = sessions.length;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

// ─── DATES ────────────────────────────────────────────────────────────
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function setToday() {
  const d = new Date();
  if (curLang() === 'th') {
    document.getElementById('dash-date').textContent = thaiDate(d, 'full');
    return;
  }
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  document.getElementById('dash-date').textContent = `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
function filterByPeriod(period) {
  const today = todayISO();
  const d = new Date();
  if (period === 'today') return sessions.filter(s => s.date === today);
  if (period === 'week') {
    const start = new Date(d); start.setDate(d.getDate() - d.getDay());
    const startISO = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`;
    return sessions.filter(s => s.date >= startISO && s.date <= today);
  }
  if (period === 'month') {
    const m = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    return sessions.filter(s => s.date.startsWith(m));
  }
  if (period === 'custom') {
    const s = document.getElementById('range-start').value;
    const e = document.getElementById('range-end').value;
    if (!s || !e) return sessions;
    return sessions.filter(x => x.date >= s && x.date <= e);
  }
  return sessions; // all
}

function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
// Sessions from the PREVIOUS comparable period (for change vs last period).
function prevFilterByPeriod(period) {
  const d = new Date();
  if (period === 'today') {
    const y = new Date(d); y.setDate(d.getDate() - 1);
    const yi = isoOf(y); return sessions.filter(s => s.date === yi);
  }
  if (period === 'week') {
    const curStart = new Date(d); curStart.setDate(d.getDate() - d.getDay());
    const prevStart = new Date(curStart); prevStart.setDate(curStart.getDate() - 7);
    const prevEnd = new Date(curStart); prevEnd.setDate(curStart.getDate() - 1);
    const a = isoOf(prevStart), b = isoOf(prevEnd);
    return sessions.filter(s => s.date >= a && s.date <= b);
  }
  if (period === 'month') {
    const pm = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const key = `${pm.getFullYear()}-${String(pm.getMonth()+1).padStart(2,'0')}`;
    return sessions.filter(s => s.date.startsWith(key));
  }
  if (period === 'custom') {
    const s = document.getElementById('range-start').value;
    const e = document.getElementById('range-end').value;
    if (!s || !e) return [];
    const sd = new Date(s+'T12:00:00'), ed = new Date(e+'T12:00:00');
    const len = Math.round((ed - sd) / 86400000);
    const prevEnd = new Date(sd); prevEnd.setDate(sd.getDate() - 1);
    const prevStart = new Date(prevEnd); prevStart.setDate(prevEnd.getDate() - len);
    const a = isoOf(prevStart), b = isoOf(prevEnd);
    return sessions.filter(x => x.date >= a && x.date <= b);
  }
  return []; // 'all' → no prior period to compare
}

// ─── DASHBOARD ────────────────────────────────────────────────────────
function renderDashboard() {
  const emptyEl = document.getElementById('dash-empty-state');
  const statGrid = document.getElementById('stat-grid');
  if (emptyEl) {
    const noSessions = sessions.length === 0;
    emptyEl.style.display = noSessions ? 'block' : 'none';
    if (statGrid) statGrid.style.display = noSessions ? 'none' : '';
    document.querySelectorAll('#s-dash .content > .section-title, #s-dash .content > .insight-card, #s-dash .content > .chart-card, #s-dash .content > .service-grid').forEach(node => {
      node.style.display = noSessions ? 'none' : '';
    });
    if (noSessions) return;
  }
  const filtered = filterByPeriod(currentPeriod);
  const totalNet = filtered.reduce((a,s) => a + (s.netRev||0), 0);
  const totalRev = filtered.reduce((a,s) => a + s.rev, 0);
  const totalTip = filtered.reduce((a,s) => a + (s.tip||0), 0);
  const totalExp = filtered.reduce((a,s) => a + s.exp, 0);
  const totalDist = filtered.reduce((a,s) => a + s.distance, 0);
  const totalHours = filtered.reduce((a,s) => a + sessionHours(s), 0);
  const perHour = totalHours > 0 ? totalNet / totalHours : 0;
  const unit = settings.unit === 'mi' ? 'mi' : 'km';
  const distVal = settings.unit === 'mi' ? totalDist * 0.621371 : totalDist;

  const periodKeys = {today:'period_today',week:'period_week',month:'period_month',all:'period_all',custom:'period_custom_range'};
  document.getElementById('hero-label').textContent = `${t('net_revenue')} — ${t(periodKeys[currentPeriod]) || ''}`;
  document.getElementById('hero-amt').textContent = '฿' + fmt(totalNet);

  // change vs previous comparable period
  const prevNet = prevFilterByPeriod(currentPeriod).reduce((a,s) => a + (s.netRev||0), 0);
  renderHeroDelta(totalNet, prevNet, currentPeriod);
  document.getElementById('h-rev').textContent = '฿' + fmt(totalRev);
  document.getElementById('h-tip').textContent = '฿' + fmt(totalTip);
  document.getElementById('h-exp').textContent = '฿' + fmt(totalExp);

  document.getElementById('g-dist').textContent = fmt(distVal,1) + ' ' + unit;
  document.getElementById('g-sessions').textContent = `${filtered.length} ${t('sessions_count')}`;

  const ratio = totalRev > 0 ? (totalExp / totalRev * 100) : 0;
  document.getElementById('g-ratio').textContent = fmt(ratio,1) + '%';
  const badge = ratio < 20 ? `<span class="badge badge-good">${t('ratio_good')}</span>`
    : ratio < 35 ? `<span class="badge badge-warn">${t('ratio_watch')}</span>`
    : `<span class="badge badge-bad">${t('ratio_high')}</span>`;
  document.getElementById('g-ratio-badge').innerHTML = badge;

  const avgNet = filtered.length > 0 ? totalNet / filtered.length : 0;
  document.getElementById('g-avg').textContent = '฿' + fmt(avgNet);
  document.getElementById('g-totrev').textContent = '฿' + fmt(totalRev + totalTip);

  renderProfitInsights(filtered, {grossRev: totalRev + totalTip, profit: totalNet, exp: totalExp, ratio, unit, distVal, totalHours, perHour});
  renderWeeklyRecap();
  renderTrend(filtered);
  renderSvcBreakdown(filtered);
  renderTimeInsights(filtered);
  renderDayInsights(filtered);
}

// Change & %change vs previous comparable period, shown under the hero amount.
function renderHeroDelta(cur, prev, period) {
  const el = document.getElementById('hero-delta');
  if (!el) return;
  if (period === 'all') { el.style.display = 'none'; return; }
  const delta = cur - prev;
  const pct = prev !== 0 ? (delta / Math.abs(prev) * 100) : (cur !== 0 ? 100 : 0);
  const up = delta >= 0;
  const arrow = up ? '▲' : '▼';
  const col = up ? '#047857' : 'var(--red)';   // readable on the neutral hero card (matches insight-row deltas)
  const sign = up ? '+' : '−';
  const label = t('vs_' + period) || t('vs_prev');
  el.style.display = 'block';
  el.innerHTML = `<span style="color:${col};font-weight:700">${arrow} ${sign}฿${fmt(Math.abs(delta))} (${sign}${fmt(Math.abs(pct),0)}%)</span> <span style="opacity:.8">${label}</span>`;
}

// P6 — Personal Finance Coach: "Is this shift profitable?"
function renderProfitInsights(filtered, m) {
  const el = document.getElementById('profit-insights');
  if (!el) return;
  if (filtered.length === 0) {
    el.innerHTML = `<div style="padding:16px;color:var(--text3);font-size:13px;text-align:center">${t('no_data')}</div>`;
    return;
  }
  const gross = m.grossRev, profit = m.profit, ratio = m.ratio;
  const margin = gross > 0 ? (profit / gross * 100) : 0;
  const perDist = m.distVal > 0 ? profit / m.distVal : 0;
  // total liters used across the period → break-even fuel price
  let liters = 0;
  filtered.forEach(s => { if (s.consumption > 0) liters += s.distance / s.consumption; });
  const avgOil = liters > 0 ? m.exp / liters : 0;
  const beOil = liters > 0 ? gross / liters : 0;   // oil price where profit hits 0

  // verdict tier
  let vKey, vCls;
  if (profit <= 0)      { vKey = 'verdict_loss';      vCls = 'badge-bad'; }
  else if (margin < 15) { vKey = 'verdict_breakeven'; vCls = 'badge-warn'; }
  else if (margin < 35) { vKey = 'verdict_thin';      vCls = 'badge-warn'; }
  else if (margin < 55) { vKey = 'verdict_ok';        vCls = 'badge-good'; }
  else                  { vKey = 'verdict_great';     vCls = 'badge-good'; }

  // coaching tip
  let tip;
  if (profit <= 0) tip = t('tip_loss');
  else if (margin < 25) tip = t('tip_thin').replace('{r}', fmt(ratio,0));
  else if (ratio >= 35) tip = t('tip_fuel').replace('{r}', fmt(ratio,0));
  else tip = t('tip_healthy');

  const marginColor = profit <= 0 ? 'var(--red)' : (margin < 35 ? '#B45309' : '#047857');
  const beRow = liters > 0
    ? `<div class="insight-row"><span class="insight-label">${t('break_even')}</span><span class="insight-val">฿${fmt(beOil,1)}/L · ${t('be_now')} ฿${fmt(avgOil,1)}/L</span></div>`
    : '';
  const hourRow = (m.totalHours > 0)
    ? `<div class="insight-row"><span class="insight-label">${t('earn_per_hour')}</span><span class="insight-val" style="font-weight:700;color:#047857">฿${fmt(m.perHour,0)}/${t('hour_unit')}</span></div>`
    : '';

  el.innerHTML = `
    <div class="insight-row" style="align-items:center">
      <span class="insight-label" style="font-weight:700">${t('profit_margin')}</span>
      <span class="insight-val"><span style="color:${marginColor};font-weight:800">${fmt(margin,0)}%</span> <span class="badge ${vCls}" data-i18n="${vKey}">${t(vKey)}</span></span>
    </div>
    ${hourRow}
    <div class="insight-row">
      <span class="insight-label">${t('profit_per')} ${m.unit}</span>
      <span class="insight-val">฿${fmt(perDist,1)}/${m.unit}</span>
    </div>
    ${beRow}
    <div class="insight-row" style="border-top:1px solid var(--line,#eee);padding-top:10px">
      <span class="insight-label">💡 ${t('coach')}</span>
      <span class="insight-val" style="text-align:right;max-width:62%;font-weight:500">${tip}</span>
    </div>`;
}

// Personal Finance Coach: "Weekly earnings recap" — always shows the current
// calendar week (Sun–today, same boundary as filterByPeriod('week')) vs the
// previous calendar week, regardless of which period tab is selected.
function renderWeeklyRecap() {
  const el = document.getElementById('weekly-recap');
  if (!el) return;
  const thisWeek = filterByPeriod('week');
  const lastWeek = prevFilterByPeriod('week');
  const totalNet = thisWeek.reduce((a,s) => a + (s.netRev||0), 0);
  const prevNet = lastWeek.reduce((a,s) => a + (s.netRev||0), 0);
  const shiftCount = thisWeek.length;

  if (shiftCount === 0 && lastWeek.length === 0) {
    el.innerHTML = `<div style="padding:16px;color:var(--text3);font-size:13px;text-align:center">${t('no_data')}</div>`;
    return;
  }

  let deltaHtml;
  if (lastWeek.length === 0) {
    deltaHtml = `<span class="insight-val" style="font-weight:500;color:var(--text2)">${t('recap_no_prev')}</span>`;
  } else {
    const delta = totalNet - prevNet;
    const pct = prevNet !== 0 ? (delta / Math.abs(prevNet) * 100) : (totalNet !== 0 ? 100 : 0);
    const up = delta >= 0;
    const arrow = up ? '▲' : '▼';
    const col = up ? '#047857' : 'var(--red)';
    const sign = up ? '+' : '−';
    deltaHtml = `<span class="insight-val" style="color:${col};font-weight:700">${arrow} ${sign}฿${fmt(Math.abs(delta))} (${sign}${fmt(Math.abs(pct),0)}%)</span>`;
  }

  el.innerHTML = `
    <div class="insight-row" style="align-items:center">
      <span class="insight-label" style="font-weight:700">${t('recap_this_week')}</span>
      <span class="insight-val" style="font-weight:800">฿${fmt(totalNet)}</span>
    </div>
    <div class="insight-row">
      <span class="insight-label">${t('recap_shifts')}</span>
      <span class="insight-val">${shiftCount}</span>
    </div>
    <div class="insight-row">
      <span class="insight-label">${t('recap_vs_last_week')}</span>
      ${deltaHtml}
    </div>`;
}

function renderTrend(filtered) {
  const byDate = {};
  filtered.forEach(s => {
    byDate[s.date] = (byDate[s.date]||0) + (s.netRev||0);
  });
  const sortedDates = Object.keys(byDate).sort();
  const labels = sortedDates.map(d => {
    const parts = d.split('-');
    return `${parts[2]}/${parts[1]}`;
  });
  const data = sortedDates.map(d => parseFloat(byDate[d].toFixed(2)));

  if (trendChart) trendChart.destroy();
  const ctx = document.getElementById('trend-chart').getContext('2d');
  trendChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets:[{
        data,
        backgroundColor: data.map((v,i) => i === data.length-1 ? '#D0021B' : '#F5C6C6'),
        borderRadius: 4,
        borderSkipped: false,
      }]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>'฿'+fmt(c.parsed.y)}}},
      scales:{
        x:{grid:{display:false},ticks:{font:{size:10},color:'#8E8E93',maxTicksLimit:7}},
        y:{grid:{color:'#F2F2F7'},ticks:{font:{size:10},color:'#8E8E93',callback:v=>'฿'+fmt(v)}}
      }
    }
  });
}

function renderSvcBreakdown(filtered) {
  const byProv = {};
  filtered.forEach(s => {
    const p = normSvc(s).provider;
    byProv[p] = (byProv[p]||0) + s.rev + (s.tip||0);
  });
  const el = document.getElementById('svc-breakdown');
  if (Object.keys(byProv).length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = Object.entries(byProv).sort((a,b)=>b[1]-a[1]).map(([k,v]) =>
    `<div class="svc-pill"><span class="svc-name">${k}</span><span class="svc-amt">฿${fmt(v)}</span></div>`
  ).join('');
}

function renderTimeInsights(filtered) {
  const byDow = {};
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  filtered.forEach(s => {
    const dow = DAYS[new Date(s.date+'T12:00:00').getDay()];
    if (!byDow[dow]) byDow[dow] = {total:0,count:0};
    byDow[dow].total += s.netRev||0;
    byDow[dow].count++;
  });
  const el = document.getElementById('time-insights');
  if (Object.keys(byDow).length === 0) { el.innerHTML = `<div style="padding:16px;color:var(--text3);font-size:13px;text-align:center">${t('no_data')}</div>`; return; }
  const sorted = Object.entries(byDow).sort((a,b) => (b[1].total/b[1].count) - (a[1].total/a[1].count));
  const best = sorted[0][0];
  const dayLabel = (day) => {
    if (curLang() !== 'th') return day;
    const idx = DAYS.indexOf(day);
    return idx >= 0 ? TH_DAYS_SHORT[idx] : day;
  };
  el.innerHTML = sorted.map(([day, d]) =>
    `<div class="insight-row${day===best?' highlight':''}">
      <span class="insight-label">${dayLabel(day)}${day===best?' 🔥':''}</span>
      <span class="insight-val">฿${fmt(d.total/d.count)} / ${t('per_session')}</span>
    </div>`
  ).join('');
}

function renderDayInsights(filtered) {
  const el = document.getElementById('day-insights');
  if (filtered.length === 0) { el.innerHTML = `<div style="padding:16px;color:var(--text3);font-size:13px;text-align:center">${t('no_data')}</div>`; return; }
  const byDate = {};
  filtered.forEach(s => {
    if (!byDate[s.date]) byDate[s.date] = {net:0, hours:0};
    byDate[s.date].net += (s.netRev||0);
    byDate[s.date].hours += sessionHours(s);
  });
  const sorted = Object.entries(byDate).sort((a,b)=>b[1].net-a[1].net).slice(0,5);
  el.innerHTML = sorted.map(([date, o], i) => {
    const d = new Date(date+'T12:00:00');
    const label = curLang() === 'th' ? thaiDate(d, 'short') : d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
    const perHr = o.hours > 0 ? `<span style="color:var(--text3);font-weight:400;font-size:12px"> · ฿${fmt(o.net/o.hours,0)}/${t('hour_unit')}</span>` : '';
    return `<div class="insight-row${i===0?' highlight':''}">
      <span class="insight-label">${i===0?'🏆 ':''} ${label}</span>
      <span class="insight-val">฿${fmt(o.net)}${perHr}</span>
    </div>`;
  }).join('');
}

// ─── SESSIONS ─────────────────────────────────────────────────────────
function renderSessions() {
  const el = document.getElementById('sessions-list');
  const filterEl = document.getElementById('vehicle-filter');
  const vehicles = Array.from(new Set(sessions.map(s => (s.vehicle||'').trim()).filter(v => v))).sort();
  if (filterEl) {
    if (vehicles.length === 0) {
      filterEl.style.display = 'none';
      filterEl.value = '';
    } else {
      const prevVal = filterEl.value;
      filterEl.innerHTML = `<option value="" data-i18n="all_vehicles">${t('all_vehicles')}</option>` +
        vehicles.map(v => `<option value="${v.replace(/"/g,'&quot;')}">${v}</option>`).join('');
      filterEl.value = vehicles.includes(prevVal) ? prevVal : '';
      filterEl.style.display = '';
    }
  }
  const activeVehicle = filterEl ? filterEl.value : '';
  const list0 = activeVehicle ? sessions.filter(s => (s.vehicle||'') === activeVehicle) : sessions;
  if (list0.length === 0) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">🚗</div><p>${t('no_sessions')}<br>${t('tap_to_log')}</p></div>`;
    return;
  }
  const groups = {};
  list0.forEach(s => {
    const m = s.date.slice(0,7);
    if (!groups[m]) groups[m] = [];
    groups[m].push(s);
  });
  el.innerHTML = Object.entries(groups).sort((a,b)=>b[0].localeCompare(a[0])).map(([month, list]) => {
    const [y,m] = month.split('-');
    const monthDate = new Date(+y, +m-1, 1);
    const monthLabel = curLang() === 'th' ? thaiDate(monthDate, 'month-year') : monthDate.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
    const monthNet = list.reduce((a,s)=>a+(s.netRev||0),0);
    return `<div class="section-title" style="display:flex;justify-content:space-between">
      <span>${monthLabel}</span><span style="color:var(--red)">฿${fmt(monthNet)}</span>
    </div>
    <div class="list-card" style="margin-bottom:16px;">
      ${list.map(s => `
        <div class="list-row">
          <div class="list-icon" style="background:${TYPE_COLOR[normSvc(s).type]||'#F2F2F7'}">${TYPE_ICON[normSvc(s).type]||'🚗'}</div>
          <div class="list-main">
            <div class="list-title">${svcLabel(s)} · ${fmtDate(s.date)}</div>
            <div class="list-sub">${s.distance} km · ${s.consumption} km/L · ฿${fmt(s.exp)} ${t('fuel_word')}${syncBadge(s)}</div>
          </div>
          <div class="list-right">
            <div class="list-amt amt-pos">฿${fmt(s.netRev||0)}</div>
            <div class="list-amt-sub">${(() => { const g=s.rev+(s.tip||0); const mg=g>0?(s.netRev||0)/g*100:0; const c=(s.netRev||0)<=0?'var(--red)':(mg<35?'#B45309':'#047857'); return `<span style="color:${c};font-weight:700">${fmt(mg,0)}%</span> · ${t('rev_word')} ฿${fmt(s.rev)}`; })()}</div>
          </div>
          <button class="btn-edit" onclick="openEditSession(${s.id},event)">
            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-delete" onclick="deleteSession(${s.id},event)">
            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>`).join('')}
    </div>`;
  }).join('');
}

async function openEditSession(id, e) {
  e.stopPropagation();
  const s = sessions.find(x => x.id === id);
  if (!s) return;
  document.getElementById('s-edit-id').value = id;
  document.getElementById('modal-title').textContent = t('edit_session');
  document.getElementById('s-date').value = s.date;
  document.getElementById('s-start').value = s.startTime || '';
  document.getElementById('s-end').value = s.endTime || '';
  document.getElementById('s-enddate').value = s.endDate || s.date || '';
  document.getElementById('s-dist').value = s.distance;
  document.getElementById('s-cons').value = s.consumption;
  document.getElementById('s-oil').value = s.oilPrice;
  document.getElementById('s-exp').value = s.exp;
  document.getElementById('s-rev').value = s.rev;
  document.getElementById('s-tip').value = s.tip || 0;
  document.getElementById('s-vehicle').value = s.vehicle || '';
  document.getElementById('s-net').textContent = '฿ ' + fmt(s.netRev || 0);
  const nrm = normSvc(s);
  document.querySelectorAll('.svc-opt').forEach(o => o.classList.remove('sel'));
  (document.querySelector(`.prov-selector .svc-opt[data-prov="${nrm.provider}"]`) || document.querySelector('.prov-selector .svc-opt')).classList.add('sel');
  (document.querySelector(`.type-selector .svc-opt[data-type="${nrm.type}"]`) || document.querySelector('.type-selector .svc-opt')).classList.add('sel');
  calcDuration();
  openSessionModal();
}

async function deleteSession(id, e) {
  e.stopPropagation();
  if (!confirm(t('delete_session_confirm'))) return;
  const rec = sessions.find(s => s.id === id);
  if (!rec) return;
  if (!isGuest) await enqueue('delete', 'sessions', rec);
  await dbDel('sessions', id);
  await reload();
  toast(t('session_deleted'));
}

// ─── ADD SESSION ──────────────────────────────────────────────────────
function openAddSession() {
  document.getElementById('s-edit-id').value = '';
  document.getElementById('modal-title').textContent = t('log_session');
  document.getElementById('s-date').value = todayISO();
  document.getElementById('s-start').value = '';
  document.getElementById('s-end').value = '';
  document.getElementById('s-enddate').value = todayISO();
  document.getElementById('s-dur').textContent = '—';
  document.getElementById('s-dist').value = '';
  document.getElementById('s-cons').value = '';
  document.getElementById('s-oil').value = '';
  document.getElementById('s-exp').value = '';
  document.getElementById('s-rev').value = '';
  document.getElementById('s-tip').value = '';
  document.getElementById('s-vehicle').value = '';
  document.getElementById('s-net').textContent = '฿ 0';
  document.querySelectorAll('.svc-opt').forEach(o => o.classList.remove('sel'));
  document.querySelector('.prov-selector .svc-opt[data-prov="Grab"]').classList.add('sel');
  document.querySelector('.type-selector .svc-opt[data-type="Car"]').classList.add('sel');
  openSessionModal();
}

// element that had focus before the modal opened, so we can restore it on close
let _modalTrigger = null;

// visible, focusable elements inside the session modal (for initial focus + Tab trap)
function _modalFocusables() {
  const modal = document.querySelector('#modal-session .modal');
  if (!modal) return [];
  return Array.from(modal.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter(el => el.offsetParent !== null);
}

function openSessionModal() {
  _modalTrigger = document.activeElement;
  const overlay = document.getElementById('modal-session');
  overlay.classList.add('open');
  // move focus into the dialog so keyboard/SR users land inside it
  const first = overlay.querySelector('.modal-close-x') || _modalFocusables()[0];
  if (first) first.focus();
}

function closeSessionModal() {
  document.getElementById('modal-session').classList.remove('open');
  // return focus to whatever opened the modal (a11y: restore context)
  if (_modalTrigger && document.contains(_modalTrigger) && typeof _modalTrigger.focus === 'function') {
    _modalTrigger.focus();
  }
  _modalTrigger = null;
}

function selProv(el) {
  el.closest('.prov-selector').querySelectorAll('.svc-opt').forEach(o => o.classList.remove('sel'));
  el.classList.add('sel');
}
function selType(el) {
  el.closest('.type-selector').querySelectorAll('.svc-opt').forEach(o => o.classList.remove('sel'));
  el.classList.add('sel');
}

// ─── SESSION DURATION / HOURS ─────────────────────────────────────────
function parseHM(v) {
  if (!v || v.indexOf(':') < 0) return null;
  const [h, m] = v.split(':').map(Number);
  if (isNaN(h)) return null;
  return h * 60 + (m || 0);
}
function durationHours(start, end) {   // legacy same-day helper (kept for safety)
  const a = parseHM(start), b = parseHM(end);
  if (a == null || b == null) return 0;
  let d = b - a; if (d < 0) d += 1440;
  return d / 60;
}
// Cross-date aware: uses start date + end date so a night shift spanning midnight is exact.
function sessionHours(s) {
  if (!s.startTime || !s.endTime) return 0;
  const sd = s.date, ed = s.endDate || s.date;
  const start = new Date(`${sd}T${s.startTime}:00`);
  let end = new Date(`${ed}T${s.endTime}:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  if (end <= start) end = new Date(end.getTime() + 86400000);  // safety net if end date not advanced
  return (end - start) / 3600000;
}
function fmtHours(h) {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return curLang() === 'th' ? `${hh} ชม. ${mm} นาที` : `${hh}h ${mm}m`;
}
function calcDuration() {
  const sd = document.getElementById('s-date').value;
  const st = document.getElementById('s-start').value;
  const en = document.getElementById('s-end').value;
  const edEl = document.getElementById('s-enddate');
  const durEl = document.getElementById('s-dur');
  if (!(sd && st && en)) { if (durEl) durEl.textContent = '—'; return; }
  let ed = edEl.value || sd;
  if (en <= st && ed === sd) {              // shift crosses midnight -> next day
    const nd = new Date(sd + 'T00:00:00'); nd.setDate(nd.getDate() + 1);
    ed = isoOf(nd); edEl.value = ed;
  }
  if (!edEl.value) edEl.value = ed;
  const h = sessionHours({date: sd, startTime: st, endDate: ed, endTime: en});
  if (durEl) durEl.textContent = h > 0 ? fmtHours(h) : '—';
}

function calcSNet(autoExp = true) {
  const dist = parseFloat(document.getElementById('s-dist').value)||0;
  const cons = parseFloat(document.getElementById('s-cons').value)||0;
  const oil = parseFloat(document.getElementById('s-oil').value)||0;
  if (autoExp && dist && cons && oil) {
    const autoE = (dist/cons)*oil;
    document.getElementById('s-exp').value = autoE.toFixed(2);
  }
  const exp = parseFloat(document.getElementById('s-exp').value)||0;
  const rev = parseFloat(document.getElementById('s-rev').value)||0;
  const tip = parseFloat(document.getElementById('s-tip').value)||0;
  const net = rev + tip - exp;
  document.getElementById('s-net').textContent = '฿ ' + fmt(net);
}

async function saveSession() {
  const provEl = document.querySelector('.prov-selector .svc-opt.sel');
  const typeEl = document.querySelector('.type-selector .svc-opt.sel');
  const provider = provEl ? provEl.dataset.prov : 'Grab';
  const svc = typeEl ? typeEl.dataset.type : 'Car';
  const date = document.getElementById('s-date').value;
  const startTime = document.getElementById('s-start').value || '';
  const endTime = document.getElementById('s-end').value || '';
  const endDate = document.getElementById('s-enddate').value || date;
  const dist = parseFloat(document.getElementById('s-dist').value)||0;
  const cons = parseFloat(document.getElementById('s-cons').value)||0;
  const oil = parseFloat(document.getElementById('s-oil').value)||0;
  const exp = parseFloat(document.getElementById('s-exp').value)||0;
  const rev = parseFloat(document.getElementById('s-rev').value)||0;
  const tip = parseFloat(document.getElementById('s-tip').value)||0;
  const vehicle = (document.getElementById('s-vehicle').value || '').trim();
  if (!date) { toast(t('enter_date')); return; }
  if (!rev || rev <= 0) { toast(t('rev_gt_zero')); return; }
  if (dist < 0 || cons < 0 || oil < 0 || exp < 0 || tip < 0) { toast(t('neg_not_allowed')); return; }
  const uid = isGuest ? 'guest' : currentUser.id;
  const obj = {uid, provider, serviceType:svc, date, endDate, startTime, endTime, distance:dist, consumption:cons, oilPrice:oil, exp, rev, tip, vehicle, netRev: rev+tip-exp};
  const editId = document.getElementById('s-edit-id').value;
  if (editId) {
    const id = parseInt(editId);
    const prev = sessions.find(s => s.id === id);
    if (!prev) return;
    obj.id = id;
    obj.cuid = prev.cuid || cuid();
    obj.sid = prev.sid || null;
  } else {
    obj.cuid = cuid();
  }
  obj.updatedAt = nowISO();
  obj.deleted = false;
  obj.dirty = true;
  const key = await dbPut('sessions', obj);
  if (obj.id == null) obj.id = key;
  if (!isGuest) await enqueue('upsert', 'sessions', obj);
  closeSessionModal();
  await reload();
  toast(t('session_saved'));
}

// ─── FUEL ─────────────────────────────────────────────────────────────
function renderFuel() {
  const totalSpent = fuels.reduce((a,f)=>a+f.price,0);
  const totalLiters = fuels.reduce((a,f)=>a+f.liters,0);
  const avgPer = totalLiters > 0 ? totalSpent/totalLiters : 0;
  document.getElementById('fuel-summary').innerHTML = `
    <div class="sum-item"><div class="sum-label">${t('total_spent')}</div><div class="sum-val">฿${fmt(totalSpent)}</div></div>
    <div class="sum-item"><div class="sum-label">${t('total_liters')}</div><div class="sum-val">${fmt(totalLiters,1)} L</div></div>
    <div class="sum-item"><div class="sum-label">${t('avg_per_liter')}</div><div class="sum-val">${avgPer>0?'฿'+fmt(avgPer,2):'—'}</div></div>`;
  const el = document.getElementById('fuel-list');
  if (fuels.length === 0) {
    el.innerHTML = `<div class="empty" style="padding:24px 20px"><div class="empty-icon">⛽</div><p>${t('no_refills')}</p></div>`;
    return;
  }
  el.innerHTML = `<div class="list-card" style="margin-bottom:16px;">${fuels.map(f=>`
    <div class="list-row">
      <div class="list-icon" style="background:#FEF3C7">⛽</div>
      <div class="list-main">
        <div class="list-title">${f.station||t('unknown_station')}</div>
        <div class="list-sub">${fmtDate(f.date)} · ${fmt(f.liters,1)} L${syncBadge(f)}</div>
      </div>
      <div class="list-right">
        <div class="list-amt" style="color:var(--text)">฿${fmt(f.price)}</div>
        <div class="list-amt-sub">${f.liters>0?'฿'+fmt(f.price/f.liters,2)+'/L':'—'}</div>
      </div>
      <button class="btn-delete" onclick="deleteFuel(${f.id},event)">
        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </button>
    </div>`).join('')}</div>`;
}

async function saveFuel() {
  const station = document.getElementById('f-station').value.trim();
  const liters = parseFloat(document.getElementById('f-liters').value)||0;
  const price = parseFloat(document.getElementById('f-fprice').value)||0;
  const date = document.getElementById('f-fdate').value;
  if (!date || !price) { toast(t('enter_date_price')); return; }
  if (liters < 0 || price < 0) { toast(t('neg_not_allowed')); return; }
  if (!liters || liters <= 0) { toast(t('liters_gt_zero')); return; }
  const uid = isGuest ? 'guest' : currentUser.id;
  const obj = {uid, station, liters, price, date, cuid: cuid(), sid: null, updatedAt: nowISO(), deleted: false, dirty: true};
  const key = await dbPut('fuel', obj);
  obj.id = key;
  if (!isGuest) await enqueue('upsert', 'fuel', obj);
  document.getElementById('f-station').value = '';
  document.getElementById('f-liters').value = '';
  document.getElementById('f-fprice').value = '';
  document.getElementById('f-fdate').value = todayISO();
  await reload();
  toast(t('refill_saved'));
}

async function deleteFuel(id, e) {
  e.stopPropagation();
  if (!confirm(t('delete_refill_confirm'))) return;
  const rec = fuels.find(f => f.id === id);
  if (!rec) return;
  if (!isGuest) await enqueue('delete', 'fuel', rec);
  await dbDel('fuel', id);
  await reload();
  toast(t('deleted'));
}

// ─── EXPORT ──────────────────────────────────────────────────────────
// Safely encode one CSV cell: neutralize spreadsheet formula injection
// (leading = + - @ TAB CR) and escape embedded quotes by doubling, then wrap
// in quotes so commas/quotes/newlines in free-text fields can't break the row.
function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

function exportMonthlyCSV() {
  const by = {};
  sessions.forEach(s => {
    const m = (s.date || '').slice(0, 7); if (!m) return;
    if (!by[m]) by[m] = {sessions: 0, hours: 0, rev: 0, tip: 0, exp: 0, net: 0};
    by[m].sessions++; by[m].hours += sessionHours(s);
    by[m].rev += s.rev || 0; by[m].tip += s.tip || 0; by[m].exp += s.exp || 0; by[m].net += s.netRev || 0;
  });
  let csv = 'Month,Sessions,Hours,Revenue (฿),Tips (฿),Fuel (฿),Net (฿),Net per hour (฿)\n';
  Object.keys(by).sort().forEach(m => {
    const o = by[m], ph = o.hours > 0 ? o.net / o.hours : 0;
    csv += `${csvCell(m)},${o.sessions},${o.hours.toFixed(2)},${o.rev},${o.tip},${o.exp},${o.net},${ph.toFixed(1)}\n`;
  });
  // Prepend a UTF-8 BOM so Excel (esp. on Windows, incl. Thai locale) detects
  // UTF-8 and renders the ฿ header + any Thai text correctly instead of mojibake.
  const blob = new Blob(['﻿' + csv], {type: 'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `driver-monthly-${currentUser.username}-${todayISO()}.csv`;
  a.click();
  toast(t('exported'));
}

function exportCSV() {
  let csv = 'Date,End date,Start,End,Provider,Type,Distance (km),Consumption (km/L),Fuel Expense (฿),Revenue (฿),Tips (฿),Net Revenue (฿)\n';
  sessions.forEach(s => {
    const n = normSvc(s); csv += `${csvCell(s.date)},${csvCell(s.endDate||s.date)},${csvCell(s.startTime||'')},${csvCell(s.endTime||'')},${csvCell(n.provider)},${csvCell(n.type)},${s.distance},${s.consumption},${s.exp},${s.rev},${s.tip||0},${s.netRev||0}\n`;
  });
  // UTF-8 BOM (see exportMonthlyCSV) so the ฿ header + Thai provider/type names
  // survive being opened in Excel on a non-UTF-8 default locale.
  const blob = new Blob(['﻿' + csv], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `driver-logbook-${currentUser.username}-${todayISO()}.csv`;
  a.click();
  toast(t('exported'));
}

async function exportBackup() {
  // Full local backup: every session + fuel record from IndexedDB plus the
  // device settings, as one JSON file the driver can save off-device (email,
  // Drive, etc.). Mitigates "lose your phone, lose your whole logbook" without
  // the (externally-blocked) cloud-sync backend. Import/restore is a future slice.
  const [sess, fuel] = await Promise.all([dbAll('sessions'), dbAll('fuel')]);
  const backup = {
    app: 'DriverLog',
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    user: currentUser.username,
    settings: settings,
    sessions: sess,
    fuel: fuel,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `driver-backup-${currentUser.username}-${todayISO()}.json`;
  a.click();
  toast(t('exported'));
}

// Restore is the paired follow-up to exportBackup: read a .json backup back in and
// OVERWRITE this account's logbook with it. Closes the "lose your phone, lose your
// logbook" loop locally (no cloud backend). Scope: sessions + fuel only — device
// settings (theme/consent/currency) are intentionally NOT restored here to keep the
// slice small and avoid clobbering local prefs; settings-restore is a future slice.
function pickBackupFile() {
  const inp = document.getElementById('backup-file');
  if (inp) inp.click();
}

async function importBackup(inputEl) {
  const file = inputEl && inputEl.files && inputEl.files[0];
  inputEl.value = '';               // reset so re-picking the same file re-fires change
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (e) {
    toast(t('restore_bad_file'));
    return;
  }
  // Guard against arbitrary / other-app JSON: require the DriverLog marker + both arrays.
  if (!data || data.app !== 'DriverLog' || !Array.isArray(data.sessions) || !Array.isArray(data.fuel)) {
    toast(t('restore_bad_file'));
    return;
  }
  const n = data.sessions.length + data.fuel.length;
  if (!confirm(t('restore_confirm').replace('{n}', n))) return;
  const uid = isGuest ? 'guest' : currentUser.id;
  // Overwrite: clear THIS account's existing rows first (other accounts on the device
  // are left untouched), then re-add the backup's rows under the current account.
  const [curSess, curFuel] = await Promise.all([dbAll('sessions'), dbAll('fuel')]);
  for (const s of curSess) if (s.uid === uid) await dbDel('sessions', s.id);
  for (const f of curFuel) if (f.uid === uid) await dbDel('fuel', f.id);
  // Strip the old auto-increment id + any stale server id so a restore onto a fresh
  // device/account gets clean keys and can't collide; keep cuid for future sync dedupe.
  for (const s of data.sessions) { const {id, sid, ...rest} = s; await dbAdd('sessions', {...rest, uid}); }
  for (const f of data.fuel)     { const {id, sid, ...rest} = f; await dbAdd('fuel',     {...rest, uid}); }
  await reload();
  toast(t('restore_done').replace('{n}', n));
}

async function exportImage() {
  const card = document.getElementById('hero-card');
  const dashScreen = document.getElementById('s-dash');
  // BUGFIX: hero-card lives inside the Dashboard screen, which has
  // display:none when another tab (e.g. Settings) is active. html2canvas
  // then captures a zero-size element, producing a blank/broken image.
  // Temporarily force the dashboard screen to render off-screen so the
  // card has real layout, then restore whatever was showing before.
  const wasActive = dashScreen.classList.contains('active');
  if (!wasActive) {
    dashScreen.classList.add('active');
    dashScreen.style.position = 'fixed';
    dashScreen.style.top = '0';
    dashScreen.style.left = '-99999px';
    dashScreen.style.zIndex = '-1';
    dashScreen.style.pointerEvents = 'none';
  }
  try {
    const canvas = await html2canvas(card, {backgroundColor: '#D0021B', scale: 2});
    const filename = `driver-summary-${currentUser.username}-${todayISO()}.jpg`;
    // Use a real JPEG Blob + object URL so the file saves as .jpg (not .txt).
    const save = (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    };
    if (canvas.toBlob) {
      canvas.toBlob((blob) => {
        if (blob) { save(blob); toast(t('image_exported')); }
        else { toast(t('image_export_fail')); }
      }, 'image/jpeg', 0.95);
    } else {
      // Fallback: convert JPEG dataURL → Blob manually
      const dataURL = canvas.toDataURL('image/jpeg', 0.95);
      const bin = atob(dataURL.split(',')[1]);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      save(new Blob([arr], { type: 'image/jpeg' }));
      toast(t('image_exported'));
    }
  } catch(e) {
    toast(t('image_export_fail'));
  } finally {
    if (!wasActive) {
      dashScreen.classList.remove('active');
      dashScreen.style.position = '';
      dashScreen.style.top = '';
      dashScreen.style.left = '';
      dashScreen.style.zIndex = '';
      dashScreen.style.pointerEvents = '';
    }
  }
}

// ─── SETTINGS ─────────────────────────────────────────────────────────
async function saveSetting(key, val) {
  settings[key] = val;
  const prefix = isGuest ? 'guest:' : (currentUser.id + ':');
  await dbPut('settings', {key: prefix + key, value: val});
  if (key === 'lang') localStorage.setItem('ui_lang', val);
  renderDashboard();
}
function applyLang() {
  const lang = curLang();
  document.documentElement.lang = lang;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
  });

  // auth-hint contains an inline HTML string with <br> line breaks
  const hintEl = document.getElementById('auth-hint-text');
  if (hintEl) hintEl.innerHTML = t('auth_hint');

  // nav labels (also covered by data-i18n, kept for safety/back-compat)
  const navLabels = [t('nav_dashboard'), t('nav_sessions'), t('nav_fuel'), t('nav_settings')];
  document.querySelectorAll('.nav-btn span').forEach((el,i) => { if (navLabels[i]) el.textContent = navLabels[i]; });

  // auth submit button text depends on current auth mode
  const submitBtn = document.getElementById('auth-submit');
  if (submitBtn) submitBtn.textContent = authMode === 'register' ? t('create_account') : t('login');

  // dashboard greeting (app.html only)
  const displayName = (currentUser && !isGuest && currentUser.firstName) ? currentUser.firstName
    : (currentUser ? currentUser.username : 'Driver');
  const greetEl = document.getElementById('dash-greeting');
  if (greetEl) {
    const period = greetingPeriod();
    const template = t('greeting_' + period) || t('greeting');
    // Use a replacer FUNCTION so a name containing $&, $$, $` or $' is inserted
    // literally (a plain-string 2nd arg to replace() would treat those as patterns).
    greetEl.textContent = template.includes('{name}') ? template.replace('{name}', () => displayName) : `${template}, ${displayName}!`;
  }

  // dashboard empty-state title — personalize with first name when available
  const emptyTitleEl = document.querySelector('#dash-empty-state strong[data-i18n="onboard_welcome_title"]');
  if (emptyTitleEl) {
    const hasName = currentUser && !isGuest && currentUser.firstName && currentUser.firstName.trim();
    if (hasName) {
      const namedTemplate = t('onboard_welcome_title_named');
      // Same replacer-FUNCTION pattern as the greeting above, so a name containing
      // $&, $$, $` or $' is inserted literally rather than treated as a replace() pattern.
      emptyTitleEl.textContent = namedTemplate.replace('{name}', () => currentUser.firstName.trim());
    }
    // else: leave textContent as already set by the generic data-i18n pass above
  }

  // re-render dynamic screens so numbers/labels pick up the new language
  try { setToday(); } catch (e) {}
  try { if (currentUser) renderDashboard(); } catch (e) {}
  try { if (currentUser && document.getElementById('s-sessions')) renderSessions(); } catch (e) {}
  try { if (currentUser) renderFuel(); } catch (e) {}
  try { refreshConsentStatusLabel(); } catch (e) {}
}
function toggleShiftReminders() {
  const toggle = document.getElementById('reminder-toggle');
  const isOn = toggle.classList.toggle('on');
  toggle.setAttribute('aria-checked', isOn ? 'true' : 'false');
  localStorage.setItem('reminder_pref', isOn ? 'on' : 'off');
}
function restoreShiftRemindersToggle() {
  const pref = localStorage.getItem('reminder_pref') || 'off';
  const toggle = document.getElementById('reminder-toggle');
  if (toggle) {
    if (pref === 'on') toggle.classList.add('on');
    else toggle.classList.remove('on');
    toggle.setAttribute('aria-checked', pref === 'on' ? 'true' : 'false');
  }
}

// ─── NAV / SCREEN ─────────────────────────────────────────────────────
function switchScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => { b.classList.remove('active'); b.removeAttribute('aria-current'); });
  document.getElementById('s-'+name)?.classList.add('active');
  const navBtn = document.getElementById('nav-'+name);
  if (navBtn) { navBtn.classList.add('active'); navBtn.setAttribute('aria-current', 'page'); }
  const fabEl = document.getElementById('fab');
  if (fabEl) fabEl.style.display = (name === 'sessions' || name === 'dash') ? 'flex' : 'none';
  if (name === 'dash') renderDashboard();
}

// ─── UTILS ────────────────────────────────────────────────────────────
function syncBadge(rec) {
  if (isGuest || !Sync.enabled() || !Sync.authed()) return '';
  if (rec.dirty || !rec.sid)
    return ' <span title="Saved on this device — will sync when online" style="color:#B45309;font-weight:600">• saved</span>';
  return ' <span title="Synced to your account" style="color:#047857;font-weight:600">✓</span>';
}
function fmt(n, dec=0) {
  return Number(n).toLocaleString('en',{minimumFractionDigits:dec,maximumFractionDigits:dec});
}
function fmtDate(iso) {
  const d = new Date(iso+'T12:00:00');
  if (curLang() === 'th') return thaiDate(d, 'short');
  return d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
}
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

// close modal on overlay click (app.html only) — routes through closeSessionModal so focus restores
document.getElementById('modal-session')?.addEventListener('click', function(e) {
  if (e.target === this) closeSessionModal();
});

// keyboard handling for the session modal: Esc to close, Tab trap (app.html only)
document.getElementById('modal-session')?.addEventListener('keydown', function(e) {
  if (!this.classList.contains('open')) return;
  if (e.key === 'Escape') { e.preventDefault(); closeSessionModal(); return; }
  if (e.key === 'Tab') {
    const f = _modalFocusables();
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

// period buttons (app.html only — no-op NodeList on login.html)
document.querySelectorAll('.p-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.p-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPeriod = btn.dataset.period;
    document.getElementById('custom-range').style.display = currentPeriod === 'custom' ? 'flex' : 'none';
    renderDashboard();
  });
});
document.getElementById('range-start')?.addEventListener('change', renderDashboard);
document.getElementById('range-end')?.addEventListener('change', renderDashboard);

// submit auth with Enter key (login.html only)
['auth-user','auth-pass','auth-confirm'].forEach(id => {
  document.getElementById(id)?.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitAuth();
  });
});

// ─── PWA: service worker + install prompt ───────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW register failed', err));
    // when SW says a background sync finished, refresh badges/data
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data && e.data.type === 'sync-complete') { pullFromServer().then(reload); }
    });
  });
}
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstall = e;
  const row = document.getElementById('install-row');
  if (row) row.style.display = 'flex';
});
async function promptInstall() {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  await deferredInstall.userChoice;
  deferredInstall = null;
  const btn = document.getElementById('install-btn');
  if (btn) btn.style.display = 'none';
}
window.addEventListener('appinstalled', () => {
  const row = document.getElementById('install-row');
  if (row) row.style.display = 'none';
});

// ─── Connectivity: drain outbox + pull when signal returns (P3 fallback) ──
window.addEventListener('online', async () => {
  if (currentUser && !isGuest) { await pushOutbox(); await pullFromServer(); await reload(); }
  else updateSyncStatus('synced');
});
window.addEventListener('offline', () => updateSyncStatus('offline'));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && navigator.onLine && currentUser && !isGuest) {
    pushOutbox().then(pullFromServer).then(reload);
  }
});

// ─── THEME (dark mode) ────────────────────────────────────────────────────
function applyTheme() {
  const v = localStorage.getItem('ui_theme') || 'light';
  const dark = v === 'dark' || (v === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
function setTheme(v) { localStorage.setItem('ui_theme', v); applyTheme(); }

// ─── ADS (P5 monetization — free for drivers, funded by ads) ──────────────
let _adsPushed = false;
function pushAds() {
  if (_adsPushed) return;
  try { (window.adsbygoogle = window.adsbygoogle || []).push({}); _adsPushed = true; } catch (e) {}
}

// ─── START ─────────────────────────────────────────────────────────────
// Each page calls its own entry point (bootLogin() / bootApp()) via a small
// inline <script> after this file loads — see login.html / app.html.
