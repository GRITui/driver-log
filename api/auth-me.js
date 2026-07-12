/* DriverLog — api/auth-me.js
 *
 * Resolves the bearer token to the current account. Not called on every
 * page load today (site/app.js's restoreSession() trusts its local cache
 * for the synchronous check the rest of the app expects — see
 * lib/auth.js's header) — this exists for anywhere that wants a real,
 * server-verified read of the account, and as the same validation every
 * api/records-*.js call already performs inline via requireAuth().
 */
import { db } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';

export default async function handler(request) {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });

  const tokenSecret = process.env.AUTH_TOKEN_SECRET;
  if (!tokenSecret) return new Response('Auth is not configured on this deployment.', { status: 500 });

  const uid = await requireAuth(request, tokenSecret);
  if (!uid) return json({ error: 'Not authenticated.' }, 401);

  const sql = db();
  try {
    const rows = await sql`select id, email, first_name, line_picture from users where id = ${uid}`;
    const user = rows[0];
    if (!user) return json({ error: 'Account no longer exists.' }, 401);
    return json({ uid: user.id, email: user.email || '', firstName: user.first_name || '', linePicture: user.line_picture || '' });
  } catch (err) {
    console.error('auth-me failed', err);
    return json({ error: 'Something went wrong.' }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export const config = { runtime: 'edge' };
