<?php
/**
 * CSRF token issue + verify, backed by the session.
 * Requires an active session (call chat_session_start() first).
 */

require_once __DIR__ . '/session.php';

/**
 * Return the current CSRF token, creating one if none exists.
 */
function csrf_token(): string
{
    chat_session_start();
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

/**
 * Force-generate a brand new token (e.g. right after login). Returns it.
 */
function csrf_rotate(): string
{
    chat_session_start();
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    return $_SESSION['csrf_token'];
}

/**
 * Constant-time check of a submitted token against the session token.
 */
function csrf_verify(?string $token): bool
{
    chat_session_start();
    if (empty($_SESSION['csrf_token']) || !is_string($token) || $token === '') {
        return false;
    }
    return hash_equals($_SESSION['csrf_token'], $token);
}
