// Backup import/restore validation — the 2.6.6 slice's guarantees, kept
// honest by driving the REAL importBackup() with a recording fake IndexedDB.
// Maintenance parity landed on main after this slice, so backups WITHOUT a
// `maintenance` array must still be accepted (treated as optional here).
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, makeElement } = require('./helpers/load-app.cjs');

const USER = { id: 42, username: 'somchai' };

const EN = {
  bad: 'Not a valid DriverLog backup file',
  done: 'Restored {n} entries',
};

// Recording fake of the IndexedDB surface app.js's dbAll/dbAdd/dbDel use:
// db.transaction(store).objectStore(store).{getAll|add|delete}()
function makeFakeDb(seedSessions = [], seedFuel = []) {
  const stores = {
    sessions: seedSessions.map((r) => ({ ...r })),
    fuel: seedFuel.map((r) => ({ ...r })),
    maintenance: [],
    users: [], outbox: [], meta: [], settings: [],
  };
  let autoId = 5000;
  const added = [];   // {store, rec}
  const deleted = []; // {store, id}
  const dbStub = {
    transaction(store) {
      return {
        objectStore() {
          const reqLike = (result) => ({ onsuccess: null, onerror: null, result });
          // Real IndexedDB fires these asynchronously — mirror that, or
          // dbAll/dbAdd/dbDel promises never resolve.
          const fire = (req, result) => queueMicrotask(() => req.onsuccess && req.onsuccess({ target: { result } }));
          return {
            getAll: () => {
              const req = reqLike(stores[store].map((r) => ({ ...r })));
              fire(req, req.result);
              return req;
            },
            get: () => {
              const req = reqLike(undefined);
              fire(req, undefined);
              return req;
            },
            put: () => {
              const req = reqLike(undefined);
              fire(req, undefined);
              return req;
            },
            add: (obj) => {
              const rec = JSON.parse(JSON.stringify(obj)); // snapshot what's written
              added.push({ store, rec });
              const newId = ++autoId;
              const req = reqLike(newId);
              fire(req, newId);
              return req;
            },
            delete: (id) => {
              deleted.push({ store, id });
              const req = reqLike(undefined);
              fire(req, undefined);
              return req;
            },
          };
        },
      };
    },
    _stores: stores,
    _added: added,
    _deleted: deleted,
  };
  return dbStub;
}

function makeFile(jsonText) {
  return { text: async () => jsonText };
}

// Load one fresh app instance per test with toast/confirm/reload instrumented.
function setupApp(opts = {}) {
  const toasts = [];
  const confirmCalls = [];
  const els = {};
  for (const id of ['backup-file']) els[id] = makeElement(id);
  const app = loadApp({
    elements: els,
    user: USER,
    globals: {
      confirm: (msg) => { confirmCalls.push(String(msg)); return opts.confirmAnswer !== false; },
    },
  });
  app.setSettings({ lang: 'en', unit: 'km' });
  // toast/render* are function declarations; reassign them via the sandbox
  // epilogue so success/failure paths can be observed without any DOM.
  app.setToast((msg) => toasts.push(String(msg)));
  app.muteRenders();
  const fake = makeFakeDb(opts.seedSessions, opts.seedFuel);
  app.setDb(fake);
  return { app, els, toasts, confirmCalls, fake };
}

const VALID_BACKUP = JSON.stringify({
  app: 'DriverLog',
  version: '2.6.6',
  exportedAt: '2026-08-01T09:00:00Z',
  user: 'someone-else',
  settings: { lang: 'th', unit: 'km' },
  sessions: [
    { id: 1, sid: 900, cuid: 'c-a', uid: 'OTHER', updatedAt: '2026-07-01T00:00:00Z', provider: 'Grab', serviceType: 'Car', date: '2026-07-01', endDate: '', startTime: '09:00', endTime: '12:00', distance: 10, consumption: null, oilPrice: null, exp: 50, rev: 300, tip: 0, vehicle: '', netRev: 250, trips: [] },
    { id: 2, sid: null, cuid: 'c-b', uid: 'OTHER', updatedAt: '2026-07-02T00:00:00Z', provider: 'Bolt', serviceType: 'Bike', date: '2026-07-02', endDate: '', startTime: '18:00', endTime: '21:00', distance: 8, consumption: null, oilPrice: null, exp: 30, rev: 200, tip: 10, vehicle: '', netRev: 180, trips: [] },
  ],
  fuel: [
    { id: 3, sid: 901, cuid: 'c-f1', uid: 'OTHER', updatedAt: '2026-07-03T00:00:00Z', station: 'PTT', liters: 20, price: 800, date: '2026-07-03' },
  ],
});

test('import: valid DriverLog file restores rows under CURRENT account uid', async () => {
  const { app, toasts, confirmCalls, fake } = setupApp();
  await app.importBackup({ files: [makeFile(VALID_BACKUP)], value: '' });

  assert.equal(confirmCalls.length, 1, 'asks for confirmation exactly once');
  assert.ok(confirmCalls[0].includes('3'), 'confirm message shows row count');

  assert.equal(fake._added.filter((x) => x.store === 'sessions').length, 2, 'sessions restored');
  assert.equal(fake._added.filter((x) => x.store === 'fuel').length, 1, 'fuel restored');
  for (const a of fake._added) {
    assert.equal(a.rec.uid, USER.id, 'restored rows carry the CURRENT account uid');
  }
  assert.ok(
    toasts.some((m) => m.includes('3') && m.includes('Restored')),
    `success toast shows restored count, got: ${JSON.stringify(toasts)}`
  );
});

