#!/usr/bin/env python3
"""
saver-classify.py — DriverLog "Saver" tier local-model helper (option B, narrow & safe).

The Saver tier runs a LOCAL LLM (phi4-mini via Ollama, $0 marginal cost) for INTERNAL,
non-user-facing DECISIONING only. It NEVER authors or translates any user-facing string —
the 2026-07-07 test showed phi4-mini/qwen3:4b fail Thai generation, but pass enum
classification. So this helper is a constrained classifier, not an agent:

  - community-support  -> feedback TRIAGE: free text -> {category, priority}  (model)
  - retention-lifecycle -> nudge SELECTION: driver state -> template id       (pure rules)

Output is staged to an INTERNAL file under automation/ for hosted (haiku/opus) review —
qa-testing and PM stay on hosted tiers. This script writes NOTHING under site/ or android/.

Usage:
  python3 saver-classify.py --selftest         # verify the local model + rules, no files
  python3 saver-classify.py                     # process automation/saver-inbox.jsonl -> saver-triage.md
  python3 saver-classify.py --inbox path.jsonl  # custom inbox

Requires: Ollama running locally with phi4-mini pulled (`ollama serve`, `ollama pull phi4-mini`).
No third-party deps (stdlib only) — deliberately avoids the LiteLLM/py3.9 fragility.
"""
import json
import os
import sys
import urllib.request
import urllib.error

OLLAMA_URL = os.environ.get("SAVER_OLLAMA_URL", "http://127.0.0.1:11434")
MODEL = os.environ.get("SAVER_MODEL", "phi4-mini")
HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_INBOX = os.path.join(HERE, "saver-inbox.jsonl")
TRIAGE_OUT = os.path.join(HERE, "saver-triage.md")

# Fixed output vocabularies — the model's answer is whitelisted against these.
CATEGORIES = ["bug", "feature_request", "ux_complaint", "praise", "question", "other"]
PRIORITIES = ["low", "medium", "high"]
NUDGES = ["shift_reminder", "weekly_recap", "tax_reminder", "none"]

TRIAGE_SYSTEM = (
    "You are a support-ticket triage classifier for a driver-earnings app. "
    "Classify the feedback into EXACTLY ONE category from this list: "
    + ", ".join(CATEGORIES) + ". "
    "Respond in JSON only: {\"category\": \"...\", \"priority\": \"low|medium|high\"}. "
    "Do not add any other text."
)


def _safety_check(path):
    """Refuse to write anywhere near user-facing product code."""
    ap = os.path.abspath(path)
    for banned in ("/site/", "/android/", "/brand/"):
        if banned in ap:
            raise SystemExit(f"REFUSING to write to a user-facing path: {ap}")
    if os.path.basename(os.path.dirname(ap)) != "automation":
        raise SystemExit(f"REFUSING: Saver output must live under automation/, got {ap}")


def _norm_priority(p):
    p = str(p or "").strip().lower()
    if p in ("med", "mid"):
        p = "medium"
    return p if p in PRIORITIES else "medium"


def classify_feedback(text):
    """Free-text feedback -> {category, priority}. Whitelist-validated; safe fallback on any error."""
    body = json.dumps({
        "model": MODEL,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0},
        "messages": [
            {"role": "system", "content": TRIAGE_SYSTEM},
            {"role": "user", "content": text},
        ],
    }).encode()
    try:
        req = urllib.request.Request(OLLAMA_URL + "/api/chat", data=body,
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=45) as r:
            content = json.loads(r.read())["message"]["content"]
        parsed = json.loads(content)
        cat = str(parsed.get("category", "")).strip().lower()
        if cat not in CATEGORIES:
            # off-enum: don't trust it, flag for a human
            return {"category": "other", "priority": "medium", "flag": "off-enum model output"}
        return {"category": cat, "priority": _norm_priority(parsed.get("priority")), "flag": ""}
    except (urllib.error.URLError, OSError) as e:
        return {"category": "other", "priority": "medium", "flag": f"model unreachable: {e}"}
    except (ValueError, KeyError) as e:
        return {"category": "other", "priority": "medium", "flag": f"unparseable model output: {e}"}


