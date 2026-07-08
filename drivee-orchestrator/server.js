// server.js — the Drivee orchestrator HTTP API.
//
// Endpoints:
//   POST /api/login   {password}                      -> {ok, token, ttl}
//   POST /api/chat    {messages:[{role,content}]}      -> {ok, reply}   (Bearer)
//   POST /api/logout                                    -> {ok}          (Bearer)
//
// Security:
//   - CORS allows ONLY the configured origin (default https://driverlog.link);
//     OPTIONS preflight handled; other origins get no CORS headers.
//   - Every /api/chat and /api/logout call requires a valid Bearer token.
//   - Per-token sliding-window rate limit on /api/chat.
//   - Request body size cap; JSON only.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuth } from './auth.js';
import { createBrain } from './brain.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- Config ---------------------------------------------------------------
function loadConfig() {
  const p = process.env.DRIVEE_CONFIG || path.join(__dirname, 'config.json');
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch {
    console.error(
      `\n[drivee] No config found at ${p}.\n` +
      `         Copy config.example.json -> config.json and fill it in.\n`
    );
    process.exit(1);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error(`[drivee] config is not valid JSON: ${e.message}`);
    process.exit(1);
  }
}

const config = loadConfig();
const PORT = config.port || 8787;
const ALLOWED_ORIGIN = config.allowed_origin || 'https://driverlog.link';
const MAX_BODY_BYTES = 12 * 1024 * 1024; // room for base64 images

// Phase 1: the orchestrator ALSO serves the Drivee UI so UI + API are
// same-origin at http://localhost:<port>/chat (no tunnel, no CORS needed).
const UI_DIR = path.join(__dirname, '..', 'site', 'chat');
const STATIC_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const auth = createAuth(config);
const brain = createBrain(config);

// ---- Per-token rate limiter (sliding window) ------------------------------
const rlMax = config.rate_limit_max ?? 20;
const rlWindowMs = (config.rate_limit_window_seconds ?? 60) * 1000;
const rlHits = new Map(); // token -> number[] (timestamps)

function rateLimited(token) {
  const now = Date.now();
  const arr = (rlHits.get(token) || []).filter((t) => now - t < rlWindowMs);
  if (arr.length >= rlMax) {
    rlHits.set(token, arr);
    return true;
  }
  arr.push(now);
  rlHits.set(token, arr);
  return false;
}
// Occasional cleanup of stale rate-limit buckets.
setInterval(() => {
  const now = Date.now();
  for (const [t, arr] of rlHits) {
    const keep = arr.filter((x) => now - x < rlWindowMs);
    if (keep.length) rlHits.set(t, keep); else rlHits.delete(t);
  }
}, 60000).unref();

// ---- HTTP helpers ---------------------------------------------------------
// Allowed cross-origin callers: the Phase-2 production origin (driverlog.link)
// plus localhost/127.0.0.1 (any port) so Phase-1 local dev works. The Phase-1
// UI is served SAME-ORIGIN, so it needs no CORS at all; this list only matters
// for genuinely cross-origin callers.
function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (origin === ALLOWED_ORIGIN) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

