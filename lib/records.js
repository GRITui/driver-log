/* DriverLog — lib/records.js
 *
 * CRUD for the two syncable collections (sessions, fuel), shared by
 * api/records-*.js. Deliberately two hard-coded branches rather than
 * building table/column names dynamically from the `collection` request
 * param — @neondatabase/serverless's tagged-template `sql` only escapes
 * *values*, not identifiers, so interpolating a client-supplied string into
 * a table name would be a SQL injection hole.
 *
 * Every row returned to the client is shaped to match what site/app.js's
 * fromServer()/applyServerRecord() already expect from a PocketBase record
 * (id, cuid, updatedAt, deleted, + the collection's own fields) — this
 * layer's whole job is to make the Neon-backed API indistinguishable from
 * the old PocketBase one at the client boundary.
 */
import { db } from './db.js';

const COLLECTIONS = ['sessions', 'fuel', 'maintenance'];
export function isValidCollection(c) { return COLLECTIONS.includes(c); }

function rowToSession(r) {
  return {
    id: r.id, cuid: r.cuid, updatedAt: r.updated_at, deleted: r.deleted,
    provider: r.provider || '', serviceType: r.service_type, date: r.date,
    endDate: r.end_date || '', startTime: r.start_time || '', endTime: r.end_time || '',
    distance: r.distance, consumption: r.consumption, oilPrice: r.oil_price,
    exp: r.exp, rev: r.rev, tip: r.tip, vehicle: r.vehicle || '', netRev: r.net_rev,
    trips: r.trips || [],
  };
}
function rowToFuel(r) {
  return { id: r.id, cuid: r.cuid, updatedAt: r.updated_at, deleted: r.deleted,
    station: r.station, liters: r.liters, price: r.price, date: r.date };
}
function rowToMaintenance(r) {
  return { id: r.id, cuid: r.cuid, updatedAt: r.updated_at, deleted: r.deleted,
    vehicle: r.vehicle || '', serviceType: r.service_type || '', cost: r.cost, date: r.date,
    odometerKm: r.odometer_km, nextDueDate: r.next_due_date, nextDueKm: r.next_due_km };
}

export async function listRecords(uid, collection, sinceISO) {
  const sql = db();
  if (collection === 'sessions') {
    const rows = sinceISO
      ? await sql`select * from driver_sessions where user_id = ${uid} and updated_at > ${sinceISO} order by updated_at`
      : await sql`select * from driver_sessions where user_id = ${uid} order by updated_at`;
    return rows.map(rowToSession);
  }
  if (collection === 'maintenance') {
    const rows = sinceISO
      ? await sql`select * from vehicle_maintenance where user_id = ${uid} and updated_at > ${sinceISO} order by updated_at`
      : await sql`select * from vehicle_maintenance where user_id = ${uid} order by updated_at`;
    return rows.map(rowToMaintenance);
  }
  const rows = sinceISO
    ? await sql`select * from fuel_logs where user_id = ${uid} and updated_at > ${sinceISO} order by updated_at`
    : await sql`select * from fuel_logs where user_id = ${uid} order by updated_at`;
  return rows.map(rowToFuel);
}

export async function findByCuid(uid, collection, cuidVal) {
  const sql = db();
  if (collection === 'sessions') {
    const rows = await sql`select * from driver_sessions where user_id = ${uid} and cuid = ${cuidVal} limit 1`;
    return rows.length ? rowToSession(rows[0]) : null;
  }
  if (collection === 'maintenance') {
    const rows = await sql`select * from vehicle_maintenance where user_id = ${uid} and cuid = ${cuidVal} limit 1`;
    return rows.length ? rowToMaintenance(rows[0]) : null;
  }
  const rows = await sql`select * from fuel_logs where user_id = ${uid} and cuid = ${cuidVal} limit 1`;
  return rows.length ? rowToFuel(rows[0]) : null;
}

