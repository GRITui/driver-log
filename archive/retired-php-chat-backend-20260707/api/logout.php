<?php
/**
 * POST /chat/api/logout.php
 * Clears the session. Always returns {ok:true}.
 */

require_once __DIR__ . '/../lib/session.php';
require_once __DIR__ . '/../lib/auth.php';

chat_session_start();
header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    echo json_encode(['ok' => false, 'error' => 'Method not allowed.']);
    exit;
}

logout();

echo json_encode(['ok' => true]);
