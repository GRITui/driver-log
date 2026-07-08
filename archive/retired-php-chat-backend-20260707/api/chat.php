<?php
/**
 * POST /chat/api/chat.php
 *
 * The login-gated chat proxy. Order of operations (reject BEFORE any upstream
 * call): start session -> require_login (401) -> verify X-CSRF-Token header
 * (403) -> per-session rate limit (429) -> parse JSON body -> forward to the
 * Anthropic Messages API (via lib/anthropic.php) -> extract assistant text.
 *
 * Body:    {messages: [{role, content}, ...], system?: "<optional>"}
 * Success: 200 {ok:true, reply:"<assistant text>"}
 * Failure: {ok:false, error:"<generic>", code:<int>}  — never leaks the API
 *          key, request headers, or a stack trace.
 */

require_once __DIR__ . '/../lib/config.php';
require_once __DIR__ . '/../lib/session.php';
require_once __DIR__ . '/../lib/auth.php';
require_once __DIR__ . '/../lib/csrf.php';
require_once __DIR__ . '/../lib/ratelimit.php';
require_once __DIR__ . '/../lib/anthropic.php';

// Input caps (senior hardening) — bound memory, token spend, and upstream cost.
// SHARED-HOSTING POLICY: the client downscales every image to a ~1568px long
// edge and re-encodes to JPEG before upload (see chat.js), so a typical photo
// arrives as a few hundred KB. That lets us keep a MODEST body ceiling that the
// host's own post_max_size / memory_limit can comfortably allow (see
// docs/chat-deploy-notes.md) instead of a multi-tens-of-MB cap that would be
// rejected before our PHP runs — or that would invite a memory-exhaustion DoS.
// All per-image / total size caps below are counted on the DECODED bytes, not
// on the inflated base64 length. The text-only path is unaffected — a plain
// string is still bounded by CHAT_MAX_CONTENT_CHARS.
const CHAT_MAX_BODY_BYTES          = 12582912; // 12 MB raw JSON ceiling (fits ~4 downscaled images + history)
const CHAT_MAX_MESSAGES            = 50;       // conversation-length ceiling
const CHAT_MAX_CONTENT_CHARS       = 20000;    // per text block / string-content ceiling
const CHAT_MAX_IMAGE_B64_BYTES     = 6291456;  // 6 MB base64/img — cheap pre-decode guard (bounds decode work)
const CHAT_MAX_IMAGE_DECODED_BYTES = 4194304;  // 4 MB per image, counted on DECODED bytes
const CHAT_MAX_TOTAL_DECODED_BYTES = 8388608;  // 8 MB decoded across the whole request
const CHAT_MAX_IMAGES_MSG          = 4;        // images per single message
const CHAT_MAX_IMAGES_TOTAL        = 20;       // images across the whole conversation
// Media types accepted in image blocks (mirrors the client-side guard).
const CHAT_ALLOWED_MEDIA = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/**
 * Media-type integrity: verify the decoded image's MAGIC BYTES match the
 * client-declared media_type. The client label is never trusted — a PNG blob
 * sent as image/jpeg, or a non-image payload, is rejected. Keep in sync with
 * CHAT_ALLOWED_MEDIA.
 */
function chat_image_magic_ok(string $bytes, string $mediaType): bool
{
    $len = strlen($bytes);
    switch ($mediaType) {
        case 'image/png':
            return $len >= 8 && substr($bytes, 0, 8) === "\x89PNG\r\n\x1a\n";
        case 'image/jpeg':
            return $len >= 3 && substr($bytes, 0, 3) === "\xFF\xD8\xFF";
        case 'image/gif':
            return $len >= 6 && (substr($bytes, 0, 6) === 'GIF87a' || substr($bytes, 0, 6) === 'GIF89a');
        case 'image/webp':
            return $len >= 12 && substr($bytes, 0, 4) === 'RIFF' && substr($bytes, 8, 4) === 'WEBP';
        default:
            return false;
    }
}

chat_session_start();
header('Content-Type: application/json; charset=utf-8');

// Only POST.
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    echo json_encode(['ok' => false, 'error' => 'Method not allowed.', 'code' => 405]);
    exit;
}

// 1. Authentication — emits 401 JSON and exits if there is no valid session.
require_login();

