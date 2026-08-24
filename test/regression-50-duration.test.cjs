// REGRESSION #50 — same-day trips must not show ~24h-too-long durations.
// calcDuration() used to read back its OWN previous output (the hidden
// s-enddate field) and only ever advance it forward, so a transient value
// while scrolling a native time-wheel picker permanently bumped the end date
// a day (e.g. "25h 47m" for an actual 1h 47m shift). Now it recomputes fresh
// from the current start/end times on every call.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, makeElement } = require('./helpers/load-app.cjs');

const IDS = ['s-date', 's-start', 's-end', 's-enddate', 's-dur'];
const HOUR_MS = 3600000;

function setup(lang = 'en') {
  const els = {};
  for (const id of IDS) els[id] = makeElement(id);
  const app = loadApp({ elements: els, user: { id: 1, username: 't' } });
  app.setSettings({ lang, unit: 'km' });
  return { app, els };
}

function setTrip(els, { date, start, end }) {
  els['s-date'].value = date;
  els['s-start'].value = start;
  els['s-end'].value = end;
}

test('#50 sessionHours: normal same-day trip 11:50-13:37 is 1h47m, nowhere near 24h', () => {
  const app = loadApp();
  const h = app.sessionHours({ date: '2026-08-20', startTime: '11:50', endDate: '2026-08-20', endTime: '13:37' });
  assert.ok(Math.abs(h - 107 / 60) < 1e-9, `expected ${107 / 60}h, got ${h}`);
  assert.ok(h < 24, 'same-day trip must be under 24h');
});

test('#50 sessionHours: overnight shift 23:10-01:30 with endDate is 2h20m', () => {
  const app = loadApp();
  const h = app.sessionHours({ date: '2026-08-20', startTime: '23:10', endDate: '2026-08-21', endTime: '01:30' });
  assert.ok(Math.abs(h - 140 / 60) < 1e-9);
});

test('#50 sessionHours: safety ratchet adds a day when endDate omitted and end <= start', () => {
  const app = loadApp();
  const h = app.sessionHours({ date: '2026-08-20', startTime: '23:10', endTime: '01:30' }); // no endDate
  assert.ok(Math.abs(h - 140 / 60) < 1e-9, `overnight ratchet expected ${140 / 60}h, got ${h}`);
});

test('#50 sessionHours: missing or invalid times yield 0', () => {
  const app = loadApp();
  assert.equal(app.sessionHours({ date: '2026-08-20', startTime: '', endTime: '10:00' }), 0);
  assert.equal(app.sessionHours({ date: '2026-08-20', startTime: '10:00', endTime: '' }), 0);
  assert.equal(app.sessionHours({ date: 'garbage', startTime: '10:00', endTime: '11:00' }), 0);
});

test('#50 calcDuration: same-day trip keeps hidden end date == start date', () => {
  const { app, els } = setup();
  setTrip(els, { date: '2026-08-20', start: '11:50', end: '13:37' });
  app.calcDuration();
  assert.equal(els['s-enddate'].value, '2026-08-20');
  assert.equal(els['s-dur'].textContent, '1h 47m');
});

test('#50 calcDuration: overnight trip advances hidden end date exactly one day', () => {
  const { app, els } = setup();
  setTrip(els, { date: '2026-08-20', start: '23:10', end: '01:30' });
  app.calcDuration();
  assert.equal(els['s-enddate'].value, '2026-08-21');
  assert.equal(els['s-dur'].textContent, '2h 20m');
});

test('#50 calcDuration RESETS a stale ratcheted end date for a same-day trip (core #50 fix)', () => {
  const { app, els } = setup();
  // Simulate the pre-fix stuck state: hidden end date was left bumped to the
  // 21st by an earlier transient, and now the committed times are same-day.
  els['s-enddate'].value = '2026-08-21';
  setTrip(els, { date: '2026-08-20', start: '11:50', end: '13:37' });
  app.calcDuration();       // old code: never un-bumped -> "25h 47m"
  assert.equal(els['s-enddate'].value, '2026-08-20', 'end date must be recomputed fresh, not trusted');
  const shown = els['s-dur'].textContent;
  assert.equal(shown, '1h 47m');
  assert.ok(!shown.includes('25h'), 'must not regress to ~24h-too-long duration');
});

test('#50 calcDuration: transient mid-scroll inversion does not permanently bump the date', () => {
  const { app, els } = setup();
  // iOS fires oninput mid-drag: a transient inverted pair legitimately bumps
  // the end date — but committing a normal same-day time must undo it.
  setTrip(els, { date: '2026-08-20', start: '13:37', end: '11:50' }); // transient inversion
  app.calcDuration();
  assert.equal(els['s-enddate'].value, '2026-08-21');
  setTrip(els, { date: '2026-08-20', start: '11:50', end: '13:37' }); // committed values
  app.calcDuration();
  assert.equal(els['s-enddate'].value, '2026-08-20');
  assert.equal(els['s-dur'].textContent, '1h 47m');
});

test('#50 calcDuration: incomplete input shows an em dash placeholder', () => {
  const { app, els } = setup();
  els['s-date'].value = '2026-08-20';
  els['s-start'].value = '11:50';
  els['s-end'].value = '';      // no end time yet
  app.calcDuration();
  assert.equal(els['s-dur'].textContent, '—');
});

test('#50 fmtHours localizes EN/TH', () => {
  const en = setup('en');
  assert.equal(en.app.fmtHours(107 / 60), '1h 47m');
  const th = setup('th');
  assert.equal(th.app.fmtHours(107 / 60), '1 ชม. 47 นาที');
});
