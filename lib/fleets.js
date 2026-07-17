/* DriverLog — lib/fleets.js
 *
 * Fleet (B2B) tier: an owner account invites drivers by email; a driver
 * must explicitly accept before the owner can see any of their data.
 * A fleet owner NEVER writes to a driver's driver_sessions/fuel_logs — the
 * dashboard query below is read-only and scoped to that driver's own rows,
 * same tables the driver's own app already reads/writes.
 *
 * Shared by api/fleet-*.js, mirroring how lib/records.js is shared by
 * api/records-*.js.
 */
import { db } from './db.js';

function rowToFleet(r) {
  return {
    id: r.id, name: r.name, ownerUserId: r.owner_user_id, createdAt: r.created_at,
    plan: r.plan || 'free', seatLimit: r.seat_limit != null ? r.seat_limit : 3,
  };
}

export async function createFleet(ownerUid, name) {
  const sql = db();
  const rows = await sql`
    insert into fleets (owner_user_id, name) values (${ownerUid}, ${name}) returning *
  `;
  return rowToFleet(rows[0]);
}

// Fleets this uid owns, each with its member list (all statuses — the
// owner's UI needs pending invites too, not just active drivers).
export async function getOwnedFleets(uid) {
  const sql = db();
  const fleets = await sql`select * from fleets where owner_user_id = ${uid} order by created_at`;
  if (!fleets.length) return [];
  const members = await sql`
    select fm.fleet_id, u.id as driver_id, u.first_name, u.email, fm.status, fm.invited_at, fm.joined_at
    from fleet_members fm join users u on u.id = fm.driver_user_id
    where fm.fleet_id = any(${fleets.map(f => f.id)})
    order by fm.invited_at
  `;
  return fleets.map(f => ({
    ...rowToFleet(f),
    members: members.filter(m => m.fleet_id === f.id).map(m => ({
      driverId: m.driver_id, firstName: m.first_name || '', email: m.email || '',
      status: m.status, invitedAt: m.invited_at, joinedAt: m.joined_at,
    })),
  }));
}

// Fleets this uid has been invited to / belongs to, as a driver.
export async function getMemberships(uid) {
  const sql = db();
  const rows = await sql`
    select f.id as fleet_id, f.name as fleet_name, owner.first_name as owner_first_name,
      fm.status, fm.invited_at, fm.joined_at
    from fleet_members fm
    join fleets f on f.id = fm.fleet_id
    join users owner on owner.id = f.owner_user_id
    where fm.driver_user_id = ${uid}
    order by fm.invited_at desc
  `;
  return rows.map(r => ({
    fleetId: r.fleet_id, fleetName: r.fleet_name || '', ownerFirstName: r.owner_first_name || '',
    status: r.status, invitedAt: r.invited_at, joinedAt: r.joined_at,
  }));
}

export class FleetError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

// Owner invites a driver by email. Throws FleetError (safe to surface to
// the client as-is) for every expected failure — not-owner, no such
// account, already invited/active, or re-inviting a driver who left/declined
// (they get a fresh row instead, since the unique constraint is per fleet+driver).
export async function inviteMember(ownerUid, fleetId, email) {
  const sql = db();
  const fleetRows = await sql`select id, plan, seat_limit from fleets where id = ${fleetId} and owner_user_id = ${ownerUid}`;
  if (!fleetRows.length) throw new FleetError('Fleet not found.', 404);

  const count = await sql`select count(*) as n from fleet_members where fleet_id = ${fleetId} and status = 'active'`;
  if (fleetRows[0].plan === 'free' && Number(count[0].n) >= fleetRows[0].seat_limit) {
    throw new FleetError('Free plan is limited to ' + fleetRows[0].seat_limit + ' active drivers. Contact grit4game@gmail.com to upgrade.', 402);
  }

  const userRows = await sql`select id from users where email = ${email}`;
  if (!userRows.length) throw new FleetError('No DriverLog account found with that email.', 404);
  const driverUid = userRows[0].id;
  if (driverUid === ownerUid) throw new FleetError("You can't invite yourself.", 400);

  const existing = await sql`select status from fleet_members where fleet_id = ${fleetId} and driver_user_id = ${driverUid}`;
  if (existing.length && (existing[0].status === 'invited' || existing[0].status === 'active')) {
    throw new FleetError('That driver is already invited or a member.', 409);
  }

  if (existing.length) {
    // Previously left/declined — re-invite by resetting the same row.
    await sql`update fleet_members set status = 'invited', invited_at = now(), joined_at = null
      where fleet_id = ${fleetId} and driver_user_id = ${driverUid}`;
  } else {
    await sql`insert into fleet_members (fleet_id, driver_user_id) values (${fleetId}, ${driverUid})`;
  }
}

