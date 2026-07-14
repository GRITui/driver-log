/* DriverLog — api/fleet-invite.js
 * POST /api/fleet-invite  body: { fleetId, email }
 * Owner-only. Creates a pending invite for an existing DriverLog account —
 * the driver must accept via fleet-invite-respond before the owner can see
 * anything of theirs (see lib/fleets.js's getFleetDashboard scope).
 */
import { requireAuth } from '../lib/auth.js';
import { inviteMember, FleetError } from '../lib/fleets.js';

export default async function handler(request) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const tokenSecret = process.env.AUTH_TOKEN_SECRET;
  if (!tokenSecret) return new Response('Auth is not configured on this deployment.', { status: 500 });

  const uid = await requireAuth(request, tokenSecret);
  if (!uid) return json({ error: 'Not authenticated.' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const fleetId = String(body.fleetId || '');
  const email = String(body.email || '').trim().toLowerCase();
  if (!fleetId || !email) return json({ error: 'Missing fleetId or email.' }, 400);

  try {
    await inviteMember(uid, fleetId, email);
    return json({ ok: true });
  } catch (err) {
    if (err instanceof FleetError) return json({ error: err.message }, err.status);
    console.error('fleet-invite failed', err);
    return json({ error: 'Something went wrong.' }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export const config = { runtime: 'edge' };
