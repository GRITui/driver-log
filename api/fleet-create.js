/* DriverLog — api/fleet-create.js
 * POST /api/fleet-create  body: { name }
 * Any account can create a fleet — becomes its owner. No plan/billing gate
 * yet (see docs/BACKLOG.md); this is the "fleet core" slice only.
 */
import { requireAuth } from '../lib/auth.js';
import { createFleet } from '../lib/fleets.js';

export default async function handler(request) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const tokenSecret = process.env.AUTH_TOKEN_SECRET;
  if (!tokenSecret) return new Response('Auth is not configured on this deployment.', { status: 500 });

  const uid = await requireAuth(request, tokenSecret);
  if (!uid) return json({ error: 'Not authenticated.' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const name = String(body.name || '').trim();
  if (!name) return json({ error: 'Please enter a fleet name.' }, 400);

  try {
    const fleet = await createFleet(uid, name);
    return json({ fleet });
  } catch (err) {
    console.error('fleet-create failed', err);
    return json({ error: 'Something went wrong.' }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export const config = { runtime: 'edge' };