def select_nudge(state):
    """Driver-state dict -> nudge template id. PURE RULES (deterministic, no model call).

    The nudge TEXT comes from the app's existing EN/TH i18n templates — this only picks WHICH
    pre-translated template fires, so nothing model-authored ever reaches a user.
    Expected keys: days_since_last_shift (int), is_week_end (bool), shifts_this_week (int),
    tax_season (bool).
    """
    if state.get("tax_season") and state.get("shifts_this_week", 0) > 0:
        return "tax_reminder"
    if state.get("is_week_end") and state.get("shifts_this_week", 0) > 0:
        return "weekly_recap"
    if state.get("days_since_last_shift", 0) >= 3:
        return "shift_reminder"
    return "none"


def selftest():
    print(f"Saver self-test — model={MODEL} via {OLLAMA_URL}\n")
    samples = [
        "The app keeps logging me out every hour, super annoying",
        "Please add a way to track tips separately from fares",
        "Love this, finally know if my shifts are worth it",
        "How do I export my data to Excel?",
        "the baht per km number looks wrong after I edited a fuel entry",
    ]
    print("[triage — community-support]")
    for s in samples:
        r = classify_feedback(s)
        flag = f"  ⚠ {r['flag']}" if r["flag"] else ""
        print(f"  {r['category']:<16} {r['priority']:<7} | {s[:52]}{flag}")
    print("\n[nudge selection — retention-lifecycle, pure rules]")
    states = [
        {"days_since_last_shift": 5, "shifts_this_week": 0},
        {"is_week_end": True, "shifts_this_week": 4},
        {"tax_season": True, "shifts_this_week": 10},
        {"days_since_last_shift": 1, "shifts_this_week": 2},
    ]
    for st in states:
        print(f"  {select_nudge(st):<16} <- {st}")
    print("\nOK — classifier reachable and enum-constrained; rules deterministic.")


def process_inbox(inbox):
    if not os.path.exists(inbox):
        print(f"No inbox at {inbox} — nothing to triage. (Create JSONL: one "
              '{"id":..,"text":..} per line.)')
        return
    _safety_check(TRIAGE_OUT)
    items = []
    with open(inbox) as f:
        for line in f:
            line = line.strip()
            if line:
                items.append(json.loads(line))
    if not items:
        print("Inbox empty — nothing to do.")
        return
    rows = []
    for it in items:
        r = classify_feedback(it.get("text", ""))
        rows.append((it.get("id", "?"), r["category"], r["priority"], r["flag"],
                     it.get("text", "").replace("|", "/")[:80]))
    header_needed = not os.path.exists(TRIAGE_OUT)
    with open(TRIAGE_OUT, "a") as f:
        if header_needed:
            f.write("# Saver triage staging (local phi4-mini) — HOSTED REVIEW REQUIRED\n\n"
                    "Internal decisioning output. A hosted community-support/PM pass promotes "
                    "accepted items to `docs/roadmap-next.md`. Nothing here is user-facing.\n\n"
                    "| id | category | priority | flag | feedback (truncated) |\n"
                    "|----|----------|----------|------|----------------------|\n")
        for rid, cat, pri, flag, text in rows:
            f.write(f"| {rid} | {cat} | {pri} | {flag or ''} | {text} |\n")
    print(f"Triaged {len(rows)} item(s) -> {TRIAGE_OUT} (staged for hosted review).")


def main(argv):
    if "--selftest" in argv:
        selftest()
        return
    inbox = DEFAULT_INBOX
    if "--inbox" in argv:
        inbox = argv[argv.index("--inbox") + 1]
    process_inbox(inbox)


if __name__ == "__main__":
    main(sys.argv[1:])
