<?php
/**
 * Per-session rate limiter (fixed window).
 *
 * Caps requests to `max` per `window` seconds, counted per PHP session.
 * State lives in $_SESSION so a leaked/idle session can't burn unlimited
 * tokens. Callable in isolation: just include this file and call rate_limit_hit().
 */

require_once __DIR__ . '/session.php';

/**
 * Record one request and report whether it is allowed.
 *
 * @param int $max    Max requests permitted per window. 0/negative => defaults.
 * @param int $window Window length in seconds.
 * @return array{allowed:bool, remaining:int, retry_after:int}
 */
function rate_limit_hit(int $max = 30, int $window = 60, string $bucket = 'default'): array
{
    chat_session_start();

    if ($max <= 0)    { $max = 30; }
    if ($window <= 0) { $window = 60; }

    $now = time();
    $key = 'ratelimit_' . $bucket;

    $state = $_SESSION[$key] ?? null;
    if (!is_array($state) || !isset($state['start'], $state['count'])) {
        $state = ['start' => $now, 'count' => 0];
    }

    // Window expired -> reset.
    if (($now - $state['start']) >= $window) {
        $state = ['start' => $now, 'count' => 0];
    }

    $state['count']++;
    $_SESSION[$key] = $state;

    $allowed     = $state['count'] <= $max;
    $remaining   = max(0, $max - $state['count']);
    $retry_after = $allowed ? 0 : max(1, $window - ($now - $state['start']));

    return [
        'allowed'     => $allowed,
        'remaining'   => $remaining,
        'retry_after' => $retry_after,
    ];
}

/**
 * Convenience: enforce the limit and send a 429 JSON response if exceeded.
 */
function rate_limit_enforce(int $max = 30, int $window = 60, string $bucket = 'default'): void
{
    $r = rate_limit_hit($max, $window, $bucket);
    if (!$r['allowed']) {
        if (!headers_sent()) {
            http_response_code(429);
            header('Content-Type: application/json; charset=utf-8');
            header('Retry-After: ' . $r['retry_after']);
        }
        echo json_encode([
            'ok'          => false,
            'error'       => 'Rate limit exceeded. Try again shortly.',
            'retry_after' => $r['retry_after'],
        ]);
        exit;
    }
}

/*
 * -------------------------------------------------------------------------
 * Login brute-force lockout (GLOBAL, file-backed).
 *
 * The per-session rate limiter above is bypassable by simply dropping the
 * session cookie (fresh session => fresh bucket). Because there is exactly one
 * account (GRIT), we back the login lockout with a single global file keyed by
 * install path — an attacker cannot reset it by discarding cookies. State is a
 * tiny JSON blob (timestamps + a counter only, no secrets) written with an
 * exclusive lock. Lives in the system temp dir, which is writable on Hostinger
 * shared hosting; if temp is cleared the only effect is the lockout resetting.
 * -------------------------------------------------------------------------
 */

/**
 * Absolute path of the global lockout state file. Salted by install dir so two
 * apps sharing the same temp dir don't collide, and so the name isn't guessable.
 */
function login_lockout_file(): string
{
    return sys_get_temp_dir() . '/dlchat_login_' . substr(hash('sha256', __DIR__), 0, 16) . '.json';
}

/** Read + normalize the lockout state. */
function login_lockout_state(): array
{
    $default = ['fails' => 0, 'first' => 0, 'locked_until' => 0];
    $file = login_lockout_file();
    if (!is_file($file)) {
        return $default;
    }
    $raw = @file_get_contents($file);
    if ($raw === false || $raw === '') {
        return $default;
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        return $default;
    }
    return [
        'fails'        => (int) ($data['fails'] ?? 0),
        'first'        => (int) ($data['first'] ?? 0),
        'locked_until' => (int) ($data['locked_until'] ?? 0),
    ];
}

/** Persist the lockout state (best-effort, exclusive lock). */
function login_lockout_write(array $state): void
{
    @file_put_contents(login_lockout_file(), json_encode($state), LOCK_EX);
}

/**
 * If currently locked out, emit a clean 429 and exit. Otherwise return.
 *
 * @param int $threshold Consecutive failures within $window before lockout.
 * @param int $lock      Lockout duration in seconds once tripped.
 * @param int $window    Sliding window (seconds) over which failures accumulate.
 */
function login_lockout_enforce(int $threshold = 5, int $lock = 900, int $window = 900): void
{
    $now   = time();
    $state = login_lockout_state();

    if ($state['locked_until'] > $now) {
        $retry = $state['locked_until'] - $now;
        if (!headers_sent()) {
            http_response_code(429);
            header('Content-Type: application/json; charset=utf-8');
            header('Retry-After: ' . $retry);
        }
        echo json_encode([
            'ok'          => false,
            'error'       => 'Too many failed attempts. Try again later.',
            'retry_after' => $retry,
        ]);
        exit;
    }
}

/**
 * Record one failed login. Trips the lockout once $threshold failures land
 * inside $window seconds.
 */
function login_lockout_fail(int $threshold = 5, int $lock = 900, int $window = 900): void
{
    $now   = time();
    $state = login_lockout_state();

    // Start a fresh window if the previous one has fully elapsed and we're not
    // already inside a live lockout.
    if ($state['first'] === 0 || ($now - $state['first']) > $window) {
        $state = ['fails' => 0, 'first' => $now, 'locked_until' => $state['locked_until']];
    }

    $state['fails']++;

    if ($state['fails'] >= $threshold) {
        $state['locked_until'] = $now + $lock;
        // Reset the counter so the next window starts clean after the lockout.
        $state['fails'] = 0;
        $state['first'] = $now;
    }

    login_lockout_write($state);
}

/** Clear all lockout state (called on a successful login). */
function login_lockout_reset(): void
{
    $file = login_lockout_file();
    if (is_file($file)) {
        @unlink($file);
    }
}
