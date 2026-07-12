/* DriverLog — api/auth-register.js
 *
 * Creates an email/password account. Mirrors the validation the client
 * already does in site/app.js's submitAuth() cloud path (valid email,
 * password >= 8 chars) — never trust that the client actually ran it.
 */
import { db } from '../lib/db.js';
import { randomSaltHex, hashPassword, signToken } from '../lib/auth.js';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default async function handler(request) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const tokenSecret = process.env.AUTH_TOKEN_SECRET;
  if (!tokenSecret) return new Response('Auth is not configured on this deployment.', { status: 500 });

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const firstName = String(body.firstName || '').trim();

  if (!EMAIL_RE.test(email)) return json({ error: 'Please enter a valid email address.' }, 400);
  if (password.length < 8) return json({ error: 'Password must be at least 8 characters.' }, 400);

  const sql = db();
  try {
    const existing = await sql`select id from users where email = ${email}`;
    if (existing.length) return json({ error: 'That email is already registered.' }, 409);

    const salt = randomSaltHex();
    const hash = await hashPassword(password, salt);
    const inserted = await sql`
      insert into users (email, password_hash, password_salt, first_name)
      values (${email}, ${hash}, ${salt}, ${firstName})
      returning id
    `;
    const uid = inserted[0].id;
    const authToken = await signToken({ uid }, tokenSecret);
    return json({ uid, token: authToken, email, firstName });
  } catch (err) {
    console.error('auth-register failed', err);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export const config = { runtime: 'edge' };
