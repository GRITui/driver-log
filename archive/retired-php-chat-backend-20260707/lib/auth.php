<?php
/**
 * Authentication helpers for the login-gated chat.
 * Username is hard-fixed to GRIT; password is checked with password_verify()
 * against the bcrypt hash from the above-root config.
 */

require_once __DIR__ . '/session.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/csrf.php';
require_once __DIR__ . '/ratelimit.php';

/**
 * A valid but throwaway bcrypt hash (PHP manual example hash for "rasmuslerdol").
 * Used only to burn a constant-time password_verify() when the real hash is
 * missing/placeholder, so the failure path can't be timed apart from a genuine
 * wrong-password attempt.
 */
const CHAT_DUMMY_HASH = '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';

/**
 * True if the current session is authenticated as GRIT.
 */
function is_logged_in(): bool
{
    chat_session_start();
    return !empty($_SESSION['logged_in']) && ($_SESSION['user'] ?? null) === 'GRIT';
}

/**
 * Gate an endpoint: if not logged in, emit 401 JSON and stop.
 */
function require_login(): void
{
    if (!is_logged_in()) {
        if (!headers_sent()) {
            http_response_code(401);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode(['ok' => false, 'error' => 'Authentication required.']);
        exit;
    }
}

/**
 * Verify the password for user GRIT against the config bcrypt hash.
 * On success: regenerate the session id, mark logged in, issue a fresh CSRF
 * token, and return it. On failure: return null (caller decides the response).
 */
function login(string $password): ?string
{
    chat_session_start();
    $config = load_chat_config();

    $hash = (string) ($config['password_hash'] ?? '');

    // Refuse to authenticate against a placeholder / empty / non-bcrypt hash,
    // but still burn one constant-time verify so this path can't be timed apart
    // from a real wrong-password attempt.
    if ($hash === '' || strpos($hash, '$2') !== 0) {
        password_verify($password, CHAT_DUMMY_HASH);
        return null;
    }

    if (!password_verify($password, $hash)) {
        return null;
    }

    // Prevent session fixation: brand-new id on privilege change, and drop any
    // pre-auth throttle/lockout state now that the credentials checked out.
    session_regenerate_id(true);
    login_lockout_reset();

    $_SESSION['logged_in'] = true;
    $_SESSION['user']      = 'GRIT';

    return csrf_rotate();
}

/**
 * Destroy the current session completely.
 */
function logout(): void
{
    chat_session_start();

    $_SESSION = [];

    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(
            session_name(),
            '',
            [
                'expires'  => time() - 42000,
                'path'     => $params['path'],
                'httponly' => $params['httponly'] ?? true,
                'secure'   => $params['secure'] ?? false,
                'samesite' => $params['samesite'] ?? 'Lax',
            ]
        );
    }

    session_destroy();
}
