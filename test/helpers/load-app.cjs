// Load the REAL browser-global site/app.js into Node without touching it.
//
// Technique (mirrors the QA "node round-trip harness" from the 2.6.6
// backup-import slice, docs/roadmap-next.md L79 and automation/dev-log.md):
// read the file, wrap it in `function (<browserGlobals>) { ... }`, and evaluate
// it with new Function() against a minimal stub of the browser globals app.js
// expects at top level. Zero npm dependencies — pairs with node:test.
//
// Two extras over a bare evaluation:
//   1. An appended epilogue exposes module-level state (db/currentUser/
//      isGuest/settings) through setters, because those are top-level
//      declarations *inside* app.js and cannot be injected as parameters.
//   2. document.getElementById() returns a cached inert fake element for any
//      id (with per-id overrides available), so unguarded DOM writes like
//      toast()'s `document.getElementById('toast').textContent = ...` work.
//
// Everything is inert: nothing here can reach the network or a real DB, so a
// test failure always means app.js's own logic changed, not the harness.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const APP_JS_PATH = path.join(__dirname, '..', '..', 'site', 'app.js');

// Inert fake DOM element: absorbs property writes, records class toggles,
// provides a no-op 2d context for anything that tries to draw a chart.
function makeElement(id) {
  const classes = new Set();
  return {
    id,
    value: '',
    textContent: '',
    innerHTML: '',
    style: {},
    dataset: {},
    files: [],
    classList: {
      add: (...cs) => cs.forEach((c) => classes.add(c)),
      remove: (...cs) => cs.forEach((c) => classes.delete(c)),
      toggle: (c, force) => {
        const on = force === undefined ? !classes.has(c) : !!force;
        if (on) classes.add(c); else classes.delete(c);
        return on;
      },
      contains: (c) => classes.has(c),
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    appendChild: () => {},
    remove: () => {},
    click: () => {},
    focus: () => {},
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    getContext: () => ({
      canvas: {},
      clearRect: () => {}, save: () => {}, restore: () => {},
      beginPath: () => {}, closePath: () => {}, arc: () => {},
      moveTo: () => {}, lineTo: () => {}, fill: () => {}, stroke: () => {},
      fillText: () => {}, measureText: () => ({ width: 0 }),
      scale: () => {}, translate: () => {}, setTransform: () => {},
      destroy: () => {},
    }),
  };
}

function makeDocument(elementOverrides = {}) {
  const cache = new Map();
  return {
    getElementById(id) {
      if (Object.prototype.hasOwnProperty.call(elementOverrides, id)) return elementOverrides[id];
      if (!cache.has(id)) cache.set(id, makeElement(id));
      return cache.get(id);
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: () => makeElement(),
    body: { appendChild: () => {} },
    documentElement: { dataset: {}, style: {} },
    visibilityState: 'hidden',
  };
}

function makeBrowserStub(elementOverrides) {
  const storage = new Map();
  const noop = () => {};

  // In-memory stand-in behind openDB(). Tests never rely on it (import tests
  // install their own fake db via the returned setDb), but keeping it here
  // means the boot path still resolves if app.js ever calls openDB() eagerly.
  const fakeDb = {
    transaction() {
      return {
        objectStore() {
          const reqLike = (result) => ({ onsuccess: null, onerror: null, result });
          return {
            getAll: () => reqLike([]),
            get: () => reqLike(undefined),
            put: () => reqLike(undefined),
            add: () => reqLike(undefined),
            delete: () => reqLike(undefined),
            index: () => ({ get: () => reqLike(undefined) }),
          };
        },
      };
    },
  };

  const indexedDB = {
    open() {
      const req = { onupgradeneeded: null, onerror: null };
      queueMicrotask(() => {
        if (req.onupgradeneeded) req.onupgradeneeded({ target: { result: fakeDb } });
        if (req.onsuccess) req.onsuccess({ target: { result: fakeDb } });
      });
      return req;
    },
  };

  const globals = {
    window: { addEventListener: noop, matchMedia: () => ({ matches: false }) },
    document: makeDocument(elementOverrides),
    navigator: {
      onLine: true,
      language: 'en',
      serviceWorker: { register: () => Promise.resolve({}), ready: Promise.resolve({ sync: null }) },
    },
    indexedDB,
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    location: { origin: 'http://localhost', href: 'http://localhost/' },
    crypto: globalThis.crypto, // cuid()/randomSalt() use randomUUID/getRandomValues
    fetch: () => Promise.reject(new Error('network disabled in tests')),
    alert: noop,
    confirm: () => false,
    prompt: () => null,
    Blob: class { constructor(parts) { this.parts = parts; } },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: noop },
    performance: globalThis.performance,
  };

  return { globals, fakeDb };
}

/**
 * Evaluate site/app.js and return its top-level bindings by name, plus setters
 * for its module-level state. Options:
 *   - elements:  { elementId: obj } — objects handed out by
 *                document.getElementById() verbatim (for driving form inputs).
 *   - globals:   extra/overriding sandbox globals (e.g. confirm: () => true).
 *   - user:      installed as currentUser before your test runs.
 *   - asGuest:   sets the module-level isGuest flag.
 */
function loadApp(options = {}) {
  const { elements = {}, globals = {}, user = null, asGuest = false } = options;
  const src = fs.readFileSync(APP_JS_PATH, 'utf8');
  const stub = makeBrowserStub(elements);
  const sandbox = { ...stub.globals, ...globals };
  const keys = Object.keys(sandbox);

  // The epilogue below is appended to app.js's own source inside the wrapper.
  // db/currentUser/isGuest/settings/toast/render* are app.js's OWN top-level
  // declarations; from in here we can hand out closures that mutate them.
  const epilogue = `
;return {
  APP_VERSION,
  num, sessionHours, fmtHours, calcDuration, calcSNet,
  toServer, fromServer, importBackup,
  t,
  getDb: () => db,
  setDb: (d) => { db = d; },
  setUser: (u) => { currentUser = u; },
  setGuest: (g) => { isGuest = g; },
  setSettings: (s) => { settings = s; },
  setToast: (fn) => { toast = fn; },
  muteRenders: () => {
    renderDashboard = () => {};
    renderSessions = () => {};
    renderFuel = () => {};
    renderMaintenanceLog = () => {};
  },
};`;

  const factory = new Function(...keys, `"use strict";\n${src}\n${epilogue}`);
  let app;
  try {
    app = factory(...keys.map((k) => sandbox[k]));
  } catch (err) {
    throw new Error(`Failed to evaluate site/app.js in test harness: ${err.message}`);
  }
  if (user) app.setUser(user);
  if (asGuest) app.setGuest(true);
  return app;
}

module.exports = { loadApp, makeElement, APP_JS_PATH };
