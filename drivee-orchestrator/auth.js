// auth.js — password verification + short-lived opaque Bearer tokens (in-memory).
//
// Security notes:
//  - Password is verified against a bcrypt hash from config (never plaintext).
//  - A wrong password and a missing/placeholder hash BOTH run a real bcrypt
//    compare against a dummy hash so response timing does not leak which case
//    it was.
//  - Tokens are 256-bit random opaque strings, stored in memory with an expiry.
//    They carry no data and are not guessable; they die on restart.
//  - A global login lockout (N fails / window) throttles brute force.

import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

// A valid-format bcrypt hash used only to burn constant time on the
// wrong-password / broken-config paths. (Hash of a random throwaway string.)
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeODnTA6uZ.wG5g0Ru4uGYq6H4Rf4jP0/6';

export function createAuth(config) {
  const tokens = new Map(); // token -> { expiresAt }
  const ttlMs = (config.token_ttl_seconds ?? 900) * 1000;

  // Global login lockout state.
  const lockout = {
    fails: 0,
    windowStart: 0,
    lockedUntil: 0,
    maxFails: config.login_lockout_max_fails ?? 5,
    windowMs: (config.login_lockout_window_seconds ?? 900) * 1000,
    lockMs: (config.login_lockout_seconds ?? 900) * 1000,
  };

  function pruneTokens() {
    const now = Date.now();
    for (const [t, v] of tokens) if (v.expiresAt <= now) tokens.delete(t);
  }

  function isLockedOut() {
    return Date.now() < lockout.lockedUntil;
  }

  function recordFail() {
    const now = Date.now();
    if (now - lockout.windowStart > lockout.windowMs) {
      lockout.windowStart = now;
      lockout.fails = 0;
    }
    lockout.fails += 1;
    if (lockout.fails >= lockout.maxFails) {
      lockout.lockedUntil = now + lockout.lockMs;
      lockout.fails = 0;
      lockout.windowStart = now;
    }
  }

  function resetFails() {
    lockout.fails = 0;
    lockout.windowStart = 0;
  }

  /**
   * Verify a password. Returns { ok, token?, ttlSeconds?, lockedOut? }.
   * Never throws on bad input.
   */
  async function login(password) {
    if (isLockedOut()) return { ok: false, lockedOut: true };

    const hash = typeof config.password_hash === 'string' ? config.password_hash : '';
    const looksReal = /^\$2[aby]\$/.test(hash) && !hash.includes('REPLACE_ME');
    const pw = typeof password === 'string' ? password : '';

    let match = false;
    try {
      // Always run a real compare (against real hash if present, else dummy)
      // so timing is uniform whether or not config is set up.
      match = await bcrypt.compare(pw, looksReal ? hash : DUMMY_HASH);
    } catch {
      match = false;
    }
    if (!looksReal) match = false; // broken/placeholder config never authenticates

    if (!match) {
      recordFail();
      return { ok: false };
    }

    resetFails();
    pruneTokens();
    const token = crypto.randomBytes(32).toString('hex');
    tokens.set(token, { expiresAt: Date.now() + ttlMs });
    return { ok: true, token, ttlSeconds: Math.floor(ttlMs / 1000) };
  }

  /** Return true if the bearer token is present and unexpired. */
  function verify(token) {
    if (!token) return false;
    pruneTokens();
    const rec = tokens.get(token);
    if (!rec) return false;
    if (rec.expiresAt <= Date.now()) {
      tokens.delete(token);
      return false;
    }
    return true;
  }

  function logout(token) {
    if (token) tokens.delete(token);
  }

  return { login, verify, logout };
}
