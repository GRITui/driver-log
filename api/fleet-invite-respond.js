/* DriverLog — api/fleet-invite-respond.js
 * POST /api/fleet-invite-respond  body: { fleetId, accept }
 * Driver-only. Accepting is the one action that grants an owner read
 * access to this driver's sessions/fuel — see lib/fleets.js's header.
 */
import { requireAuth } from '../lib/auth.js';
import { respondToInvite, FleetError } from '../lib/fleets.js';

export default async function handler(request) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const tokenSecret = process.env.AUTH_TOKEN_SECRET;
  if (!tokenSecret) return new Response('Auth is not configured on this deployment.', { status: 500 });

  const uid = await requireAuth(request, tokenSecret);
  if (!uid) return json({ error: 'Not authenticated.' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const fleetId = String(body.fleetId || '');
  if (!fleetId) return json({ error: 'Missing fleetId.' }, 400);

  try {
    await respondToInvite(uid, fleetId, !!body.accept);
    return json({ ok: true });
  } catch (err) {
    if (err instanceof FleetError) return json({ error: err.message }, err.status);
    console.error('fleet-invite-respond failed', err);
    return json({ error: 'Something went wrong.' }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export const config = { runtime: 'edge' };