// Driver accepts or declines an invite addressed to them.
export async function respondToInvite(uid, fleetId, accept) {
  const sql = db();
  const rows = accept
    ? await sql`
        update fleet_members set status = 'active', joined_at = now()
        where fleet_id = ${fleetId} and driver_user_id = ${uid} and status = 'invited'
        returning id
      `
    : await sql`
        update fleet_members set status = 'declined'
        where fleet_id = ${fleetId} and driver_user_id = ${uid} and status = 'invited'
        returning id
      `;
  if (!rows.length) throw new FleetError('No pending invite found.', 404);
}

// Driver leaves a fleet they're currently active in.
export async function leaveFleet(uid, fleetId) {
  const sql = db();
  const rows = await sql`
    update fleet_members set status = 'left'
    where fleet_id = ${fleetId} and driver_user_id = ${uid} and status = 'active'
    returning id
  `;
  if (!rows.length) throw new FleetError('You are not an active member of that fleet.', 404);
}

// Read-only aggregate stats for every active member, scoped to [since,
// until] (inclusive, 'YYYY-MM-DD' text dates — same format/comparison
// site/app.js already uses for its own period filters). Mirrors the km/L
// weighting app.js's renderDashboard() uses: sum(distance) / sum(distance
// / consumption) rather than averaging each session's own km/L.
export async function getFleetDashboard(ownerUid, fleetId, since, until) {
  const sql = db();
  const fleetRows = await sql`select * from fleets where id = ${fleetId} and owner_user_id = ${ownerUid}`;
  if (!fleetRows.length) throw new FleetError('Fleet not found.', 404);

  const rows = await sql`
    select u.id as driver_id, u.first_name, u.email, fm.joined_at,
      count(ds.id) as trips,
      coalesce(sum(ds.rev), 0) as revenue,
      coalesce(sum(ds.net_rev), 0) as net_revenue,
      coalesce(sum(ds.distance), 0) as distance,
      coalesce(sum(case when ds.consumption > 0 then ds.distance / ds.consumption else 0 end), 0) as liters
    from fleet_members fm
    join users u on u.id = fm.driver_user_id
    left join driver_sessions ds
      on ds.user_id = u.id and ds.deleted = false and ds.date >= ${since} and ds.date <= ${until}
    where fm.fleet_id = ${fleetId} and fm.status = 'active'
    group by u.id, u.first_name, u.email, fm.joined_at
    order by net_revenue desc
  `;

  const drivers = rows.map(r => ({
    driverId: r.driver_id, firstName: r.first_name || '', email: r.email || '', joinedAt: r.joined_at,
    trips: Number(r.trips), revenue: Number(r.revenue), netRevenue: Number(r.net_revenue),
    distance: Number(r.distance), liters: Number(r.liters),
    kmPerL: Number(r.distance) > 0 && Number(r.liters) > 0 ? Number(r.distance) / Number(r.liters) : null,
  }));

  const pending = await sql`
    select u.first_name, u.email, fm.invited_at from fleet_members fm
    join users u on u.id = fm.driver_user_id
    where fm.fleet_id = ${fleetId} and fm.status = 'invited'
    order by fm.invited_at
  `;

  return {
    fleet: rowToFleet(fleetRows[0]),
    drivers,
    pendingInvites: pending.map(p => ({ firstName: p.first_name || '', email: p.email || '', invitedAt: p.invited_at })),
  };
}

// Read-only maintenance alerts across all active members: any vehicle with
// a next_due_date that's overdue or within the next 30 days.
export async function getFleetMaintenanceSummary(ownerUid, fleetId) {
  const sql = db();
  const fleetRows = await sql`select * from fleets where id = ${fleetId} and owner_user_id = ${ownerUid}`;
  if (!fleetRows.length) throw new FleetError('Fleet not found.', 404);

  const rows = await sql`
    select u.first_name, vm.vehicle, vm.service_type, vm.next_due_date, vm.next_due_km,
      vm.next_due_date < current_date::text as overdue
    from fleet_members fm
    join users u on u.id = fm.driver_user_id
    join vehicle_maintenance vm on vm.user_id = u.id and vm.deleted = false
    where fm.fleet_id = ${fleetId} and fm.status = 'active'
      and vm.next_due_date is not null
      and vm.next_due_date <= (current_date + interval '30 days')::text
    order by vm.next_due_date asc
  `;

  return rows.map(r => ({
    firstName: r.first_name || '', vehicle: r.vehicle, serviceType: r.service_type,
    nextDueDate: r.next_due_date, nextDueKm: r.next_due_km,
    overdue: r.overdue,
  }));
}
