// toServer/fromServer record-mapping round-trips (sessions + fuel).
// Local record -> server payload -> back to local must preserve the
// driver-meaningful fields and keep numeric columns real numbers (#49 family).
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app.cjs');

const USER = { id: 9, username: 'driver9' };

test('round-trip: local session -> toServer -> fromServer preserves fields and types', () => {
  const app = loadApp({ user: USER });
  const local = {
    id: 77, uid: USER.id, sid: 555, cuid: 'c-rt-1',
    updatedAt: '2026-08-19T12:34:56Z', dirty: false, deleted: false,
    provider: 'Grab', serviceType: 'Car', date: '2026-08-18',
    endDate: '', startTime: '09:15', endTime: '15:45', vehicle: 'v1',
    distance: 123.4, consumption: 8.9, oilPrice: 33.5,
    exp: 150.75, rev: 900, tip: 20.25, netRev: 769.5,
    trips: [{ fare: 120, ts: '2026-08-18T10:00:00Z' }],
  };
  const srv = app.toServer('sessions', local);
  // server payload shape
  assert.equal(srv.cuid, 'c-rt-1');
  assert.equal(srv.updatedAt, '2026-08-19T12:34:56Z');
  assert.equal(srv.deleted, false);
  assert.equal(srv.user, USER.id, 'server payload stamped with current user');
  assert.equal(srv.distance, 123.4);
  assert.deepEqual(srv.trips, local.trips);

  // simulate what Postgres/JSON does to numerics on the way back
  const serverJson = JSON.parse(JSON.stringify({
    ...srv, id: 555,
    distance: String(srv.distance), consumption: String(srv.consumption),
    oilPrice: String(srv.oilPrice), exp: String(srv.exp),
    rev: String(srv.rev), tip: String(srv.tip), netRev: String(srv.netRev),
  }));

  const back = app.fromServer('sessions', serverJson, local);
  assert.equal(back.uid, USER.id);
  assert.equal(back.cuid, 'c-rt-1');
  assert.equal(back.sid, 555);
  assert.equal(back.dirty, false);
  assert.equal(back.id, local.id, 'local idb key preserved when merging into an existing row');
  for (const k of ['distance', 'consumption', 'oilPrice', 'exp', 'rev', 'tip', 'netRev']) {
    assert.equal(typeof back[k], 'number', `${k} round-trips as number`);
    assert.equal(back[k], local[k]);
  }
  assert.equal(back.provider, 'Grab');
  assert.equal(back.startTime, '09:15');
  assert.deepEqual(back.trips, local.trips);
});

test('round-trip: fuel record maps both directions', () => {
  const app = loadApp({ user: USER });
  const local = {
    id: 88, uid: USER.id, sid: 600, cuid: 'c-rt-f',
    updatedAt: '2026-08-18T08:00:00Z', dirty: true, deleted: false,
    station: 'Bangchak', liters: 25.5, price: 1000, date: '2026-08-17',
  };
  const srv = app.toServer('fuel', local);
  assert.equal(srv.station, 'Bangchak');
  assert.equal(srv.liters, 25.5);
  assert.equal(srv.user, USER.id);

  const serverJson = JSON.parse(JSON.stringify({
    ...srv, id: 600, liters: String(srv.liters), price: String(srv.price),
  }));
  const back = app.fromServer('fuel', serverJson, local);
  assert.equal(back.station, 'Bangchak');
  assert.equal(back.liters, 25.5);
  assert.equal(back.price, 1000);
  assert.equal(typeof back.liters, 'number');
  assert.equal(typeof back.price, 'number');
  assert.equal(back.sid, 600);
  assert.equal(back.updatedAt, '2026-08-18T08:00:00Z');
});

test('round-trip: defaults applied on both sides (empty vehicle/endDate, missing trips)', () => {
  const app = loadApp({ user: USER });
  const sparse = {
    cuid: 'c-sparse', updatedAt: '2026-08-19T00:00:00Z',
    provider: '', serviceType: 'Food', date: '2026-08-19',
    distance: null, consumption: null, oilPrice: null,
    exp: 40, rev: 260, tip: null, netRev: 220,
  };
  const srv = app.toServer('sessions', sparse);
  assert.equal(srv.vehicle, '');
  assert.equal(srv.endDate, '');
  assert.equal(srv.startTime, '');
  assert.equal(srv.endTime, '');
  assert.deepEqual(srv.trips, []);

  const back = app.fromServer('sessions', { ...srv, id: 700 }, null);
  assert.equal(back.vehicle, '');
  assert.equal(back.endDate, '');
  assert.deepEqual(back.trips, []);
  assert.equal(back.tip, null, 'null stays null through the round-trip (distinct from 0)');
  assert.equal(typeof back.rev, 'number');
  assert.equal(back.id, undefined, 'no local row -> no idb key adopted');
});

test('toServer: soft-delete flag survives as boolean', () => {
  const app = loadApp({ user: USER });
  const srv = app.toServer('fuel', { cuid: 'c-del', updatedAt: 'x', deleted: 1, station: 's', liters: 1, price: 2, date: '2026-01-01' });
  assert.equal(srv.deleted, true);
  assert.equal(typeof srv.deleted, 'boolean');
});
