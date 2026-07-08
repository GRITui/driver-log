// mcp/claude-server.js — a built-in MCP server (stdio) exposing ONE tool:
//   ask_claude({ prompt }) -> spawns the local `claude` CLI in PRINT mode and
//   returns its text answer.
//
// This is the heavy tool-LLM (and vision) escape hatch. It is treated as
// running attacker-controlled prompt text, so it is heavily sandboxed:
//   - `claude -p` (print / non-interactive), NEVER --dangerously-skip-permissions.
//   - Tools locked off: no Bash/Edit/Write/Read/WebFetch/WebSearch/NotebookEdit.
//   - --permission-mode dontAsk so any tool the model does try is auto-denied
//     (it can't block on an interactive prompt either).
//   - Prompt passed via STDIN as data — never interpolated into a shell string
//     or into argv (spawn with an argv array, shell:false).
//   - Runs with cwd = a scratch dir, hard wall-clock timeout, and output caps.
//
// Config is passed in via env vars by the parent service (see brain.js), so the
// same file can be spawned standalone for testing.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CLAUDE_BIN = process.env.DRIVEE_CLAUDE_BIN || 'claude';
const CLAUDE_MODEL = process.env.DRIVEE_CLAUDE_MODEL || 'sonnet';
const TIMEOUT_MS = Number(process.env.DRIVEE_CLAUDE_TIMEOUT_MS || 120000);
const MAX_OUTPUT_BYTES = Number(process.env.DRIVEE_CLAUDE_MAX_OUTPUT_BYTES || 20000);
const MAX_PROMPT_CHARS = 16000;
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = Number(process.env.DRIVEE_CLAUDE_MAX_IMAGE_BYTES || 6 * 1024 * 1024);

// Media types we accept for vision, mapped to a file extension.
const MEDIA_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

// A scratch parent dir so the CLI never runs in the repo (kept OUTSIDE the repo
// tree, under the OS temp dir, so the CLI can never auto-read repo/CLAUDE.md
// files). Each request gets its own isolated subdir under this. Created if missing.
const SCRATCH_DIR =
  process.env.DRIVEE_CLAUDE_SCRATCH ||
  path.join(os.tmpdir(), 'drivee-claude-scratch');
try {
  fs.mkdirSync(SCRATCH_DIR, { recursive: true });
} catch { /* best effort */ }

// Tools we explicitly refuse to let the delegated model use. NOTE: `Read` is in
// this list for the text-only path (fully locked). For the IMAGE path we drop
// `Read` from here and instead ALLOW a narrowly-scoped `Read(./imgN.ext)` rule
// for exactly the decoded image file(s) — see runClaude().
const DISALLOWED_TEXT =
  'Bash Edit Write Read WebFetch WebSearch NotebookEdit Task';
const DISALLOWED_IMAGE =
  'Bash Edit Write WebFetch WebSearch NotebookEdit Task';

/**
 * Decode caller-supplied images into a fresh isolated working dir and build the
 * scoped Read allow-rules + a short prompt prefix pointing at them.
 * Returns { workdir, allowedTools, disallowed, promptPrefix }.
 * Throws (after cleaning up) on any malformed/oversized image.
 *
 * SECURITY: the workdir is a fresh empty subdir that holds ONLY the decoded
 * image files. Claude Code allows reads WITHIN its cwd by default, so the cwd
 * must never contain anything sensitive; reads OUTSIDE cwd are denied by
 * `--permission-mode dontAsk` (verified). Relative `Read(./imgN.ext)` rules are
 * used (not absolute) so a space in the parent path can't corrupt the argv.
 */
function prepareWorkdir(images) {
  const workdir = fs.mkdtempSync(path.join(SCRATCH_DIR, 'req-'));
  const cleanup = () => { try { fs.rmSync(workdir, { recursive: true, force: true }); } catch { /* ignore */ } };
  const imgs = Array.isArray(images) ? images.slice(0, MAX_IMAGES) : [];
  const readRules = [];
  const names = [];
  try {
    imgs.forEach((im, i) => {
      const mt = String(im?.media_type || '').toLowerCase();
      const ext = MEDIA_EXT[mt];
      if (!ext) throw new Error('unsupported image media_type');
      const buf = Buffer.from(String(im?.data || ''), 'base64');
      if (!buf.length) throw new Error('empty image');
      if (buf.length > MAX_IMAGE_BYTES) throw new Error('image too large');
      const fname = `img${i}.${ext}`;
      fs.writeFileSync(path.join(workdir, fname), buf, { mode: 0o600 });
      readRules.push(`Read(./${fname})`);
      names.push(`./${fname}`);
    });
  } catch (e) {
    cleanup();
    throw e;
  }
  const promptPrefix = readRules.length
    ? `You have ${readRules.length} image file(s) in your current directory: ` +
      `${names.join(', ')}. Use the Read tool to view each one, then answer the ` +
      `user's request below about them.\n\n`
    : '';
  return {
    workdir,
    cleanup,
    // Multiple rules joined with commas (no spaces) so it stays a single argv token.
    allowedTools: readRules.length ? readRules.join(',') : '',
    disallowed: readRules.length ? DISALLOWED_IMAGE : DISALLOWED_TEXT,
    promptPrefix,
  };
}

