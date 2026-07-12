/* DriverLog — api/records-find.js
 * GET /api/records-find?collection=sessions|fuel&cuid=<cuid>
 * Mirrors Sync.findByCuid() — used by pushOutbox() to recover a lost sid
 * before deciding create-vs-update.
 */
import { requireAuth } from '../lib/auth.js';
import { isValidCollection, findByCuid } from '../lib/records.js';

export default async function handler(request) {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });

  const tokenSecret = process.env.AUTH_TOKEN_SECRET;
  if (!tokenSecret) return new Response('Auth is not configured on this deployment.', { status: 500 });

  const uid = await requireAuth(request, tokenSecret);
  if (!uid) return json({ error: 'Not authenticated.' }, 401);

  const { searchParams } = new URL(request.url);
  const collection = searchParams.get('collection');
  if (!isValidCollection(collection)) return json({ error: 'Unknown collection.' }, 400);
  const cuidVal = searchParams.get('cuid');
  if (!cuidVal) return json({ error: 'Missing cuid.' }, 400);

  try {
    const item = await findByCuid(uid, collection, cuidVal);
    return json({ item });
  } catch (err) {
    console.error('records-find failed', err);
    return json({ error: 'Something went wrong.' }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export const config = { runtime: 'edge' };
