/* DriverLog — api/push-register.js
 * POST /api/push-register  body: { token }
 * Stores the FCM device token the Capacitor push-notifications plugin
 * hands back after a device registers (see site/app.js's
 * initPushNotifications()). Last-write-wins per user — one row, one token,
 * no device history.
 *
 * This endpoint only *receives* tokens. Nothing in this project sends a
 * push yet — that needs a Firebase project (google-services.json in
 * android/app/, plus an FCM server key set as an env var here) that
 * doesn't exist yet. Safe to leave dormant until that's set up.
 */
import { db } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';

export default async function handler(request) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const tokenSecret = process.env.AUTH_TOKEN_SECRET;
  if (!tokenSecret) return new Response('Auth is not configured on this deployment.', { status: 500 });

  const uid = await requireAuth(request, tokenSecret);
  if (!uid) return json({ error: 'Not authenticated.' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const token = body && body.token;
  if (!token || typeof token !== 'string') return json({ error: 'Missing token.' }, 400);

  const sql = db();
  try {
    await sql`update users set push_token = ${token} where id = ${uid}`;
    return json({ ok: true });
  } catch (err) {
    console.error('push-register failed', err);
    return json({ error: 'Something went wrong.' }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export const config = { runtime: 'edge' };