// Defense-in-depth: hand the spawned `claude` CLI a MINIMAL environment instead
// of the parent's full `process.env`. A hostile prompt that somehow induced tool
// use (already denied by --permission-mode dontAsk) then has no inherited secrets
// (API keys, tokens, DRIVEE_* config) to read out of the environment. We keep only
// what the CLI needs to run and to FIND ITS OWN STORED AUTH: PATH (locate binaries),
// HOME/USER/LOGNAME (macOS Keychain + ~/.claude config lookup), SHELL/TMPDIR, and
// locale. Anything the CLI genuinely needs but is missing here would surface as an
// auth failure in the live smoke test below.
function minimalEnv() {
  const keep = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'LC_CTYPE', 'LC_ALL'];
  const env = {};
  for (const k of keep) {
    if (process.env[k] !== undefined) env[k] = process.env[k];
  }
  // Allow explicit override of the CLI's config dir if the operator sets one,
  // without dragging in the rest of the environment.
  if (process.env.CLAUDE_CONFIG_DIR !== undefined) env.CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR;
  return env;
}

/**
 * Run `claude -p` with the given prompt on stdin. Resolves to { text } or
 * throws on failure/timeout. Fully non-interactive and sandboxed. If `images`
 * are supplied they are decoded to an isolated cwd and exposed via a scoped
 * Read allow-rule so the model can actually SEE them.
 */
function runClaude(prompt, images) {
  return new Promise((resolve, reject) => {
    let prep;
    try {
      prep = prepareWorkdir(images);
    } catch (e) {
      return reject(new Error('image decode failed: ' + e.message));
    }
    const { workdir, cleanup, allowedTools, disallowed, promptPrefix } = prep;

    const fullPrompt = (promptPrefix + prompt).slice(0, MAX_PROMPT_CHARS + promptPrefix.length);

    const args = [
      '-p',
      '--model', CLAUDE_MODEL,
      '--output-format', 'json',
      '--permission-mode', 'dontAsk',
      '--allowedTools', allowedTools,
      '--disallowedTools', disallowed,
    ];

    const child = spawn(CLAUDE_BIN, args, {
      cwd: workdir,
      shell: false, // never a shell — args are a literal argv array
      stdio: ['pipe', 'pipe', 'pipe'],
      env: minimalEnv(),
    });

    let out = Buffer.alloc(0);
    let err = '';
    let done = false;
    let truncated = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      cleanup();
      reject(new Error('claude CLI timed out'));
    }, TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      if (out.length < MAX_OUTPUT_BYTES * 4) {
        out = Buffer.concat([out, chunk]);
      } else {
        truncated = true;
      }
    });
    child.stderr.on('data', (c) => { if (err.length < 4000) err += c.toString(); });

    child.on('error', (e) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cleanup();
      reject(new Error('failed to launch claude CLI: ' + e.message));
    });

    child.on('close', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cleanup();
      const raw = out.toString('utf8');
      // --output-format json => a single JSON object with a `result` field.
      let text = '';
      try {
        const j = JSON.parse(raw);
        if (j && typeof j.result === 'string') text = j.result;
        else if (j && j.is_error) return reject(new Error('claude CLI returned an error result'));
        else text = raw;
      } catch {
        text = raw; // fall back to raw stdout if not JSON
      }
      if (code !== 0 && !text) {
        return reject(new Error(`claude CLI exited ${code}`));
      }
      if (truncated) text += '\n\n[output truncated]';
      if (text.length > MAX_OUTPUT_BYTES) {
        text = text.slice(0, MAX_OUTPUT_BYTES) + '\n\n[output truncated]';
      }
      resolve({ text: text.trim() || '(the assistant returned no text)' });
    });

    // Feed the (prefixed) prompt as data on stdin, then close it.
    child.stdin.write(fullPrompt, 'utf8');
    child.stdin.end();
  });
}

export function buildClaudeMcpServer() {
  const server = new McpServer({ name: 'drivee-claude', version: '0.1.0' });

  server.registerTool(
    'ask_claude',
    {
      description:
        'Delegate a hard question (complex reasoning, coding, math, planning, ' +
        'or anything involving an image) to a stronger assistant. Returns its ' +
        'text answer. Optional `images` (base64) are shown to the vision model.',
      inputSchema: {
        prompt: z.string().min(1).max(MAX_PROMPT_CHARS),
        images: z
          .array(z.object({ media_type: z.string(), data: z.string() }))
          .max(MAX_IMAGES)
          .optional(),
      },
    },
    async ({ prompt, images }) => {
      const clean = String(prompt || '').slice(0, MAX_PROMPT_CHARS);
      if (!clean.trim() && !(Array.isArray(images) && images.length)) {
        return { content: [{ type: 'text', text: '(empty prompt)' }], isError: true };
      }
      try {
        const { text } = await runClaude(clean || 'Describe the attached image(s).', images);
        return { content: [{ type: 'text', text }] };
      } catch (e) {
        return {
          content: [{ type: 'text', text: 'ask_claude failed: ' + e.message }],
          isError: true,
        };
      }
    }
  );

  return server;
}

// Allow running standalone: `node mcp/claude-server.js` speaks MCP over stdio.
// Compare via pathToFileURL so paths with spaces (e.g. "Driver Log") still match.
const isEntry =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
  const server = buildClaudeMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Keep the process alive; stdio transport handles the rest.
}