// ---- Static UI serving (Phase 1, same-origin) -----------------------------
function serveStatic(req, res, url) {
  // Same-origin config: override the shipped tunnel placeholder so the UI talks
  // to THIS server. Generated (never touches the committed config.js).
  if (url === '/chat/config.js' || url === '/config.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('window.DRIVEE_API_BASE = window.location.origin;\n');
    return true;
  }
  // Canonicalize entry points to /chat/ so the UI's relative navigations resolve.
  if (url === '/' || url === '/chat') {
    res.writeHead(302, { Location: '/chat/' });
    res.end();
    return true;
  }
  let rel;
  if (url === '/chat/') rel = 'index.html';
  else if (url.startsWith('/chat/')) rel = url.slice('/chat/'.length);
  else return false;

  let decoded;
  try { decoded = decodeURIComponent(rel); } catch { decoded = rel; }
  const full = path.normalize(path.join(UI_DIR, decoded));
  // Path-traversal guard: never serve outside UI_DIR.
  if (full !== UI_DIR && !full.startsWith(UI_DIR + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('forbidden');
    return true;
  }

  // Deny-list + extension WHITELIST — enforce the site/chat/.htaccess intent in
  // the serving code itself (the retired PHP source still physically exists).
  // Reply 404 (not 403) so we never confirm a blocked file's existence.
  const notFound = () => {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
    return true;
  };
  // Split on BOTH separators so a decoded '\' can't smuggle a segment past us.
  const segments = decoded.split(/[/\\]+/).filter(Boolean);
  // (a) any dotfile segment (.htaccess, .env, ...); (b) any lib/ segment;
  // (c) any .php file — refused regardless of extension whitelist below.
  for (const seg of segments) {
    if (seg.startsWith('.')) return notFound();
    if (seg.toLowerCase() === 'lib') return notFound();
  }
  const ext = path.extname(full).toLowerCase();
  if (ext === '.php') return notFound();
  // (d) WHITELIST: only known static asset extensions are ever served. Anything
  // else (no extension, .php, .htaccess, octet-stream unknowns) -> 404.
  if (!Object.prototype.hasOwnProperty.call(STATIC_MIME, ext)) return notFound();

  fs.readFile(full, (e, data) => {
    if (e) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': STATIC_MIME[ext] });
    res.end(data);
  });
  return true;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const s = Buffer.concat(chunks).toString('utf8');
      if (!s) return resolve({});
      try { resolve(JSON.parse(s)); }
      catch { reject(Object.assign(new Error('invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function bearer(req) {
  const h = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

// ---- Message validation ---------------------------------------------------
function validMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  if (messages.length > 50) return false;
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return false;
    const c = m.content;
    if (typeof c !== 'string' && !Array.isArray(c)) return false;
  }
  return true;
}

// ---- Routes ---------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url.split('?')[0];

  // Static UI (GET/HEAD) — served same-origin in Phase 1.
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (serveStatic(req, res, url)) return;
    return sendJson(res, 404, { ok: false, error: 'not found' });
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'method not allowed' });
  }

  try {
    if (url === '/api/login') {
      const body = await readBody(req);
      const result = await auth.login(body.password);
      if (result.lockedOut) {
        return sendJson(res, 429, { ok: false, error: 'too many attempts, try again later' });
      }
      if (!result.ok) {
        return sendJson(res, 401, { ok: false, error: 'invalid password' });
      }
      return sendJson(res, 200, { ok: true, token: result.token, ttl: result.ttlSeconds });
    }

    if (url === '/api/logout') {
      const token = bearer(req);
      if (!token || !auth.verify(token)) {
        return sendJson(res, 401, { ok: false, error: 'unauthorized' });
      }
      auth.logout(token);
      return sendJson(res, 200, { ok: true });
    }

    if (url === '/api/chat') {
      const token = bearer(req);
      if (!token || !auth.verify(token)) {
        return sendJson(res, 401, { ok: false, error: 'unauthorized' });
      }
      if (rateLimited(token)) {
        return sendJson(res, 429, { ok: false, error: 'slow down a moment' });
      }
      const body = await readBody(req);
      if (!validMessages(body.messages)) {
        return sendJson(res, 400, { ok: false, error: 'invalid messages' });
      }
      // OPT-IN gate: Claude is reached ONLY when the client explicitly asks.
      const useClaude = body.useClaude === true;
      const { reply, via } = await brain.orchestrate(body.messages, { useClaude });
      return sendJson(res, 200, { ok: true, reply, via });
    }

    return sendJson(res, 404, { ok: false, error: 'not found' });
  } catch (e) {
    const status = e.status || 500;
    // Never leak internals to the client.
    const msg = status === 500 ? 'internal error' : e.message;
    if (status === 500) console.error('[drivee] error:', e);
    return sendJson(res, status, { ok: false, error: msg });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[drivee] orchestrator listening on http://127.0.0.1:${PORT}`);
  console.log(`[drivee] CORS origin: ${ALLOWED_ORIGIN}`);
  // Warm the MCP client so the first chat isn't slow / doesn't race.
  brain.connect().then(
    () => console.log('[drivee] ask_claude MCP server connected'),
    (e) => console.error('[drivee] MCP connect failed (chat delegation will retry):', e.message)
  );
});

function shutdown() {
  console.log('\n[drivee] shutting down...');
  server.close();
  brain.close().finally(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