// 2. CSRF — the chat POST must carry the session's token in the X-CSRF-Token
//    header. Constant-time comparison inside csrf_verify().
$token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
if (!is_string($token) || !csrf_verify($token)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Invalid CSRF token.', 'code' => 403]);
    exit;
}

// 3. Per-session rate limit — caps how fast a single (possibly leaked) session
//    can burn tokens. Emits 429 JSON and exits when exceeded.
$config = load_chat_config();
rate_limit_enforce(
    (int) ($config['rate_limit_max'] ?? 30),
    (int) ($config['rate_limit_window'] ?? 60),
    'chat'
);

// 4. Parse + validate the JSON body.
// Bound the php://input read to (cap + 1) bytes so a client streaming a huge
// body can't force us to buffer it all in memory before we reject it. Reading
// one byte past the cap is enough to detect an over-limit payload.
$rawBody = file_get_contents('php://input', false, null, 0, CHAT_MAX_BODY_BYTES + 1);

// Cap the raw payload size BEFORE decoding — bounds memory + upstream cost.
if (is_string($rawBody) && strlen($rawBody) > CHAT_MAX_BODY_BYTES) {
    http_response_code(413);
    echo json_encode(['ok' => false, 'error' => 'Request is too large.', 'code' => 413]);
    exit;
}

$input = ($rawBody === false || $rawBody === '') ? null : json_decode($rawBody, true);

if (!is_array($input) || !isset($input['messages']) || !is_array($input['messages'])) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid request body.', 'code' => 400]);
    exit;
}

// Cap conversation length before iterating.
if (count($input['messages']) > CHAT_MAX_MESSAGES) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Too many messages in the conversation.', 'code' => 400]);
    exit;
}

// Whitelist roles + validate content. `content` may be EITHER a non-empty
// string (text-only path — unchanged) OR an ARRAY of blocks, where each block is
// {type:"text",text:string} or {type:"image",source:{type:"base64",
// media_type ∈ whitelist, data:base64}}. Skip malformed/empty entries; reject
// (clean 400) anything over a cap or of an unknown shape. Blocks are rebuilt
// from scratch so only known keys reach the wire.
$fail400 = function (string $msg): void {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => $msg, 'code' => 400]);
    exit;
};

