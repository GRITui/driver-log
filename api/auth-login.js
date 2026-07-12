/* DriverLog — api/auth-login.js */
import { db } from '../lib/db.js';
import { verifyPassword, signToken } from '../lib/auth.js';

export default async function handler(request) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const tokenSecret = process.env.AUTH_TOKEN_SECRET;
  if (!tokenSecret) return new Response('Auth is not configured on this deployment.', { status: 500 });

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) return json({ error: 'Incorrect email or password.' }, 401);

  const sql = db();
  try {
    const rows = await sql`select id, password_hash, password_salt, first_name from users where email = ${email}`;
    // Same generic error whether the email doesn't exist or the password is
    // wrong — don't let this endpoint be used to enumerate registered emails.
    const user = rows[0];
    if (!user || !user.password_hash || !user.password_salt) return json({ error: 'Incorrect email or password.' }, 401);

    const ok = await verifyPassword(password, user.password_salt, user.password_hash);
    if (!ok) return json({ error: 'Incorrect email or password.' }, 401);

    const authToken = await signToken({ uid: user.id }, tokenSecret);
    return json({ uid: user.id, token: authToken, email, firstName: user.first_name || '' });
  } catch (err) {
    console.error('auth-login failed', err);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export const config = { runtime: 'edge' };
