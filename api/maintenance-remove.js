/* DriverLog — api/maintenance-remove.js
 * DELETE /api/maintenance-remove?sid=<id>
 * Collection-scoped mirror of /api/records-remove?collection=maintenance —
 * same lib/records.js removeRecord() underneath, same no-op-success-if-
 * already-gone semantics the outbox's delete retry relies on.
 */
import { requireAuth } from '../lib/auth.js';
import { removeRecord } from '../lib/records.js';

export default async function handler(request) {
  if (request.method !== 'DELETE') return new Response('Method not allowed', { status: 405 });

  const tokenSecret = process.env.AUTH_TOKEN_SECRET;
  if (!tokenSecret) return new Response('Auth is not configured on this deployment.', { status: 500 });

  const uid = await requireAuth(request, tokenSecret);
  if (!uid) return json({ error: 'Not authenticated.' }, 401);

  const { searchParams } = new URL(request.url);
  const sid = searchParams.get('sid');
  if (!sid) return json({ error: 'Missing sid.' }, 400);

  try {
    await removeRecord(uid, 'maintenance', sid);
    return json({ ok: true });
  } catch (err) {
    console.error('maintenance-remove failed', err);
    return json({ error: 'Something went wrong.' }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export const config = { runtime: 'edge' };
