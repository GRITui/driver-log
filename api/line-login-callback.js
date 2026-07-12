/* DriverLog — api/line-login-callback.js
 *
 * LINE redirects here after the user approves (or cancels) the login.
 * Unlike Sidekick's version of this file (which just hands the verified
 * profile to the client for local-only storage), this one owns real
 * accounts: it upserts a `users` row keyed by the LINE `sub` and issues one
 * of this project's own signed auth tokens (lib/auth.js), so a LINE login
 * ends up in exactly the same authenticated state as an email/password
 * login — same token shape, same api/records-*.js access.
 *
 * The token (plus uid/email/firstName for the client to populate
 * currentUser without an extra round trip) is handed back as a URL
 * fragment on the login.html the user actually started from (see
 * `returnTo` in lib/lineLogin.js / api/line-login-start.js — never this
 * handler's own `origin`), which never reaches this server or any server
 * log. site/app.js's handleLineLoginRedirect() reads it once.
 */
import { verifyState, exchangeCodeForToken, verifyIdToken, constantTimeEqual } from '../lib/lineLogin.js';
import { signToken } from '../lib/auth.js';
import { db } from '../lib/db.js';

const STATE_COOKIE = 'line_login_nonce';

function redirectTo(base, params) {
  const headers = new Headers({ location: `${base}#${new URLSearchParams(params).toString()}` });
  // One-shot: this cookie has done its job (or the flow failed), don't leave
  // it sitting around for longer than the state token it was bound to.
  headers.append('set-cookie', `${STATE_COOKIE}=; Max-Age=0; Path=/api/line-login-callback; HttpOnly; Secure; SameSite=Lax`);
  return new Response(null, { status: 302, headers });
}

function getCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

export default async function handler(request) {
  const { searchParams, origin } = new URL(request.url);
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;
  const callbackUrl = process.env.LINE_LOGIN_CALLBACK_URL;
  const stateSecret = process.env.LINE_LOGIN_STATE_SECRET;
  const tokenSecret = process.env.AUTH_TOKEN_SECRET;
  if (!channelId || !channelSecret || !callbackUrl || !stateSecret || !tokenSecret) {
    return new Response('LINE Login is not configured on this deployment.', { status: 500 });
  }

  // Fallback for error paths reached before (or without ever) verifying
  // state — we don't yet know a validated returnTo, so land on this
  // deployment's own login page rather than failing the redirect outright.
  const fallbackBase = `${origin}/login.html`;

  if (searchParams.get('error')) {
    return redirectTo(fallbackBase, { line_error: searchParams.get('error') });
  }

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  if (!code || !state) return redirectTo(fallbackBase, { line_error: 'missing_params' });

  const verified = await verifyState(state, stateSecret);
  if (!verified) return redirectTo(fallbackBase, { line_error: 'invalid_state' });
  const { nonce, returnTo } = verified;
  const base = returnTo || fallbackBase;

  // Browser-binding check: the nonce must match the cookie api/line-login-
  // start.js set on the same browser at the start of this flow. A signed
  // `state` alone is tamper-evident but not proof of origin — without this,
  // an attacker could capture/replay a state value to force a login-CSRF on
  // a victim's browser (see lib/lineLogin.js's header).
  const cookieNonce = getCookie(request, STATE_COOKIE);
  if (!cookieNonce || !constantTimeEqual(cookieNonce, nonce)) {
    return redirectTo(base, { line_error: 'invalid_state' });
  }

  let claims;
  try {
    const token = await exchangeCodeForToken({ code, channelId, channelSecret, callbackUrl });
    claims = await verifyIdToken(token.id_token, { channelId, channelSecret, nonce });
  } catch (err) {
    console.error('line-login-callback: LINE exchange/verify failed', err);
    return redirectTo(base, { line_error: 'login_failed' });
  }

  const lineSub = claims.sub;
  const name = claims.name || '';
  const picture = claims.picture || '';

  let user;
  try {
    const sql = db();
    const existing = await sql`select id, first_name, email from users where line_sub = ${lineSub}`;
    if (existing.length) {
      user = existing[0];
      // Keep the profile picture fresh; never overwrite a first_name the
      // driver may have edited themselves since the account was created.
      await sql`update users set line_picture = ${picture} where id = ${user.id}`;
    } else {
      const inserted = await sql`
        insert into users (line_sub, line_picture, first_name)
        values (${lineSub}, ${picture}, ${name})
        returning id, first_name, email
      `;
      user = inserted[0];
    }
  } catch (err) {
    console.error('line-login-callback: database upsert failed', err);
    return redirectTo(base, { line_error: 'login_failed' });
  }

  const authToken = await signToken({ uid: user.id }, tokenSecret);
  return redirectTo(base, {
    token: authToken,
    uid: user.id,
    firstName: user.first_name || name || '',
    email: user.email || '',
  });
}

export const config = { runtime: 'edge' };