// sid present -> UPDATE; if that affects zero rows (stale/foreign id), fall
// back to INSERT — same 404-then-create semantics the old PocketBase-backed
// Sync.save() relied on. sid absent -> INSERT.
export async function saveRecord(uid, collection, sid, data) {
  const sql = db();
  const cuid = data.cuid;
  if (collection === 'sessions') {
    const vals = {
      cuid, provider: data.provider || '', service_type: data.serviceType, date: data.date,
      end_date: data.endDate || '', start_time: data.startTime || '', end_time: data.endTime || '',
      distance: data.distance, consumption: data.consumption, oil_price: data.oilPrice,
      exp: data.exp, rev: data.rev, tip: data.tip, vehicle: data.vehicle || '', net_rev: data.netRev,
      trips: JSON.stringify(data.trips || []),
      deleted: !!data.deleted,
    };
    if (sid) {
      const updated = await sql`
        update driver_sessions set
          cuid = ${vals.cuid}, provider = ${vals.provider}, service_type = ${vals.service_type},
          date = ${vals.date}, end_date = ${vals.end_date}, start_time = ${vals.start_time}, end_time = ${vals.end_time},
          distance = ${vals.distance}, consumption = ${vals.consumption}, oil_price = ${vals.oil_price},
          exp = ${vals.exp}, rev = ${vals.rev}, tip = ${vals.tip}, vehicle = ${vals.vehicle}, net_rev = ${vals.net_rev},
          trips = ${vals.trips}::jsonb,
          deleted = ${vals.deleted}, updated_at = now()
        where id = ${sid} and user_id = ${uid}
        returning *
      `;
      if (updated.length) return rowToSession(updated[0]);
    }
    const inserted = await sql`
      insert into driver_sessions (user_id, cuid, provider, service_type, date, end_date, start_time, end_time,
        distance, consumption, oil_price, exp, rev, tip, vehicle, net_rev, trips, deleted)
      values (${uid}, ${vals.cuid}, ${vals.provider}, ${vals.service_type}, ${vals.date}, ${vals.end_date},
        ${vals.start_time}, ${vals.end_time}, ${vals.distance}, ${vals.consumption}, ${vals.oil_price},
        ${vals.exp}, ${vals.rev}, ${vals.tip}, ${vals.vehicle}, ${vals.net_rev}, ${vals.trips}::jsonb, ${vals.deleted})
      on conflict (user_id, cuid) do update set
        provider = excluded.provider, service_type = excluded.service_type, date = excluded.date,
        end_date = excluded.end_date, start_time = excluded.start_time, end_time = excluded.end_time,
        distance = excluded.distance, consumption = excluded.consumption, oil_price = excluded.oil_price,
        exp = excluded.exp, rev = excluded.rev, tip = excluded.tip, vehicle = excluded.vehicle,
        net_rev = excluded.net_rev, trips = excluded.trips, deleted = excluded.deleted, updated_at = now()
      returning *
    `;
    return rowToSession(inserted[0]);
  }

  if (collection === 'maintenance') {
    const vals = {
      cuid, vehicle: data.vehicle || '', service_type: data.serviceType || '', cost: data.cost, date: data.date,
      odometer_km: data.odometerKm, next_due_date: data.nextDueDate, next_due_km: data.nextDueKm,
      deleted: !!data.deleted,
    };
    if (sid) {
      const updated = await sql`
        update vehicle_maintenance set cuid = ${vals.cuid}, vehicle = ${vals.vehicle}, service_type = ${vals.service_type},
          cost = ${vals.cost}, date = ${vals.date}, odometer_km = ${vals.odometer_km},
          next_due_date = ${vals.next_due_date}, next_due_km = ${vals.next_due_km},
          deleted = ${vals.deleted}, updated_at = now()
        where id = ${sid} and user_id = ${uid}
        returning *
      `;
      if (updated.length) return rowToMaintenance(updated[0]);
    }
    const inserted = await sql`
      insert into vehicle_maintenance (user_id, cuid, vehicle, service_type, cost, date, odometer_km, next_due_date, next_due_km, deleted)
      values (${uid}, ${vals.cuid}, ${vals.vehicle}, ${vals.service_type}, ${vals.cost}, ${vals.date},
        ${vals.odometer_km}, ${vals.next_due_date}, ${vals.next_due_km}, ${vals.deleted})
      on conflict (user_id, cuid) do update set
        vehicle = excluded.vehicle, service_type = excluded.service_type, cost = excluded.cost,
        date = excluded.date, odometer_km = excluded.odometer_km, next_due_date = excluded.next_due_date,
        next_due_km = excluded.next_due_km, deleted = excluded.deleted, updated_at = now()
      returning *
    `;
    return rowToMaintenance(inserted[0]);
  }

  const vals = { cuid, station: data.station, liters: data.liters, price: data.price, date: data.date, deleted: !!data.deleted };
  if (sid) {
    const updated = await sql`
      update fuel_logs set cuid = ${vals.cuid}, station = ${vals.station}, liters = ${vals.liters},
        price = ${vals.price}, date = ${vals.date}, deleted = ${vals.deleted}, updated_at = now()
      where id = ${sid} and user_id = ${uid}
      returning *
    `;
    if (updated.length) return rowToFuel(updated[0]);
  }
  const inserted = await sql`
    insert into fuel_logs (user_id, cuid, station, liters, price, date, deleted)
    values (${uid}, ${vals.cuid}, ${vals.station}, ${vals.liters}, ${vals.price}, ${vals.date}, ${vals.deleted})
    on conflict (user_id, cuid) do update set
      station = excluded.station, liters = excluded.liters, price = excluded.price,
      date = excluded.date, deleted = excluded.deleted, updated_at = now()
    returning *
  `;
  return rowToFuel(inserted[0]);
}

// No-op success if the row is already gone — matches the old Sync.remove()'s
// "404 is fine" semantics (the outbox item is done either way).
export async function removeRecord(uid, collection, sid) {
  const sql = db();
  if (collection === 'sessions') await sql`delete from driver_sessions where id = ${sid} and user_id = ${uid}`;
  else if (collection === 'maintenance') await sql`delete from vehicle_maintenance where id = ${sid} and user_id = ${uid}`;
  else await sql`delete from fuel_logs where id = ${sid} and user_id = ${uid}`;
}
