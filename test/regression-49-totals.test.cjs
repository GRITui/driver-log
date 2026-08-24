// REGRESSION #49 — dashboard totals must ADD numbers, never concatenate
// numeric strings. Postgres `numeric` columns arrive from Neon as strings via
// JSON; before the fix, fromServer() passed them through uncoerced and `+` in
// the dashboard reduces silently string-concatenated (฿800,586,010,640 …).
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, makeElement } = require('./helpers/load-app.cjs');

const USER = { id: 7, username: 'driver7' };

// A server row shaped like what api/records-*.js returns when Postgres
// `numeric` columns serialize as strings.
function srvSession(over = {}) {
  return {
    id: 11, cuid: 'c-srv-1', updatedAt: '2026-08-20T10:00:00Z',
    provider: 'Grab', serviceType: 'Car', date: '2026-08-20',
    endDate: '', startTime: '09:00', endTime: '17:00', vehicle: '', trips: [],
    distance: '123.4', consumption: '9.5', oilPrice: '34.12',
    exp: '150.75', rev: '900', tip: '20.25', netRev: '769.5',
    ...over,
  };
}

test('#49 num() coerces numeric strings to numbers and keeps null distinct', () => {
  const app = loadApp();
  assert.equal(app.num('800.5'), 800.5);
  assert.equal(typeof app.num('800.5'), 'number');
  assert.equal(app.num('0'), 0);
  assert.equal(app.num(null), null);      // null stays null, distinct from 0
  assert.equal(app.num(undefined), undefined);
});

test('#49 fromServer(sessions) coerces every numeric column to a real number', () => {
  const app = loadApp({ user: USER });
  const rec = app.fromServer('sessions', srvSession());
  for (const k of ['distance', 'consumption', 'oilPrice', 'exp', 'rev', 'tip', 'netRev']) {
    assert.equal(typeof rec[k], 'number', `${k} should be a number, got ${typeof rec[k]}`);
  }
  assert.equal(rec.distance, 123.4);
  assert.equal(rec.netRev, 769.5);
});

test('#49 fromServer(fuel) coerces liters/price', () => {
  const app = loadApp({ user: USER });
  const rec = app.fromServer('fuel', { id: 12, cuid: 'c-f', updatedAt: '2026-08-20T10:00:00Z', station: 'PTT', liters: '20.55', price: '805.25', date: '2026-08-19' });
  assert.equal(rec.liters, 20.55);
  assert.equal(rec.price, 805.25);
  assert.equal(typeof rec.liters, 'number');
  assert.equal(typeof rec.price, 'number');
});

test('#49 fromServer(maintenance) coerces cost/odometerKm/nextDueKm', () => {
  const app = loadApp({ user: USER });
  const rec = app.fromServer('maintenance', { id: 13, cuid: 'c-m', updatedAt: '2026-08-20T10:00:00Z', vehicle: 'v1', serviceType: 'oil', cost: '1250', date: '2026-08-01', odometerKm: '45231', nextDueDate: '2026-11-01', nextDueKm: '55231' });
  assert.equal(rec.cost, 1250);
  assert.equal(rec.odometerKm, 45231);
  assert.equal(rec.nextDueKm, 55231);
  assert.equal(typeof rec.cost, 'number');
});

test('#49 fromServer keeps explicit null numeric distinct from 0', () => {
  const app = loadApp({ user: USER });
  const rec = app.fromServer('sessions', srvSession({ tip: null }));
  assert.equal(rec.tip, null);
  assert.notEqual(rec.tip, 0);
});

test('#49 totals over synced rows ADD instead of concatenating (the #49 scenario)', () => {
  const app = loadApp({ user: USER });
  // Uncoerced, '800' + '10.726' + '0.5' would be the string "80010.7260.5".
  const serverRows = [
    srvSession({ cuid: 'a', netRev: '800', rev: '800', tip: '0', exp: '0', distance: '1' }),
    srvSession({ cuid: 'b', netRev: '10.726', rev: '10.726', tip: '0', exp: '0', distance: '2' }),
    srvSession({ cuid: 'c', netRev: '0.5', rev: '0.5', tip: '0', exp: '0', distance: '3' }),
  ];
  const locals = serverRows.map((sr) => app.fromServer('sessions', sr));
  // Same reduce shape renderDashboard() uses for its totals.
  const totalNet = locals.reduce((a, s) => a + (Number(s.netRev) || 0), 0);
  assert.ok(Math.abs(totalNet - 811.226) < 1e-9, `expected 811.226, got ${totalNet}`);
  assert.equal(typeof totalNet, 'number');
  const totalDist = locals.reduce((a, s) => a + (Number(s.distance) || 0), 0);
  assert.equal(totalDist, 6);
});

test('#49 form-side net arithmetic stays numeric (no NaN, no concat artifacts)', () => {
  const els = {};
  for (const id of ['s-dist', 's-cons', 's-oil', 's-exp', 's-rev', 's-tip', 's-net']) els[id] = makeElement(id);
  const app = loadApp({ elements: els, user: USER });
  app.setSettings({ lang: 'en', unit: 'km' });
  // Form inputs are strings, exactly like raw DOM values — arithmetic must
  // stay numeric. fmt() displays whole baht, so pick integer-clean numbers.
  els['s-rev'].value = '1000';
  els['s-tip'].value = '50';
  els['s-exp'].value = '361';
  app.calcSNet(false);           // autoExp=false: use the given expense
  const shown = els['s-net'].textContent;
  assert.equal(shown, '฿ 689');
  // Decimal inputs must not poison the render with NaN either.
  els['s-rev'].value = '900';
  els['s-tip'].value = '20.25';
  els['s-exp'].value = '150.75';
  app.calcSNet(false);
  const shown2 = els['s-net'].textContent;
  assert.ok(!shown2.includes('NaN'), `net must not be NaN, got "${shown2}"`);
  assert.ok(/^฿ 7(69|70)$/.test(shown2.trim()), `expected ~769.5 rendered (fmt rounds to whole baht), got "${shown2}"`);
});
