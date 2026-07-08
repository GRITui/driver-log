<?php
/**
 * POST /chat/api/login.php
 * Body: {password}   (username is hard-fixed to GRIT server-side)
 * Success: 200 {ok:true, csrf}
 * Failure: 401 {ok:false}
 */

require_once __DIR__ . '/../lib/session.php';
require_once __DIR__ . '/../lib/auth.php';
require_once __DIR__ . '/../lib/ratelimit.php';

chat_session_start();
header('Content-Type: application/json; charset=utf-8');

// Only POST.
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    echo json_encode(['ok' => false, 'error' => 'Method not allowed.']);
    exit;
}

// Global, cookie-proof lockout after repeated failures (single GRIT account),
// plus a per-session throttle. Both slow brute force; the global one can't be
// bypassed by dropping the session cookie.
login_lockout_enforce(5, 900, 900);
rate_limit_enforce(10, 60, 'login');

// Accept JSON body or form-encoded.
$password = null;
$raw = file_get_contents('php://input');
if ($raw !== false && $raw !== '') {
    $decoded = json_decode($raw, true);
    if (is_array($decoded) && isset($decoded['password'])) {
        $password = $decoded['password'];
    }
}
if ($password === null && isset($_POST['password'])) {
    $password = $_POST['password'];
}

// A missing/empty password is treated exactly like a wrong one: same 401 body,
// same failure accounting — no distinct shape for an attacker to probe.
if (!is_string($password) || $password === '') {
    login_lockout_fail(5, 900, 900);
    http_response_code(401);
    echo json_encode(['ok' => false]);
    exit;
}

$csrf = login($password);

if ($csrf === null) {
    login_lockout_fail(5, 900, 900);
    http_response_code(401);
    echo json_encode(['ok' => false]);
    exit;
}

echo json_encode(['ok' => true, 'csrf' => $csrf]);
