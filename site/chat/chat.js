/* ============================================================
   Drivee — client logic
   One file drives both login.html and index.html; the page is
   detected by which elements are present.

   HTTP contract (FIXED — do not depend on impl details):
     POST {API_BASE}/api/login   {password}
        -> 200 {ok:true, token}  | 401 {ok:false}
     POST {API_BASE}/api/chat    header Authorization: Bearer <token>,
                                  body {messages:[{role,content}...]}
        -> 200 {ok:true, reply}  | {ok:false, error, code}
        401 = not logged in / bad token, 429 = rate limited
     POST {API_BASE}/api/logout  header Authorization: Bearer <token>
        -> {ok:true}

   API_BASE (window.DRIVEE_API_BASE, from config.js) is the public
   URL of the local Node orchestrator, reached over a Cloudflare
   tunnel. Auth is a short-lived Bearer token (cross-origin, so NOT
   a cookie/CSRF pair). No API key or secret lives here — the heavy
   LLM auth stays server-side. Assistant replies are rendered as
   TEXT ONLY (textContent) — never innerHTML — to prevent XSS.
   ============================================================ */
(function () {
  'use strict';

  /* ---- config ---- */
  /* API base comes from config.js (window.DRIVEE_API_BASE) — a human sets it
     at deploy to the tunnel host. Trailing slashes are trimmed so we can join
     paths cleanly. */
  var API_BASE = String((window.DRIVEE_API_BASE || '')).replace(/\/+$/, '');
  var API = {
    login:  API_BASE + '/api/login',
    chat:   API_BASE + '/api/chat',
    logout: API_BASE + '/api/logout'
  };
  var TOKEN_KEY = 'dl_chat_token';
  /* Client-side ceiling so a dead socket or a stalled proxy never leaves the
     UI hung with the send button disabled. Generous — Claude replies can be slow. */
  var REQUEST_TIMEOUT_MS = 45000;

  /* Local preview mock: the real Node orchestrator (behind the tunnel) is not
     available when the files are opened from disk (file://) or with ?mock=1. On
     the real Hostinger host (https, no flag) this is OFF and the real endpoints
     are used. */
  var MOCK = (location.protocol === 'file:') || /[?&]mock=1\b/.test(location.search);

  /* Config guard: a human must set window.DRIVEE_API_BASE in config.js to the
     live tunnel host. If it is still the shipped placeholder (or empty), firing
     requests would surface a cryptic network/404 error, so instead we detect it
     up front and show one clear message. In MOCK mode the base is irrelevant
     (requests are intercepted before they leave the page). */
  var API_BASE_OK = MOCK || (!!API_BASE && !/REPLACE-WITH/i.test(API_BASE));
  var NOT_CONFIGURED_MSG = 'Drivee isn’t set up yet — the API base still needs to be filled in (config.js). Ask whoever deployed this.';

  /* ---- tiny helpers ---- */
  function $(id) { return document.getElementById(id); }

  /* Bearer token from /api/login.
     STORE CHOICE (deliberate): sessionStorage is PRIMARY, in-memory is the
     fallback — not the other way round. login.html and index.html are two
     SEPARATE documents, so the post-login full-page navigation wipes any
     in-memory value; the token has to survive that hop and only web storage
     does. sessionStorage (never localStorage) keeps it per-tab and short-lived
     — cleared when the tab closes. The in-memory `memToken` only covers private
     modes where sessionStorage throws (single-context best effort). Never a
     cookie (the API is cross-origin), never logged, never placed in a URL;
     cleared on logout and on any 401. */
  function getToken() {
    try { return sessionStorage.getItem(TOKEN_KEY) || memToken; } catch (e) { return memToken; }
  }
  var memToken = ''; // fallback if sessionStorage is unavailable (private mode)
  function setToken(v) {
    memToken = v || '';
    try { if (v) sessionStorage.setItem(TOKEN_KEY, v); else sessionStorage.removeItem(TOKEN_KEY); }
    catch (e) {}
  }
  function clearToken() { setToken(''); }
  function authHeader() { var t = getToken(); return t ? { 'Authorization': 'Bearer ' + t } : {}; }

  function gotoLogin() { location.replace('login.html'); }
  function gotoChat()  { location.replace('index.html'); }

  /* Parse a fetch Response as JSON, tolerating empty/non-JSON bodies. */
  function readJson(res) {
    return res.text().then(function (t) {
      var data = {};
      if (t) { try { data = JSON.parse(t); } catch (e) { data = {}; } }
      return { status: res.status, data: data };
    });
  }

  /* ============================================================
     MOCK backend (local preview only)
     ============================================================ */
  function mockFetch(url, opts) {
    opts = opts || {};
    var body = {};
    if (opts.body) { try { body = JSON.parse(opts.body); } catch (e) {} }
    return new Promise(function (resolve) {
      setTimeout(function () {
        if (url === API.login) {
          if (body.password && body.password.length >= 1) {
            resolve(json(200, { ok: true, token: 'mock-token-' + Date.now() }));
          } else {
            resolve(json(401, { ok: false }));
          }
        } else if (url === API.logout) {
          resolve(json(200, { ok: true }));
        } else if (url === API.chat) {
          var hdr = (opts.headers && (opts.headers['Authorization'] || opts.headers['authorization'])) || '';
          if (!/^Bearer\s+\S/.test(hdr)) { resolve(json(401, { ok: false, error: 'Not logged in.', code: 401 })); return; }
          var msgs = body.messages || [];
          var lastContent = msgs.length ? msgs[msgs.length - 1].content : '';
          var last;
          if (typeof lastContent === 'string') {
            last = lastContent;
          } else if (Array.isArray(lastContent)) {
            // Multimodal message: summarise image blocks + concatenate text.
            var txt = '', imgs = 0;
            lastContent.forEach(function (b) {
              if (b && b.type === 'text') txt += b.text || '';
              else if (b && b.type === 'image') imgs++;
            });
            last = (imgs ? '[' + imgs + ' image' + (imgs > 1 ? 's' : '') + '] ' : '') + txt;
          } else {
            last = '';
          }
          resolve(json(200, {
            ok: true,
            reply: 'Mock reply. You said: "' + last + '"\n\n(This is the local preview mock — the real Drivee brain runs on the local Node orchestrator behind the tunnel.)'
          }));
        } else {
          resolve(json(404, { ok: false, error: 'Not found', code: 404 }));
        }
      }, 550);
    });
    function json(status, obj) {
      return { status: status, ok: status >= 200 && status < 300,
        text: function () { return Promise.resolve(JSON.stringify(obj)); } };
    }
  }

  function apiFetch(url, opts) {
    if (MOCK) return mockFetch(url, opts).then(readJson);
    opts = opts || {};
    opts.credentials = 'omit'; // cross-origin Bearer auth — no cookies

    /* Abort the request once REQUEST_TIMEOUT_MS elapses; the caller's .catch
       sees an AbortError and shows a friendly "took too long" message. */
    var ctrl, timer;
    if (typeof AbortController !== 'undefined') {
      ctrl = new AbortController();
      opts.signal = ctrl.signal;
      timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, REQUEST_TIMEOUT_MS);
    }
    function done() { if (timer) { clearTimeout(timer); timer = null; } }
    return fetch(url, opts).then(
      function (res) { done(); return readJson(res); },
      function (err) { done(); throw err; }
    );
  }

  /* Classify a thrown fetch error for friendly copy.
     - AbortError  => our own timeout fired.
     - TypeError   => fetch never got a response: DNS/connection failure, a
                      blocked CORS preflight, or an unreachable API base. For a
                      cross-origin API this means "Drivee itself is unreachable"
                      (the tunnel/orchestrator is down or CORS rejected us),
                      which is distinct from a normal reachable-but-failing turn. */
  function isTimeout(err) { return !!(err && err.name === 'AbortError'); }
  function isUnreachable(err) {
    return !!(err && !isTimeout(err) && (err.name === 'TypeError' || err instanceof TypeError));
  }
  /* Shared copy for a thrown (rejected) request. */
  function fetchErrorMsg(err) {
    if (isTimeout(err)) return 'Drivee took too long to respond. Please try again.';
    if (isUnreachable(err)) return 'Can’t reach Drivee. Is it running? Please try again in a moment.';
    return 'Network error. Please try again.';
  }

  /* ============================================================
     LOGIN PAGE
     ============================================================ */
  function initLogin() {
    var form = $('chat-login-form');
    var pass = $('auth-pass');
    var btn  = $('auth-submit');
    var err  = $('auth-err');

    function showErr(msg) {
      err.textContent = msg;
      err.classList.add('show');
    }
    function clearErr() {
      err.textContent = '';
      err.classList.remove('show');
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearErr();
      if (!API_BASE_OK) { showErr(NOT_CONFIGURED_MSG); return; }
      var pw = pass.value;
      if (!pw) { showErr('Enter your password.'); pass.focus(); return; }

      btn.disabled = true;
      btn.textContent = 'Logging in…';

      apiFetch(API.login, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw })
      }).then(function (r) {
        if (r.status === 200 && r.data && r.data.ok && r.data.token) {
          setToken(r.data.token);
          gotoChat();
          return;
        }
        if (r.status === 429) {
          showErr('Too many attempts. Please wait a few minutes and try again.');
        } else {
          showErr('Incorrect password.');
        }
        pass.value = '';
        pass.focus();
        btn.disabled = false;
        btn.textContent = 'Log in';
      }).catch(function (err) {
        showErr(fetchErrorMsg(err));
        btn.disabled = false;
        btn.textContent = 'Log in';
        pass.focus();
      });
    });

    pass.focus();
  }

  /* ============================================================
     CHAT PAGE
     ============================================================ */
  function initChat() {
    // Gate: no Bearer token -> not logged in -> back to login.
    if (!getToken()) { gotoLogin(); return; }

    var log      = $('chat-messages');
    var empty    = $('chat-empty');
    var form     = $('chat-form');
    var input    = $('chat-input');
    var sendBtn  = $('btn-send');
    var errBar   = $('chat-err');
    var logout   = $('btn-logout');
    var fileInp  = $('chat-file');
    var attach   = $('btn-attach');
    var previews = $('chat-previews');
    var modeBtn  = $('btn-claude');

    var history = [];   // running [{role, content}] kept in memory only
    var busy    = false;
    var typingEl = null;
    var claudeMode = false;   // OPT-IN: false = Phi-4 only (on-device). Sticky until "Bye claude".

    /* ---- image attachment state ---- */
    /* Each pending item (after downscale/re-encode):
         {media_type:'image/jpeg', data(base64, no data: prefix),
          dataUrl(full data: URL for the sent bubble — persists),
          previewUrl(object URL for the composer strip — revoked on remove/send),
          el(preview node)}.  Cleared on send.
       SHARED-HOSTING POLICY: before base64-encoding, every image is drawn to a
       canvas, capped to a ~1568px long edge (Anthropic's recommended max), and
       re-encoded to JPEG q0.85. This shrinks a typical phone photo from several
       MB to a few hundred KB, which keeps the outgoing body within the modest
       cap the orchestrator (over the tunnel) accepts. */
    var pending = [];
    var MAX_SOURCE_BYTES = 12 * 1024 * 1024; // reject the ORIGINAL file above this (bounds canvas memory)
    var MAX_IMAGES       = 4;                // per outgoing message
    var MAX_EDGE_PX      = 1568;             // long-edge cap (Anthropic's recommended max)
    var JPEG_QUALITY     = 0.85;
    var ALLOWED_TYPES    = { 'image/png': 1, 'image/jpeg': 1, 'image/gif': 1, 'image/webp': 1 };
    var encoding         = 0;                // count of in-flight downscale/encode jobs
    function normType(t) {
      t = (t || '').toLowerCase();
      return t === 'image/jpg' ? 'image/jpeg' : t;
    }

    /* ---- rendering (TEXT ONLY — no innerHTML on model output) ---- */
    function hideEmpty() { if (empty) empty.style.display = 'none'; }

    function addMessage(role, text, imageUrls) {
      hideEmpty();
      var el = document.createElement('div');
      el.className = 'msg ' + (role === 'user' ? 'msg-user' : 'msg-assistant');
      var label = document.createElement('span');
      label.className = 'msg-role';
      label.textContent = role === 'user' ? 'You' : 'Assistant';
      el.appendChild(label);
      // The user's own attached image thumbnails (data: URLs — safe, not model output).
      if (imageUrls && imageUrls.length) {
        var box = document.createElement('div');
        box.className = 'msg-imgs';
        imageUrls.forEach(function (url) {
          var im = document.createElement('img');
          im.className = 'msg-img';
          im.src = url;
          im.alt = 'Attached image';
          box.appendChild(im);
        });
        el.appendChild(box);
      }
      // Only add a text node when there is text (an image-only message has none).
      if (text || !(imageUrls && imageUrls.length)) {
        var span = document.createElement('span');
        span.textContent = text || '';    // <-- safe: renders as plain text
        el.appendChild(span);
      }
      log.appendChild(el);
      scrollDown();
      return el;
    }

    function showTyping() {
      hideEmpty();
      typingEl = document.createElement('div');
      typingEl.className = 'typing';
      typingEl.setAttribute('aria-label', 'Drivee is typing');
      for (var i = 0; i < 3; i++) typingEl.appendChild(document.createElement('span'));
      log.appendChild(typingEl);
      scrollDown();
    }
    function hideTyping() {
      if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
      typingEl = null;
    }

    function scrollDown() { log.scrollTop = log.scrollHeight; }

    function showErr(msg) { errBar.textContent = msg; errBar.classList.add('show'); }
    function clearErr()   { errBar.textContent = ''; errBar.classList.remove('show'); }

    function setBusy(v) {
      busy = v;
      input.disabled = v;
      if (attach) attach.disabled = v;
      refreshSend();
    }
    /* Send stays disabled while a request is in flight OR any image is still
       being downscaled/encoded, so we never send a half-encoded attachment. */
    function refreshSend() { sendBtn.disabled = busy || encoding > 0; }

    /* ---- image attachment: pick, validate, preview ---- */
    /* Preview thumbnails are built via safe DOM (createElement + .src on an
       object URL) — image bytes are NEVER HTML-injected. */
    function addPreview(item) {
      var wrap = document.createElement('div');
      wrap.className = 'chat-preview';
      var img = document.createElement('img');
      img.src = item.previewUrl;
      img.alt = 'Attachment preview';
      wrap.appendChild(img);
      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'chat-preview-remove';
      rm.setAttribute('aria-label', 'Remove image');
      rm.textContent = '×';   // ×
      rm.addEventListener('click', function () {
        var i = pending.indexOf(item);
        if (i >= 0) pending.splice(i, 1);
        revokePreview(item);
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      });
      wrap.appendChild(rm);
      previews.appendChild(wrap);
      item.el = wrap;
    }

    function revokePreview(item) {
      if (item && item.previewUrl) {
        try { URL.revokeObjectURL(item.previewUrl); } catch (e) {}
        item.previewUrl = null;
      }
    }

    function clearPending() {
      pending.forEach(revokePreview);   // release object URLs
      pending.length = 0;
      if (previews) previews.innerHTML = '';
    }

    /* Downscale + re-encode one image: draw it onto a canvas capped to
       MAX_EDGE_PX on the long edge, re-encode to JPEG, and produce both a small
       object-URL preview and the base64 payload. Fully async; every terminal
       path decrements `encoding` and refreshes the send button. */
    function processFile(file) {
      encoding++;
      refreshSend();
      var srcUrl = URL.createObjectURL(file);
      var done = false;
      function finish(errMsg) {
        if (done) return;
        done = true;
        try { URL.revokeObjectURL(srcUrl); } catch (e) {}
        encoding--;
        refreshSend();
        if (errMsg) showErr(errMsg);
      }
      var img = new Image();
      img.onerror = function () { finish('Could not read that image.'); };
      img.onload = function () {
        var canvas;
        try {
          var w = img.naturalWidth || img.width;
          var h = img.naturalHeight || img.height;
          if (!w || !h) throw 0;
          var scale = Math.min(1, MAX_EDGE_PX / Math.max(w, h));
          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(h * scale));
          canvas = document.createElement('canvas');
          canvas.width = cw;
          canvas.height = ch;
          var ctx = canvas.getContext('2d');
          if (!ctx) throw 0;
          // JPEG has no alpha channel — paint white first so transparent PNGs
          // don't come through with black backgrounds.
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);
        } catch (e) {
          finish('Could not process that image.');
          return;
        }
        canvas.toBlob(function (blob) {
          if (!blob) { finish('Could not process that image.'); return; }
          var reader = new FileReader();
          reader.onload = function () {
            var durl = String(reader.result || '');
            var comma = durl.indexOf(',');
            if (comma < 0) { finish('Could not process that image.'); return; }
            // Async race: another job may have filled the slots meanwhile.
            if (pending.length >= MAX_IMAGES) { finish(); return; }
            var item = {
              media_type: 'image/jpeg',
              data: durl.substring(comma + 1),
              dataUrl: durl,                       // persists in the sent bubble
              previewUrl: URL.createObjectURL(blob) // transient composer thumbnail
            };
            pending.push(item);
            addPreview(item);
            finish();
          };
          reader.onerror = function () { finish('Could not process that image.'); };
          reader.readAsDataURL(blob);
        }, 'image/jpeg', JPEG_QUALITY);
      };
      img.src = srcUrl;
    }

    function handleFiles(fileList) {
      var files = Array.prototype.slice.call(fileList || []);
      if (!files.length) return;
      clearErr();
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        // Count in-flight encodes too, so a fast multi-select can't overshoot.
        if (pending.length + encoding >= MAX_IMAGES) {
          showErr('You can attach up to ' + MAX_IMAGES + ' images.');
          break;
        }
        var mt = normType(f.type);
        if (!ALLOWED_TYPES[mt]) { showErr('Only PNG, JPEG, GIF, or WebP images are supported.'); continue; }
        if (f.size > MAX_SOURCE_BYTES) { showErr('Each image must be under 12 MB.'); continue; }
        processFile(f);
      }
      fileInp.value = '';   // allow re-selecting the same file
    }

    if (attach && fileInp) {
      attach.addEventListener('click', function () { if (!busy) fileInp.click(); });
      fileInp.addEventListener('change', function () { handleFiles(fileInp.files); });
    }

    /* ---- textarea auto-grow ---- */
    function autoGrow() {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 140) + 'px';
    }
    input.addEventListener('input', autoGrow);

    /* Enter = send, Shift+Enter = newline (desktop). */
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit ? form.requestSubmit() : send();
      }
    });

    /* ---- send flow ---- */
    /* Append a centered, muted system note (mode switches). Not part of the
       model conversation — never pushed into `history`, never sent anywhere. */
    function addNote(text) {
      var el = document.createElement('div');
      el.className = 'msg msg-note';
      el.setAttribute('role', 'status');
      el.textContent = text;                 // textContent — never innerHTML
      log.appendChild(el);
      if (empty) empty.style.display = 'none';
      log.scrollTop = log.scrollHeight;
    }

    /* "Bye claude" — case-insensitive, tolerant of a comma / trailing punctuation. */
    var BYE_CLAUDE_RE = /^\s*bye,?\s*claude[\s.!]*$/i;

    function setClaudeMode(on, announce) {
      claudeMode = !!on;
      if (modeBtn) {
        modeBtn.setAttribute('aria-pressed', claudeMode ? 'true' : 'false');
        modeBtn.classList.toggle('on', claudeMode);
      }
      input.placeholder = claudeMode ? 'Message Claude…' : 'Message…';
      if (announce) {
        addNote(claudeMode
          ? '⚡ Ask Claude is ON — your messages now go to Claude. Say “Bye claude” to switch back to Phi-4 (on-device).'
          : '👋 Back to Phi-4 — running on your Mac. Nothing leaves the device.');
      }
    }
    if (modeBtn) {
      modeBtn.addEventListener('click', function () { setClaudeMode(!claudeMode, true); });
    }

    function send() {
      if (busy || encoding > 0) return;      // never send a half-encoded image
      if (!API_BASE_OK) { showErr(NOT_CONFIGURED_MSG); return; }
      var text = input.value.trim();
      var images = pending.slice();          // snapshot of attached images
      if (!text && images.length === 0) return;
      var hadImages = images.length > 0;
      clearErr();

      // "Bye claude" is a CLIENT-SIDE control phrase — it never leaves the box.
      // Switches back to Phi-4 (on-device), regardless of the current mode.
      if (BYE_CLAUDE_RE.test(text) && images.length === 0) {
        addMessage('user', text, null);
        input.value = ''; autoGrow();
        setClaudeMode(false, true);
        input.focus();
        return;
      }

      // Phi-4-mini can't see images, so a picture implies opt-in. If Ask Claude
      // is OFF, block the send and nudge — never silently ship an image to Claude.
      if (images.length && !claudeMode) {
        showErr('Images need Claude. Turn on “Ask Claude” to send a picture.');
        return;
      }

      // Build the outgoing content: an ARRAY of blocks when images are
      // attached (image blocks first, then the optional text block), otherwise
      // a plain string — identical to the text-only path before this feature.
      var content, imageUrls = null;
      if (images.length) {
        content = [];
        imageUrls = [];
        images.forEach(function (img) {
          content.push({
            type: 'image',
            source: { type: 'base64', media_type: img.media_type, data: img.data }
          });
          imageUrls.push(img.dataUrl);
        });
        if (text) content.push({ type: 'text', text: text });
      } else {
        content = text;
      }

      addMessage('user', text, imageUrls);
      history.push({ role: 'user', content: content });
      input.value = '';
      clearPending();
      autoGrow();
      setBusy(true);
      showTyping();

      apiFetch(API.chat, {
        method: 'POST',
        headers: Object.assign(
          { 'Content-Type': 'application/json' },
          authHeader()
        ),
        body: JSON.stringify({ messages: history, useClaude: claudeMode })
      }).then(function (r) {
        hideTyping();

        if (r.status === 200 && r.data && r.data.ok && typeof r.data.reply === 'string') {
          addMessage('assistant', r.data.reply);
          history.push({ role: 'assistant', content: r.data.reply });
          setBusy(false);
          input.focus();
          return;
        }

        // Roll back the optimistic user turn from history so a retry
        // doesn't duplicate it.
        history.pop();

        if (r.status === 401) {
          clearToken();
          showErr('Session expired. Returning to login…');
          setTimeout(gotoLogin, 1200);
          return;
        }
        if (r.status === 403) {
          // Harmless safety net. Under the Bearer contract the orchestrator
          // signals auth failure with 401, so a 403 that reaches us comes from
          // the EDGE (Cloudflare/WAF/proxy), not a bad token — wiping a still-
          // valid session and bouncing to login would be wrong and wouldn't
          // help. Keep the session, show a distinct message, let them retry.
          showErr('Drivee’s server refused that request (blocked upstream). Your login is still active — please try again shortly.');
          setBusy(false);
          input.focus();
          return;
        }
        if (r.status === 429) {
          showErr('You are sending messages too fast. Please wait a moment.');
        } else {
          var m = (r.data && r.data.error) ? r.data.error : 'Something went wrong. Please try again.';
          // Vision-model hint: an upstream 400 on a turn that carried images
          // usually means the configured model isn't vision-capable.
          if (hadImages && r.data && r.data.code === 400) {
            m = 'Drivee could not process the attached image. The assistant may not be configured with a vision-capable model.';
          }
          showErr(m);
        }
        setBusy(false);
        input.focus();
      }).catch(function (err) {
        hideTyping();
        history.pop();
        showErr(fetchErrorMsg(err));
        setBusy(false);
        input.focus();
      });
    }

    form.addEventListener('submit', function (e) { e.preventDefault(); send(); });

    // If the deploy base was never filled in, say so up front rather than on
    // the first failed send.
    if (!API_BASE_OK) showErr(NOT_CONFIGURED_MSG);

    /* ---- logout ---- */
    logout.addEventListener('click', function () {
      logout.disabled = true;
      apiFetch(API.logout, {
        method: 'POST',
        headers: authHeader()
      }).then(function () {
        clearToken();
        gotoLogin();
      }).catch(function () {
        clearToken();
        gotoLogin();
      });
    });

    input.focus();
  }

  /* ---- boot: pick the page ---- */
  document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('chat-login-form')) initLogin();
    else if (document.getElementById('chat-messages')) initChat();
  });
})();
