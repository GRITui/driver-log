#!/usr/bin/env python3
"""
drivee-cli.py — terminal chat client for the local Drivee orchestrator.

Talks to the same /api/login + /api/chat endpoints the web UI uses, so it
exercises the real workflow (login -> Bearer token -> phi4-mini locally, or
--claude / `/claude on` to route through the sandboxed Claude CLI).

Usage:
    python3 drivee-cli.py                # defaults to http://127.0.0.1:8787
    python3 drivee-cli.py --base URL

In-chat commands:
    /claude on | off     toggle "Ask Claude" for subsequent messages
    /reset               clear the conversation history
    /quit  (or Ctrl-D)   exit
"""
import argparse
import getpass
import json
import sys
import urllib.request
import urllib.error

def post(base, path, payload, token=None):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(base + path, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Origin", "https://driverlog.link")  # matches allowed_origin
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {"error": e.reason}
    except urllib.error.URLError as e:
        print(f"\n  ! can't reach orchestrator at {base} ({e.reason}).")
        print("    Is it running?  cd drivee-orchestrator && npm start")
        sys.exit(1)

def login(base):
    for _ in range(5):
        pw = getpass.getpass("GRIT password: ")
        status, body = post(base, "/api/login", {"password": pw})
        if status == 200 and body.get("ok"):
            print(f"  ✓ logged in (token valid {body.get('ttl')}s)\n")
            return body["token"]
        if body.get("lockedOut"):
            print("  ! locked out (too many failures) — wait and retry later.")
            sys.exit(1)
        print("  ✗ wrong password, try again.")
    sys.exit(1)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8787")
    ap.add_argument("--claude", action="store_true", help="start with Ask Claude on")
    args = ap.parse_args()
    base = args.base.rstrip("/")

    print(f"Drivee terminal — {base}")
    token = login(base)
    use_claude = args.claude
    messages = []

    while True:
        tag = "claude" if use_claude else "phi4"
        try:
            line = input(f"[{tag}] you › ").strip()
        except EOFError:
            print()
            break
        if not line:
            continue
        if line in ("/quit", "/exit"):
            break
        if line == "/reset":
            messages = []
            print("  (history cleared)\n")
            continue
        if line.startswith("/claude"):
            use_claude = "off" not in line
            print(f"  Ask Claude → {'ON' if use_claude else 'OFF'}\n")
            continue

        messages.append({"role": "user", "content": line})
        status, body = post(base, "/api/chat",
                            {"messages": messages, "useClaude": use_claude}, token)
        if status == 401:
            print("  (token expired — re-login)")
            token = login(base)
            status, body = post(base, "/api/chat",
                                {"messages": messages, "useClaude": use_claude}, token)
        if status == 200 and body.get("ok"):
            reply = body.get("reply", "")
            via = body.get("via", "?")
            messages.append({"role": "assistant", "content": reply})
            print(f"\n  drivee ({via}) › {reply}\n")
        else:
            messages.pop()  # drop the unanswered user turn
            print(f"  ! error {status}: {body.get('error', body)}\n")

    # best-effort logout
    post(base, "/api/logout", {}, token)
    print("bye.")

if __name__ == "__main__":
    main()