test('import: strips stale {id,sid} keys but keeps cuid for sync dedupe', async () => {
  const { app, fake } = setupApp();
  await app.importBackup({ files: [makeFile(VALID_BACKUP)], value: '' });

  const sessRecs = fake._added.filter((x) => x.store === 'sessions').map((x) => x.rec);
  for (const rec of sessRecs) {
    assert.ok(!('id' in rec), 'old auto-increment id must be stripped');
    assert.ok(!('sid' in rec), 'stale server id must be stripped');
    assert.ok(rec.cuid && typeof rec.cuid === 'string', 'cuid preserved');
  }
  const fuelRec = fake._added.find((x) => x.store === 'fuel').rec;
  assert.ok(!('id' in fuelRec));
  assert.ok(!('sid' in fuelRec));
  assert.equal(fuelRec.cuid, 'c-f1');
});

test('import: clears only CURRENT account rows; other account survives untouched', async () => {
  const seedSessions = [
    { id: 500, uid: 999, cuid: 'keep-me', date: '2026-01-01' },   // another account
    { id: 501, uid: USER.id, cuid: 'mine-old', date: '2026-02-01' }, // current account
  ];
  const seedFuel = [{ id: 502, uid: 999, cuid: 'fuel-other', date: '2026-01-02' }];
  const { app, fake } = setupApp({ seedSessions, seedFuel });
  await app.importBackup({ files: [makeFile(VALID_BACKUP)], value: '' });

  assert.deepEqual(
    fake._deleted.filter((d) => d.store === 'sessions').map((d) => d.id),
    [USER.id === 999 ? -1 : 501],
    'only the current account session is deleted'
  );
  assert.equal(fake._deleted.filter((d) => d.store === 'fuel').length, 0, 'other account fuel untouched');
});

test('import: malformed JSON rejected via restore_bad_file toast, no writes/deletes', async () => {
  const { app, toasts, fake } = setupApp();
  await app.importBackup({ files: [makeFile('{not json!!')], value: '' });

  assert.deepEqual(toasts, [EN.bad], 'exactly the bad-file toast, nothing else');
  assert.equal(fake._added.length, 0, 'nothing written');
  assert.equal(fake._deleted.length, 0, 'nothing deleted');
});

test('import: marker/array validation rejects other shapes before confirm or writes', async () => {
  const cases = [
    ['other app marker', JSON.stringify({ app: 'SomethingElse', sessions: [], fuel: [] })],
    ['missing app key', JSON.stringify({ sessions: [], fuel: [] })],
    ['DriverLog marker but missing arrays', JSON.stringify({ app: 'DriverLog', version: '1' })],
    ['DriverLog marker but sessions not array', JSON.stringify({ app: 'DriverLog', sessions: {}, fuel: [] })],
  ];
  for (const [label, body] of cases) {
    const { app, toasts, fake, confirmCalls } = setupApp();
    await app.importBackup({ files: [makeFile(body)], value: '' });
    assert.deepEqual(toasts, [EN.bad], `${label}: bad-file toast`);
    assert.equal(confirmCalls.length, 0, `${label}: never reaches confirm`);
    assert.equal(fake._added.length, 0, `${label}: no writes`);
    assert.equal(fake._deleted.length, 0, `${label}: no deletes`);
  }
});

test('import: backup without optional maintenance array is still accepted', async () => {
  const body = JSON.parse(VALID_BACKUP);
  assert.equal(body.maintenance, undefined, 'fixture predates the maintenance slice');
  const { app, toasts, fake } = setupApp();
  await app.importBackup({ files: [makeFile(JSON.stringify(body))], value: '' });
  assert.ok(toasts.some((m) => m.includes('Restored')), 'accepted despite no maintenance array');
  assert.equal(fake._added.filter((x) => x.store === 'maintenance').length, 0, 'no maintenance rows invented');
});

test('import: declining confirm leaves data untouched', async () => {
  const seedSessions = [{ id: 700, uid: USER.id, cuid: 'mine', date: '2026-05-05' }];
  const { app, fake, toasts } = setupApp({ seedSessions, confirmAnswer: false });
  await app.importBackup({ files: [makeFile(VALID_BACKUP)], value: '' });

  assert.equal(fake._deleted.length, 0, 'cancel = no deletions');
  assert.equal(fake._added.length, 0, 'cancel = no additions');
  assert.equal(toasts.length, 0, 'cancel = silent (no success toast)');
});

test('import: empty file picker is a silent no-op', async () => {
  const { app, toasts, fake } = setupApp();
  await app.importBackup({ files: [], value: '' });
  assert.equal(toasts.length, 0, 'no toast on empty picker');
  assert.equal(fake._added.length, 0);
  assert.equal(fake._deleted.length, 0);
  // NOTE: importBackup(undefined) / a null-ish input element would throw
  // ("Cannot set properties of undefined") because `inputEl.value = ''`
  // executes before the file guard — unreachable via app.html (always called
  // as importBackup(this)), documented as a minor finding in the PR body.
});
