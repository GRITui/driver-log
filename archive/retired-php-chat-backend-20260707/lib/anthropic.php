<?php
/**
 * Thin Anthropic (Claude) Messages API client.
 *
 * The ONLY place the outbound call to Anthropic is made. It receives the config
 * (from lib/config.php — which reads the API key from ABOVE the web root), a
 * validated `messages` array, and an optional system prompt, then POSTs to the
 * Messages API and returns a normalized result array.
 *
 * Model id + API version come from the claude-api reference:
 *   - default model:      claude-opus-4-8  (config may override via 'model')
 *   - anthropic-version:  2023-06-01
 *   - headers:            x-api-key, anthropic-version, content-type
 *
 * VISION NOTE: image (multimodal) messages require a VISION-CAPABLE model. The
 * default claude-opus-4-8 is vision-capable; if the above-root config overrides
 * 'model' with a text-only model, image requests fail upstream with a 400 and
 * the proxy surfaces a generic "could not process" error (the client adds a
 * vision-specific hint when images were attached). See docs/chat-deploy-notes.md.
 *
 * TLS certificate verification is ON (never disabled).
 *
 * Return shape (never leaks the key, request headers, or a stack trace):
 *   success:  ['ok' => true,  'data' => <decoded Messages API response array>]
 *   failure:  ['ok' => false, 'error' => '<generic message>', 'code' => <int>]
 */

/** Fallback model id if config does not provide one (see claude-api skill). */
const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-4-8';

/** Messages API version header value (see claude-api skill). */
const ANTHROPIC_API_VERSION = '2023-06-01';

/**
 * Beta header value for the built-in MCP connector (remote url-based servers).
 * Sent ONLY when config supplies at least one WELL-FORMED 'mcp_servers' entry;
 * when MCP is off (or every entry is malformed) the request is byte-identical
 * to the reviewed non-MCP path. (see claude-api skill)
 */
const ANTHROPIC_MCP_BETA = 'mcp-client-2025-11-20';

/**
 * Hard cap on the number of MCP servers forwarded per request. Bounds request
 * size / tool surface so a config mistake can't attach an unbounded server list.
 * (The Messages API itself caps mcp_servers at 20; we stay well under.)
 */
const ANTHROPIC_MCP_MAX_SERVERS = 8;

/**
 * Hard ceiling on max_tokens regardless of config — bounds per-request cost so a
 * config typo (or a future editable setting) can't request a huge generation.
 */
const ANTHROPIC_MAX_TOKENS_CEILING = 4096;

/**
 * Server-side default system prompt used when the caller supplies none. Bounds
 * the assistant's behavior/persona and keeps replies on-topic for DriverLog.
 */
const ANTHROPIC_DEFAULT_SYSTEM = 'You are Drivee, a concise, helpful assistant embedded in DriverLog, '
    . 'a tool that helps on-demand drivers track earnings, fuel, and whether a shift was '
    . 'profitable. Answer clearly and practically.';

/**
 * Send a chat completion request to the Anthropic Messages API.
 *
 * @param array       $config   Result of load_chat_config().
 * @param array       $messages List of {role, content} maps (already validated).
 * @param string|null $system   Optional system prompt.
 * @return array{ok:bool, data?:array, error?:string, code?:int}
 */
