/* DriverLog — api/records-list.js
 * GET /api/records-list?collection=sessions|fuel&since=<ISO> (optional)
 * Mirrors Sync.list() — records for the authed user updated after `since`.
 */
import { requireAuth } from '../lib/auth.js';
import { isValidCollection, listRecords } from '../lib/records.js';

export default async function handler(request) {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });

  const tokenSecret = process.env.AUTH_TOKEN_SECRET;
  if (!tokenSecret) return new Response('Auth is not configured on this deployment.', { status: 500 });

  const uid = await requireAuth(request, tokenSecret);
  if (!uid) return json({ error: 'Not authenticated.' }, 401);

  const { searchParams } = new URL(request.url);
  const collection = searchParams.get('collection');
  if (!isValidCollection(collection)) return json({ error: 'Unknown collection.' }, 400);
  const since = searchParams.get('since') || null;

  try {
    const items = await listRecords(uid, collection, since);
    return json({ items });
  } catch (err) {
    console.error('records-list failed', err);
    return json({ error: 'Something went wrong.' }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export const config = { runtime: 'edge' };
