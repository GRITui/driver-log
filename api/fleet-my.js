/* DriverLog — api/fleet-my.js
 * GET /api/fleet-my
 * Everything this account needs to render its fleet UI in one call: fleets
 * it owns (each with its member list, all statuses) and fleets it belongs
 * to as a driver (invited/active/left/declined) — an account can be both.
 */
import { requireAuth } from '../lib/auth.js';
import { getOwnedFleets, getMemberships } from '../lib/fleets.js';

export default async function handler(request) {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });

  const tokenSecret = process.env.AUTH_TOKEN_SECRET;
  if (!tokenSecret) return new Response('Auth is not configured on this deployment.', { status: 500 });

  const uid = await requireAuth(request, tokenSecret);
  if (!uid) return json({ error: 'Not authenticated.' }, 401);

  try {
    const [owned, memberships] = await Promise.all([getOwnedFleets(uid), getMemberships(uid)]);
    return json({ owned, memberships });
  } catch (err) {
    console.error('fleet-my failed', err);
    return json({ error: 'Something went wrong.' }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export const config = { runtime: 'edge' };