function anthropic_send(array $config, array $messages, ?string $system = null): array
{
    $apiKey    = (string) ($config['anthropic_api_key'] ?? '');
    $model     = (string) ($config['model'] ?? '');
    $maxTokens = (int) ($config['max_tokens'] ?? 0);

    if ($model === '')     { $model = ANTHROPIC_DEFAULT_MODEL; }
    if ($maxTokens <= 0)   { $maxTokens = 1024; }
    if ($maxTokens > ANTHROPIC_MAX_TOKENS_CEILING) { $maxTokens = ANTHROPIC_MAX_TOKENS_CEILING; }

    // The key must come from the above-root config; never hardcoded, never empty.
    if ($apiKey === '') {
        return ['ok' => false, 'error' => 'Server configuration is incomplete.', 'code' => 500];
    }

    // Always send a system prompt (caller-provided or the server default) so the
    // assistant is bounded even when the client omits one.
    if ($system === null || $system === '') {
        $system = ANTHROPIC_DEFAULT_SYSTEM;
    }

    $body = [
        'model'      => $model,
        'max_tokens' => $maxTokens,
        'system'     => $system,
        'messages'   => array_values($messages),
    ];

    // Optional built-in MCP connector. Sanitize the configured server list
    // (drop malformed/duplicate/non-https entries, cap the count) and enable
    // MCP only if at least one VALID server survives. When MCP is off — unset,
    // empty, or every entry rejected — we attach nothing and the request body
    // and headers are byte-identical to the reviewed non-MCP path (no
    // 'mcp_servers', no 'tools', no beta header). No regression.
    $rawMcpServers = $config['mcp_servers'] ?? [];
    $mcpServers = is_array($rawMcpServers)
        ? anthropic_sanitize_mcp_servers($rawMcpServers)
        : [];
    $mcpEnabled = $mcpServers !== [];
    if ($mcpEnabled) {
        // The connector requires BOTH the server list AND a paired
        // `mcp_toolset` tools entry per server — omitting the toolset is a
        // validation error (confirmed via the claude-api skill / Messages API
        // MCP connector docs). Derive the toolset entries automatically from
        // the configured server names so the above-root config stays a simple
        // server list and the two halves can never drift out of sync.
        $body['mcp_servers'] = $mcpServers;

        $tools = [];
        foreach ($mcpServers as $server) {
            $tools[] = [
                'type'            => 'mcp_toolset',
                'mcp_server_name' => $server['name'],
            ];
        }
        $body['tools'] = $tools;
    }

    $payload = json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($payload === false) {
        return ['ok' => false, 'error' => 'Failed to encode request.', 'code' => 500];
    }

    if (!function_exists('curl_init')) {
        return ['ok' => false, 'error' => 'Server is missing a required extension.', 'code' => 500];
    }

    $ch = curl_init('https://api.anthropic.com/v1/messages');
    if ($ch === false) {
        return ['ok' => false, 'error' => 'Upstream request failed.', 'code' => 502];
    }

    $headers = [
        'content-type: application/json',
        'x-api-key: ' . $apiKey,
        'anthropic-version: ' . ANTHROPIC_API_VERSION,
    ];
    // Beta opt-in for the MCP connector — added only when MCP servers are set,
    // so a request with MCP off carries exactly the headers it did before.
    if ($mcpEnabled) {
        $headers[] = 'anthropic-beta: ' . ANTHROPIC_MCP_BETA;
    }

    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => $headers,
        // TLS verification ON — do not disable.
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_TIMEOUT        => 120,
        CURLOPT_CONNECTTIMEOUT => 15,
    ]);

    $raw    = curl_exec($ch);
    $errno  = curl_errno($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    // Transport-level failure (DNS, TLS, timeout). Log a code server-side only;
    // never echo curl_error() to the client (may contain internal detail).
    if ($raw === false || $errno !== 0) {
        error_log('anthropic proxy transport error: curl errno ' . $errno);
        return ['ok' => false, 'error' => 'Upstream request failed.', 'code' => 502];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return ['ok' => false, 'error' => 'Invalid upstream response.', 'code' => 502];
    }

    // Non-2xx from Anthropic (auth error, rate limit, bad request, 5xx, ...).
    // Do NOT forward the upstream error body verbatim — it can echo request
    // details. Return a generic message + a safe HTTP code; log the status.
    if ($status < 200 || $status >= 300) {
        error_log('anthropic proxy upstream HTTP ' . $status);
        if ($status === 429) {
            $msg = 'The assistant is busy right now. Please wait a moment and try again.';
        } elseif ($status >= 500) {
            $msg = 'The assistant is temporarily unavailable.';
        } else {
            $msg = 'The assistant could not process that request.';
        }
        // Preserve the upstream status in `code` for the caller to react to
        // (e.g. back off on 429); the message stays generic and leaks nothing.
        return ['ok' => false, 'error' => $msg, 'code' => $status];
    }

    return ['ok' => true, 'data' => $decoded];
}

