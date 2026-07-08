// brain.js — the orchestrator loop.
//
// Phi-4-mini (via Ollama) is the router + small-talk brain. For each turn it
// decides, as strict JSON, whether to ANSWER itself or DELEGATE to the
// `ask_claude` MCP tool (which shells to the heavy local claude CLI).
//
// WHY JSON-decision instead of native tool calls: tested live against Ollama
// phi4-mini — it does NOT emit real `tool_calls` (even when forced it writes
// the call as plain text like `ask_claude({"prompt": ...})`). So we drive it
// with a constrained JSON-decision prompt (`format: "json"`) and parse it. This
// is the documented fallback path from the task brief, promoted to primary.
//
// Deterministic rules layered on top of phi4's decision:
//   - Any message containing an IMAGE always delegates (phi4 is not vision-capable).
//   - Obvious hard turns (code fences / very long) delegate even if phi4 says
//     "answer" — phi4 tends to UNDER-delegate hard prompts.
// The tool loop is bounded by max_hops.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PERSONA =
  'You are Drivee, a warm, upbeat assistant and a friend to all drivers. ' +
  'You speak plainly and kindly, keep drivers safe, and cheer them on.';

const ROUTER_PROMPT =
  PERSONA + '\n\n' +
  'You are also a ROUTER. Look at the latest user message and reply with ONLY ' +
  'a single JSON object, nothing else:\n' +
  '  {"action":"answer","text":"<your friendly Drivee reply>"}\n' +
  'OR\n' +
  '  {"action":"delegate","text":"<the user request, restated clearly>"}\n\n' +
  'Choose "answer" ONLY for greetings, small talk, thanks, and simple factual ' +
  'one-liners you are certain about — put your friendly reply in "text".\n' +
  'Choose "delegate" for ANYTHING involving code/programming, math, multi-step ' +
  'reasoning, planning, analysis, long writing, or that you are unsure about — ' +
  'put the user request in "text".\n\n' +
  'Examples:\n' +
  'User: hi there -> {"action":"answer","text":"Hey there, friend! How is the road treating you today?"}\n' +
  'User: thanks -> {"action":"answer","text":"Anytime! Drive safe out there."}\n' +
  'User: write a python quicksort and explain big-O -> {"action":"delegate","text":"Write a python quicksort and explain its time complexity."}\n' +
  'User: plan a fuel-efficient route across 5 cities -> {"action":"delegate","text":"Plan a fuel-efficient driving route across 5 cities."}';

/** Extract base64 image blocks from a message's content array. */
export function extractImages(content) {
  if (!Array.isArray(content)) return [];
  const out = [];
  for (const b of content) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'image' && b.source && b.source.type === 'base64' &&
        typeof b.source.data === 'string') {
      out.push({ media_type: String(b.source.media_type || 'image/png'), data: b.source.data });
    } else if (b.type === 'image_url' && b.image_url && typeof b.image_url.url === 'string') {
      const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(b.image_url.url);
      if (m) out.push({ media_type: m[1].toLowerCase(), data: m[2] });
    }
  }
  return out;
}

/** Flatten a message's content (string OR array of blocks) into text + image info. */
export function flattenContent(content) {
  if (typeof content === 'string') return { text: content, imageCount: 0 };
  if (Array.isArray(content)) {
    let text = '';
    let imageCount = 0;
    for (const b of content) {
      if (!b || typeof b !== 'object') continue;
      if (b.type === 'text' && typeof b.text === 'string') text += (text ? '\n' : '') + b.text;
      else if (b.type === 'image' || b.type === 'image_url') imageCount += 1;
    }
    return { text, imageCount };
  }
  return { text: '', imageCount: 0 };
}

function looksHard(text) {
  if (!text) return false;
  if (text.includes('```')) return true;
  if (text.length > 800) return true;
  return false;
}

/** Safe JSON extraction from a model string that should be a JSON object. */
function parseDecision(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  // Strip code fences if present.
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const obj = JSON.parse(s.slice(start, end + 1));
    if (obj && (obj.action === 'answer' || obj.action === 'delegate')) {
      return { action: obj.action, text: typeof obj.text === 'string' ? obj.text : '' };
    }
  } catch { /* fall through */ }
  return null;
}

