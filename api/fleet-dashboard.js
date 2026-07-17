/* DriverLog — api/fleet-dashboard.js
 * GET /api/fleet-dashboard?fleetId=&since=&until=  (since/until optional, 'YYYY-MM-DD')
 * Owner-only. Read-only aggregate across active members' own sessions —
 * see lib/fleets.js's getFleetDashboard for the exact query/scope.
 * Defaults to the current calendar month, same as the driver app's own
 * "This month" period filter.
 */
import { requireAuth } from '../lib/auth.js';
import { getFleetDashboard, getFleetMaintenanceSummary, FleetError } from '../lib/fleets.js';

function currentMonthRange() {
  const d = new Date();
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  const pad = (n) => String(n).padStart(2, '0');
  const since = `${y}-${pad(m + 1)}-01`;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const until = `${y}-${pad(m + 1)}-${pad(lastDay)}`;
  return { since, until };
}

export default async function handler(request) {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });

  const tokenSecret = process.env.AUTH_TOKEN_SECRET;
  if (!tokenSecret) return new Response('Auth is not configured on this deployment.', { status: 500 });

  const uid = await requireAuth(request, tokenSecret);
  if (!uid) return json({ error: 'Not authenticated.' }, 401);

  const { searchParams } = new URL(request.url);
  const fleetId = searchParams.get('fleetId');
  if (!fleetId) return json({ error: 'Missing fleetId.' }, 400);

  const defaults = currentMonthRange();
  const since = searchParams.get('since') || defaults.since;
  const until = searchParams.get('until') || defaults.until;

  try {
    const data = await getFleetDashboard(uid, fleetId, since, until);

    let maintenanceSummary = [];
    try {
      maintenanceSummary = await getFleetMaintenanceSummary(uid, fleetId);
    } catch (err) {
      console.error('fleet-dashboard maintenance summary failed', err);
    }

    return json({ ...data, since, until, maintenanceSummary });
  } catch (err) {
    if (err instanceof FleetError) return json({ error: err.message }, err.status);
    console.error('fleet-dashboard failed', err);
    return json({ error: 'Something went wrong.' }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export const config = { runtime: 'edge' };
