<?php
/**
 * Config loader.
 *
 * Reads the REAL secret config that lives ABOVE the web root, one level above
 * the "Driver Log" project:  <project-parent>/driverlog-chat-secret/config.php
 *
 * This file is at:            site/chat/lib/config.php
 * Web root (site/) is:        ../../         from here
 * Project root is:            ../../../       from here
 * Secret dir is a sibling of the project root:
 *                             ../../../../driverlog-chat-secret/config.php
 *
 * Returns the config array. Fails SAFE if the file is missing or malformed:
 * emits a generic error, never echoes any secret, and stops execution.
 */

function load_chat_config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }

    // Default: sibling of the project root (see path map above). On Hostinger
    // the deployed directory depth can differ, so allow an absolute override
    // via the DRIVERLOG_CHAT_CONFIG env var (set it in the panel / .htaccess
    // SetEnv if the relative path does not resolve on the live host).
    $override = getenv('DRIVERLOG_CHAT_CONFIG');
    $path = ($override !== false && $override !== '')
        ? $override
        : __DIR__ . '/../../../../driverlog-chat-secret/config.php';

    if (!is_file($path) || !is_readable($path)) {
        chat_config_fail('Server configuration is missing. Copy config.example.php to config.php above the web root.');
    }

    $loaded = require $path;

    if (!is_array($loaded)) {
        chat_config_fail('Server configuration is invalid.');
    }

    // Minimum required keys for auth to function. Do not print their values.
    $required = ['anthropic_api_key', 'password_hash', 'allowed_user'];
    foreach ($required as $key) {
        if (!isset($loaded[$key]) || $loaded[$key] === '') {
            chat_config_fail('Server configuration is incomplete.');
        }
    }

    // Defaults for optional keys so callers can rely on them.
    // 'mcp_servers' defaults to [] (MCP off); when set it must be a list of
    // remote url-based server definitions (see config.example.php).
    $loaded += [
        'rate_limit_max'    => 30,
        'rate_limit_window' => 60,
        'model'             => 'claude-opus-4-8',
        'max_tokens'        => 1024,
        'mcp_servers'       => [],
    ];

    $config = $loaded;
    return $config;
}

/**
 * Fail safe: never leak secrets. Send a generic JSON error and stop.
 */
function chat_config_fail(string $message): void
{
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode(['ok' => false, 'error' => $message]);
    exit;
}