$messages = [];
$imagesTotal = 0;
$decodedTotal = 0;
foreach ($input['messages'] as $m) {
    if (!is_array($m)) {
        continue;
    }
    $role    = $m['role'] ?? '';
    $content = $m['content'] ?? '';
    if ($role !== 'user' && $role !== 'assistant') {
        continue;
    }

    // --- text-only path (backward compatible) ---
    if (is_string($content)) {
        if ($content === '') {
            continue;
        }
        if (strlen($content) > CHAT_MAX_CONTENT_CHARS) {
            $fail400('A message is too long.');
        }
        $messages[] = ['role' => $role, 'content' => $content];
        continue;
    }

    // --- multimodal path: an array of text/image blocks ---
    if (is_array($content)) {
        $blocks = [];
        $imgInMsg = 0;
        foreach ($content as $block) {
            if (!is_array($block)) {
                $fail400('Invalid message content.');
            }
            $type = $block['type'] ?? '';

            if ($type === 'text') {
                $text = $block['text'] ?? '';
                if (!is_string($text)) {
                    $fail400('Invalid message content.');
                }
                if ($text === '') {
                    continue;   // drop empty text blocks
                }
                if (strlen($text) > CHAT_MAX_CONTENT_CHARS) {
                    $fail400('A message is too long.');
                }
                $blocks[] = ['type' => 'text', 'text' => $text];
                continue;
            }

            if ($type === 'image') {
                $source = $block['source'] ?? null;
                if (!is_array($source) || ($source['type'] ?? '') !== 'base64') {
                    $fail400('Invalid image attachment.');
                }
                $mediaType = $source['media_type'] ?? '';
                if (!is_string($mediaType) || !in_array($mediaType, CHAT_ALLOWED_MEDIA, true)) {
                    $fail400('Unsupported image type.');
                }
                $data = $source['data'] ?? '';
                if (!is_string($data) || $data === '') {
                    $fail400('Invalid image attachment.');
                }
                // Cheap pre-decode guard: reject an oversized base64 blob BEFORE
                // spending memory/CPU decoding it (reject-early, 413).
                if (strlen($data) > CHAT_MAX_IMAGE_B64_BYTES) {
                    http_response_code(413);
                    echo json_encode(['ok' => false, 'error' => 'An image is too large.', 'code' => 413]);
                    exit;
                }
                // Base64 charset guard (alphabet + padding + optional whitespace).
                if (!preg_match('#^[A-Za-z0-9+/=\r\n\t ]+$#', $data)) {
                    $fail400('Invalid image data.');
                }
                // Strict decode catches malformed base64 the charset check can't
                // (bad padding, stray '=' mid-string). Whitespace is stripped
                // first so strict mode doesn't reject clean-but-wrapped input.
                $decoded = base64_decode(preg_replace('/\s+/', '', $data), true);
                if ($decoded === false || $decoded === '') {
                    $fail400('Invalid image data.');
                }
                // Enforce size caps on the DECODED bytes — the real memory /
                // upstream cost, not the ~4/3-inflated base64 length.
                $decodedLen = strlen($decoded);
                if ($decodedLen > CHAT_MAX_IMAGE_DECODED_BYTES) {
                    http_response_code(413);
                    echo json_encode(['ok' => false, 'error' => 'An image is too large.', 'code' => 413]);
                    exit;
                }
                $decodedTotal += $decodedLen;
                if ($decodedTotal > CHAT_MAX_TOTAL_DECODED_BYTES) {
                    http_response_code(413);
                    echo json_encode(['ok' => false, 'error' => 'Attached images are too large in total.', 'code' => 413]);
                    exit;
                }
                // Media-type integrity: the decoded bytes' magic number must
                // match the declared media_type. Never trust the client label.
                if (!chat_image_magic_ok($decoded, $mediaType)) {
                    $fail400('Image data does not match its declared type.');
                }
                if (++$imgInMsg > CHAT_MAX_IMAGES_MSG || ++$imagesTotal > CHAT_MAX_IMAGES_TOTAL) {
                    $fail400('Too many images attached.');
                }
                // Forward canonical, whitespace-free base64 (re-encoded from the
                // bytes we validated) so only clean data reaches the wire.
                $blocks[] = [
                    'type'   => 'image',
                    'source' => ['type' => 'base64', 'media_type' => $mediaType, 'data' => base64_encode($decoded)],
                ];
                continue;
            }

            // Any other block type is rejected.
            $fail400('Invalid message content.');
        }

        if ($blocks === []) {
            continue;   // no usable blocks -> treat like an empty message
        }
        $messages[] = ['role' => $role, 'content' => $blocks];
        continue;
    }

    // content is neither string nor array -> skip this entry.
}

if ($messages === []) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'No valid messages provided.', 'code' => 400]);
    exit;
}

// The Messages API requires the first message to be from the user.
if (($messages[0]['role'] ?? '') !== 'user') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Conversation must start with a user message.', 'code' => 400]);
    exit;
}

$system = (isset($input['system']) && is_string($input['system']) && $input['system'] !== '')
    ? $input['system']
    : null;

// 5. Forward to Anthropic.
$result = anthropic_send($config, $messages, $system);

if (empty($result['ok'])) {
    $upstream = (int) ($result['code'] ?? 502);
    // Keep the true status in the JSON `code` for the client to react to, but
    // send a SAFE HTTP status: 429 passes through (backoff), our own 500 stays a
    // 500, and any other upstream 4xx/5xx is normalized to 502 so a browser
    // never misreads an upstream 401/400 as being about the user's own session.
    if ($upstream === 429) {
        $httpCode = 429;
    } elseif ($upstream === 500) {
        $httpCode = 500;
    } else {
        $httpCode = 502;
    }
    http_response_code($httpCode);
    echo json_encode([
        'ok'    => false,
        'error' => (string) ($result['error'] ?? 'Upstream error.'),
        'code'  => $upstream,
    ]);
    exit;
}

$reply = anthropic_extract_text($result['data']);
if ($reply === '') {
    // Graceful fallback for empty content (e.g. a non-text stop_reason) so the
    // UI never renders a blank assistant bubble.
    $reply = '(No response text was returned.)';
}

echo json_encode(['ok' => true, 'reply' => $reply]);
