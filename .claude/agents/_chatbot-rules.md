# Shared rules for the Chatbot squad

These apply to every chatbot agent (PM, junior-*, senior-*, advisor-*), on top of each role file.
The chatbot is a **new module** living under `site/chat/` on the same Hostinger shared host that
serves `driverlog.link`. It is a login-gated web chat that proxies to the **Anthropic (Claude) API**.

## Hard constraints (the box we build in)
1. **Hostinger shared hosting** — no Docker, no root, no long-running daemons, no Ollama/vLLM.
   The only server-side runtime available is **PHP** (LiteSpeed/Apache). Everything server-side is a
   PHP file. No Node/Python services.
2. **The LLM is Claude via the Anthropic API.** The PHP backend is a thin proxy: it injects the API
   key server-side and forwards to `https://api.anthropic.com/v1/messages`. Read the `claude-api`
   skill before writing any request — use current model ids, headers, and the Messages shape.
3. **No secret ever reaches the browser.** The Anthropic API key and the login password hash live in
   a config file **above the web root** (e.g. `../driverlog-chat-secret/config.php`), never in
   `site/`, never in client JS, never committed with real values (ship a `.example` template).
4. **Auth is mandatory.** `/chat` is login-gated (user `GRIT`). Password is stored as a
   **bcrypt hash** (`password_hash`/`password_verify`) — never plaintext. Sessions use httponly +
   secure + samesite cookies; the chat POST carries a CSRF token; add basic per-session rate limiting
   so a leaked session can't burn unlimited tokens.

## Process (inherited from the DriverLog team culture)
5. **No live deploy.** Never SSH-deploy or call any Hostinger deploy connector. All work is a **local
   build** under `site/chat/` plus a staged zip + written deploy instructions for a human to run.
   End at "ready to deploy, staged locally."
6. **Work in small pieces** — one bounded slice per run. Small diffs are easy to review and revert.
7. **QA/advisor gate before done.** No task is "done" until its **advisor-\*** has reviewed and
   signed off (advisors may reuse the `qa-testing` checklist). FAIL sends it back to the owning
   junior/senior — the advisor does not silently rewrite it.
8. **Log everything.** Append one line per run to `automation/dev-log.md`:
   `ISO timestamp | agent | task | files touched | QA/advisor result | status`.
9. **Model discipline.** Use the model named in your role file; don't self-upgrade. If a task needs
   deeper reasoning than your tier, stop and hand up (junior → senior → advisor/PM).

## The three roles (per task)
- **junior-\<task\>** — builds the first prototype / first idea. Gets it working end-to-end, rough
  edges allowed. Hands up to senior.
- **senior-\<task\>** — hardens the prototype: fixes bugs, edge cases, security, error handling,
  matches the DriverLog brand/site conventions. Hands up to advisor.
- **advisor-\<task\>** — reviews and confirms quality; signs off (PASS) or bounces back (FAIL) with
  specifics. Owns the QA gate for that task. Does not write the feature.

The **chatbot-pm** owns the task list, the build order, and who does what.
