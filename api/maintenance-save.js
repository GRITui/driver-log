/* DriverLog — api/maintenance-save.js
 * POST /api/maintenance-save  body: { sid, data }
 * Collection-scoped mirror of /api/records-save?collection=maintenance —
 * same lib/records.js saveRecord() underneath, same upsert semantics
 * (update if sid given and still valid, insert otherwise; cuid dedupe via
 * the unique (user_id, cuid) constraint — see sql/schema.sql).
 */
import { requireAuth } from '../lib/auth.js';
import { saveRecord } from '../lib/records.js';

export default async function handler(request) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const tokenSecret = process.env.AUTH_TOKEN_SECRET;
  if (!tokenSecret) return new Response('Auth is not configured on this deployment.', { status: 500 });

  const uid = await requireAuth(request, tokenSecret);
  if (!uid) return json({ error: 'Not authenticated.' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const { sid, data } = body || {};
  if (!data || typeof data !== 'object' || !data.cuid) return json({ error: 'Missing record data.' }, 400);

  try {
    const saved = await saveRecord(uid, 'maintenance', sid || null, data);
    return json({ item: saved });
  } catch (err) {
    console.error('maintenance-save failed', err);
    return json({ error: 'Something went wrong.' }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export const config = { runtime: 'edge' };