export function createBrain(config) {
  const ollamaUrl = config.ollama_url || 'http://127.0.0.1:11434';
  const model = config.ollama_model || 'phi4-mini';
  const maxHops = config.max_hops ?? 3;

  let client = null;

  async function connect() {
    if (client) return client;
    const transport = new StdioClientTransport({
      command: process.execPath, // node
      args: [path.join(__dirname, 'mcp', 'claude-server.js')],
      env: {
        ...process.env,
        DRIVEE_CLAUDE_BIN: config.claude_bin || 'claude',
        DRIVEE_CLAUDE_MODEL: config.claude_model || 'sonnet',
        DRIVEE_CLAUDE_TIMEOUT_MS: String(config.claude_timeout_ms || 120000),
        DRIVEE_CLAUDE_MAX_OUTPUT_BYTES: String(config.claude_max_output_bytes || 20000),
        DRIVEE_CLAUDE_MAX_IMAGE_BYTES: String(config.claude_max_image_bytes || 6 * 1024 * 1024),
      },
    });
    const c = new Client({ name: 'drivee-brain', version: '0.1.0' });
    await c.connect(transport);
    client = c;
    return client;
  }

  async function askClaude(prompt, images) {
    const args = { prompt };
    if (Array.isArray(images) && images.length) args.images = images;

    let res;
    try {
      const c = await connect();
      res = await c.callTool({ name: 'ask_claude', arguments: args });
    } catch (e) {
      // The MCP child may have crashed/exited — reset and retry once so a single
      // tool-server hiccup doesn't fail the whole turn.
      await close();
      const c = await connect();
      res = await c.callTool({ name: 'ask_claude', arguments: args });
    }

    const text = Array.isArray(res?.content)
      ? res.content.filter((b) => b?.type === 'text').map((b) => b.text).join('\n')
      : '';
    if (res?.isError) throw new Error(text || 'ask_claude error');
    return text || '(no answer)';
  }

  // Ask phi4 for a routing decision on the current conversation.
  async function route(ollamaMessages) {
    const r = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        format: 'json',
        options: { temperature: 0.2 },
        messages: [{ role: 'system', content: ROUTER_PROMPT }, ...ollamaMessages],
      }),
    });
    if (!r.ok) throw new Error(`ollama route failed: ${r.status}`);
    const j = await r.json();
    return parseDecision(j?.message?.content);
  }

  // Plain phi4 answer (fallback when routing JSON can't be parsed).
  async function plainAnswer(ollamaMessages) {
    const r = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        options: { temperature: 0.4 },
        messages: [{ role: 'system', content: PERSONA }, ...ollamaMessages],
      }),
    });
    if (!r.ok) throw new Error(`ollama answer failed: ${r.status}`);
    const j = await r.json();
    return (j?.message?.content || '').trim();
  }

  /**
   * Run one orchestrated turn over the chat history.
   *
   * PRIVACY / OPT-IN: by default (`useClaude` falsy) the turn is answered
   * PURELY LOCALLY by Phi-4-mini — `ask_claude` is NEVER invoked and nothing
   * leaves the box. `ask_claude` (the heavy local Claude CLI, incl. vision) is
   * reached ONLY when the caller explicitly sets `useClaude: true`.
   *
   * @param {Array<{role,content}>} messages  content may be string or block array
   * @param {{useClaude?: boolean}} [opts]
   * @returns {Promise<{reply:string, via:string}>}
   */
  async function orchestrate(messages, opts = {}) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('no messages');
    }
    const useClaude = opts.useClaude === true;

    // Build an Ollama-friendly transcript (flatten block content to text).
    const ollamaMessages = messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: flattenContent(m.content).text || '(no text)',
    }));

    // Inspect the latest user message.
    let lastUser = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { lastUser = messages[i]; break; }
    }
    const flat = flattenContent(lastUser ? lastUser.content : '');
    const images = extractImages(lastUser ? lastUser.content : '');
    const hasImage = images.length > 0 || flat.imageCount > 0;

    // ---- DEFAULT: pure-local, privacy-preserving path (opt-in OFF) ----------
    // Nothing here can reach ask_claude. Ollama runs locally on this box.
    if (!useClaude) {
      if (hasImage) {
        // Never silently send an image to Claude — nudge the user to opt in.
        return {
          reply:
            'I can only look at pictures when you switch on “Ask Claude”. ' +
            'Flip that on and send the image again, and I’ll take a good look for you!',
          via: 'local(image-blocked)',
        };
      }
      try {
        const reply = await plainAnswer(ollamaMessages);
        return { reply: reply || 'Hey there, friend! How’s the road today?', via: 'phi4(local)' };
      } catch (e) {
        // Ollama down / phi4 missing — friendly local error, still no Claude call.
        return {
          reply:
            'Sorry friend, my local brain is offline right now. Make sure Ollama ' +
            'is running (and the phi4-mini model is installed), then try again.',
          via: 'phi4(offline)',
        };
      }
    }

    // ---- OPT-IN ON (useClaude=true): delegation to Claude is permitted -------
    // DETERMINISTIC: images go to Claude with real vision passthrough.
    if (hasImage) {
      try {
        const reply = await askClaude(flat.text || 'Describe the attached image(s).', images);
        return { reply, via: 'claude(image)' };
      } catch (e) {
        // Bad/oversized image or CLI hiccup — friendly reply, no stack to client.
        return {
          reply:
            'Sorry friend, I couldn’t open that image. Please make sure it’s a ' +
            'PNG, JPEG, GIF, or WebP under a few MB and try again.',
          via: 'claude(image-failed)',
        };
      }
    }

    // Bounded routing/tool loop.
    let hops = 0;
    while (hops < maxHops) {
      hops += 1;

      // Heuristic override: obvious hard turns delegate directly.
      if (looksHard(flat.text)) {
        const reply = await askClaude(flat.text);
        return { reply, via: 'claude(heuristic)' };
      }

      let decision;
      try {
        decision = await route(ollamaMessages);
      } catch (e) {
        // Ollama unreachable — degrade gracefully to a delegated answer.
        const reply = await askClaude(flat.text || 'Say hello to the driver.');
        return { reply, via: 'claude(fallback)' };
      }

      if (!decision) {
        // Couldn't parse a decision — try a plain phi4 answer, else delegate.
        try {
          const reply = await plainAnswer(ollamaMessages);
          if (reply) return { reply, via: 'phi4(plain)' };
        } catch { /* ignore */ }
        const reply = await askClaude(flat.text);
        return { reply, via: 'claude(unparsed)' };
      }

      if (decision.action === 'answer') {
        return { reply: decision.text || 'Hey there, friend!', via: 'phi4' };
      }

      // delegate → hand the VERBATIM user text to Claude (more faithful than
      // phi4's restatement), then return its answer.
      const reply = await askClaude(flat.text || decision.text);
      return { reply, via: 'claude' };
    }

    // Hop budget exhausted — safe fallback.
    return { reply: "Sorry friend, I couldn't work that one out. Mind rephrasing?", via: 'exhausted' };
  }

  async function close() {
    if (client) {
      try { await client.close(); } catch { /* ignore */ }
      client = null;
    }
  }

  return { orchestrate, close, connect };
}
