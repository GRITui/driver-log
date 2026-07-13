/* DriverLog — lib/auth.js
 *
 * Password hashing + stateless signed session tokens for the Neon-backed
 * auth API (api/auth-*.js, api/records-*.js). No server-side session/token
 * table on purpose — same "no session store" approach Sidekick's
 * lib/lineLogin.js already uses for its OAuth `state` param: a token is
 * just a tamper-evident, self-expiring blob (payload + '.' + HMAC
 * signature) the client stores and sends back on every request, verified
 * fresh each time against AUTH_TOKEN_SECRET. Losing the secret invalidates
 * every issued token at once — that's the deliberate trade-off for not
 * needing a revocation list.
 *
 * Edge-runtime only: everything here is Web Crypto (crypto.subtle), no
 * Node-only APIs (no bcrypt/argon2 package), matching how the rest of this
 * project's serverless functions run (config = { runtime: 'edge' }).
 */

function bytesToBase64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64UrlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - b64url.length % 4) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacSha256(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
}

// Timing-safe string comparison — a plain `===` on a secret-derived
// signature is a (minor, but free-to-fix) side-channel leak of how many
// leading bytes matched.
export function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — no refresh flow yet; expired -> log in again

export async function signToken({ uid }, secret) {
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ uid, ts: Date.now() })));
  const sig = bytesToBase64Url(new Uint8Array(await hmacSha256(secret, payload)));
  return `${payload}.${sig}`;
}

// Returns { uid } if the signature is valid and the token isn't stale, else
// null (also null on any malformed input — never throws).
export async function verifyToken(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  try {
    const expected = bytesToBase64Url(new Uint8Array(await hmacSha256(secret, payload)));
    if (!constantTimeEqual(expected, sig)) return null;
    const { uid, ts } = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload)));
    if (!uid || typeof ts !== 'number' || Date.now() - ts > TOKEN_MAX_AGE_MS) return null;
    return { uid };
  } catch {
    return null;
  }
}

// Reads the bearer token off an incoming Request and resolves it to a uid,
// or null if missing/invalid/expired. Shared by every authed api/ route.
export async function requireAuth(request, secret) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  const verified = await verifyToken(token, secret);
  return verified ? verified.uid : null;
}

const PBKDF2_ITERS = 210000; // OWASP-recommended floor for PBKDF2-HMAC-SHA256 as of 2023

export function randomSaltHex() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERS, hash: 'SHA-256' }, key, 256
  );
  return bytesToBase64Url(new Uint8Array(bits));
}

export async function verifyPassword(password, saltHex, expectedHash) {
  const actual = await hashPassword(password, saltHex);
  return constantTimeEqual(actual, expectedHash);
}