/**
 * Validate + normalize the configured MCP server list before it is sent to the
 * Anthropic MCP connector. Defensive: config lives above the web root and is
 * trusted, but a typo must degrade safely (skip the entry) rather than produce
 * a malformed request or, worse, an unintended outbound https target.
 *
 * Each accepted entry is rebuilt from scratch (never passed through verbatim)
 * so only known keys reach the wire:
 *   - type: forced to 'url' (the only connector transport this host supports).
 *   - url:  MUST be a well-formed HTTPS url (http/other schemes are rejected —
 *           the bearer token below would otherwise be forwarded in cleartext).
 *   - name: MUST be a short [A-Za-z0-9_-] token; it is echoed verbatim into the
 *           derived `mcp_toolset` entry, so restrict the charset. Duplicate
 *           names are dropped (each server maps to exactly one toolset).
 *   - authorization_token: OPTIONAL bearer, copied only if a non-empty string.
 *           It comes from the above-root config, is forwarded to Anthropic for
 *           the connector handshake, and is NEVER logged or returned to the
 *           browser (this function does not log; callers must not echo the body).
 *
 * Entries past ANTHROPIC_MCP_MAX_SERVERS are ignored. Returns a 0-indexed list
 * of clean server maps (possibly empty — caller treats empty as "MCP off").
 *
 * @param array $servers Raw 'mcp_servers' value from config (already an array).
 * @return array<int, array{type:string,url:string,name:string,authorization_token?:string}>
 */
function anthropic_sanitize_mcp_servers(array $servers): array
{
    $clean = [];
    $seenNames = [];

    foreach ($servers as $server) {
        if (count($clean) >= ANTHROPIC_MCP_MAX_SERVERS) {
            break;
        }
        if (!is_array($server)) {
            continue;
        }

        $type = (string) ($server['type'] ?? '');
        $url  = (string) ($server['url'] ?? '');
        $name = (string) ($server['name'] ?? '');

        // type: only remote url-based servers are supported on shared hosting.
        if ($type !== 'url') {
            continue;
        }
        // name: required, restricted charset, unique across the list.
        if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $name)) {
            continue;
        }
        if (isset($seenNames[$name])) {
            continue;
        }
        // url: required, HTTPS-only, well-formed.
        if (stripos($url, 'https://') !== 0) {
            continue;
        }
        if (filter_var($url, FILTER_VALIDATE_URL) === false) {
            continue;
        }

        $entry = [
            'type' => 'url',
            'url'  => $url,
            'name' => $name,
        ];

        // Optional per-server bearer token — server-side secret, never logged.
        $token = $server['authorization_token'] ?? null;
        if (is_string($token) && $token !== '') {
            $entry['authorization_token'] = $token;
        }

        $seenNames[$name] = true;
        $clean[] = $entry;
    }

    return $clean;
}

/**
 * Concatenate the text from a Messages API response's content[] blocks.
 * Ignores non-text blocks defensively — thinking, tool_use, and the MCP
 * connector's `mcp_tool_use` / `mcp_tool_result` blocks are all skipped, so
 * only the model's final assistant `text` is returned even when MCP tools ran.
 *
 * @param array $response Decoded Messages API response (the 'data' value above).
 */
function anthropic_extract_text(array $response): string
{
    $out = '';
    $content = $response['content'] ?? null;
    if (is_array($content)) {
        foreach ($content as $block) {
            if (
                is_array($block)
                && ($block['type'] ?? '') === 'text'
                && isset($block['text'])
                && is_string($block['text'])
            ) {
                $out .= $block['text'];
            }
        }
    }
    return $out;
}
