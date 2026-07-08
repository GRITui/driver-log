<?php
/**
 * Hardened PHP session startup.
 *
 * Cookie params: httponly + secure + samesite=Lax so the session id is not
 * readable from JS, only sent over HTTPS, and not sent on cross-site requests.
 * Call chat_session_start() before touching $_SESSION anywhere.
 */

function chat_session_start(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    // Only accept the session id from the cookie (not the URL).
    if (function_exists('ini_set')) {
        ini_set('session.use_only_cookies', '1');
        ini_set('session.use_strict_mode', '1');
    }

    // "secure" is true when the request is HTTPS. On the Hostinger host the
    // site is served over HTTPS; behind LiteSpeed's proxy we must honor the
    // forwarded-proto headers so we never ship an insecure cookie on a real
    // HTTPS request.
    $secure = chat_request_is_https();

    session_name('DRIVERLOG_CHAT');
    session_set_cookie_params([
        'lifetime' => 0,        // session cookie (expires when browser closes)
        'path'     => '/chat/',
        'httponly' => true,
        'secure'   => $secure,
        'samesite' => 'Lax',
    ]);

    session_start();
}

/**
 * Robust HTTPS detection for a shared host behind LiteSpeed's proxy.
 *
 * Returns true only when we can positively confirm the request arrived over
 * TLS. We never let a client *downgrade* us: the direct HTTPS server var and
 * the proxy-set forwarded headers are what LiteSpeed/Hostinger populate, and a
 * remote client cannot strip a header the reverse proxy adds. The result is
 * used solely to decide the cookie "secure" flag, so false-positives would only
 * ever harden (a secure cookie), never weaken.
 */
function chat_request_is_https(): bool
{
    // Direct TLS termination (LiteSpeed sets HTTPS=on).
    if (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') {
        return true;
    }

    // Proxy: X-Forwarded-Proto may be a single value ("https") or a list
    // ("https, http") — treat it as HTTPS if the first/any hop was https.
    $xfp = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
    if ($xfp !== '') {
        foreach (explode(',', $xfp) as $proto) {
            if (trim($proto) === 'https') {
                return true;
            }
        }
    }

    // Some proxies use X-Forwarded-SSL: on instead.
    if (strtolower((string) ($_SERVER['HTTP_X_FORWARDED_SSL'] ?? '')) === 'on') {
        return true;
    }

    // Last resort: standard HTTPS port.
    if ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443) {
        return true;
    }

    return false;
}
