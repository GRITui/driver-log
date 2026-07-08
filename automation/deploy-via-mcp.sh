#!/usr/bin/env bash
# deploy-via-mcp.sh — deploy the NON-CHAT static site to driverlog.link through
# the Hostinger MCP tool `hosting_deployStaticWebsite`, driven directly over the
# MCP's stdio JSON-RPC (no Claude-session relaunch needed).
#
# Token: read from the Driver-Log project's own hostinger-hosting MCP env in
# ~/.claude.json (populate it first — this is the project's own credential, not
# borrowed cross-project). Never printed.
#
# Safety: builds a CHAT-FREE archive (site/ minus site/chat) so chat is never
# deployed; verifies https://driverlog.link/ after; interprets 401/503 per the
# known Hostinger failure codes.

set -uo pipefail
PROJECT_DIR="/Users/grit/Claude/Projects/Driver Log"
DOMAIN="${1:-driverlog.link}"
TS="$(date +%Y%m%d_%H%M%S)"
BUILD="$PROJECT_DIR/archive/build/mcp-$TS"
ZIP="$PROJECT_DIR/archive/zips/driverlog-site_$TS.zip"
LOG="$PROJECT_DIR/automation/dev-log.md"
iso(){ date "+%Y-%m-%dT%H:%M:%S%z"; }
devlog(){ echo "$(iso) | DevOps/Deploy(MCP) | $*" >> "$LOG"; }

# --- token (project's own) ------------------------------------------------
TOKEN="$(python3 - <<'PY'
import json,os
d=json.load(open(os.path.expanduser("~/.claude.json")))
for k,v in d.get("projects",{}).items():
    if "Driver Log" in k or "Driver-Log" in k:
        for n,c in (v.get("mcpServers",{}) or {}).items():
            if n=="hostinger-hosting":
                print((c.get("env",{}) or {}).get("HOSTINGER_API_TOKEN","")); raise SystemExit
PY
)"
if [ -z "$TOKEN" ]; then
  echo "ABORT: Driver-Log hostinger-hosting token is empty in ~/.claude.json."
  echo "Wire your Hostinger token into that block first, then re-run."
  exit 1
fi

# --- build chat-free archive ---------------------------------------------
mkdir -p "$BUILD" "$PROJECT_DIR/archive/zips"
rsync -a --exclude 'chat' --exclude 'chat/**' --exclude '.DS_Store' "$PROJECT_DIR/site/" "$BUILD/"
if [ -d "$BUILD/chat" ]; then echo "ABORT: chat leaked into build"; exit 2; fi
( cd "$BUILD" && zip -qr "$ZIP" . )
echo "archive: $ZIP  ($(du -h "$ZIP" | cut -f1))"

# --- drive the MCP: initialize -> tools/call hosting_deployStaticWebsite ---
REQ=$(python3 - "$DOMAIN" "$ZIP" <<'PY'
import json,sys
domain,archive=sys.argv[1],sys.argv[2]
print(json.dumps({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"driverlog-deploy","version":"1.0"}}}))
print(json.dumps({"jsonrpc":"2.0","method":"notifications/initialized"}))
print(json.dumps({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"hosting_deployStaticWebsite","arguments":{"domain":domain,"archivePath":archive,"removeArchive":False}}}))
PY
)

RAW="$PROJECT_DIR/automation/mcp-deploy-$TS.log"
echo "deploying $DOMAIN via hosting_deployStaticWebsite (this uploads + extracts server-side)…"
printf '%s\n' "$REQ" | HOSTINGER_API_TOKEN="$TOKEN" npx -y hostinger-api-mcp > "$RAW" 2>&1

# --- interpret the tools/call (id:2) result -------------------------------
python3 - "$RAW" "$DOMAIN" "$ZIP" <<'PY'
import json,sys,subprocess
raw,domain,zipp=sys.argv[1],sys.argv[2],sys.argv[3]
res=None
for line in open(raw,encoding="utf-8",errors="replace"):
    line=line.strip()
    if not line.startswith("{"): continue
    try: m=json.loads(line)
    except: continue
    if m.get("id")==2: res=m
if res is None:
    print("RESULT: no tools/call response — check", raw); sys.exit(3)
if "error" in res:
    e=json.dumps(res["error"])
    print("DEPLOY ERROR:", e[:400])
    hint = "401 = bad/expired token (rewire)" if "401" in e else ("503 = transient Hostinger side, retry" if "503" in e else "")
    if hint: print("hint:", hint)
    sys.exit(1)
r=res.get("result",{})
is_err=r.get("isError")
txt=" ".join(c.get("text","") for c in r.get("content",[]) if isinstance(c,dict))[:600]
print("MCP isError:", is_err)
print("MCP says:", txt)
sys.exit(0 if not is_err else 1)
PY
RC=$?

# --- verify live ----------------------------------------------------------
CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$DOMAIN/" 2>/dev/null)"
VER="$(curl -s --max-time 20 "https://$DOMAIN/app.js" 2>/dev/null | grep -o "APP_VERSION = '[^']*'" | head -1)"
echo "verify: https://$DOMAIN/ -> $CODE ; live $VER"
if [ "$RC" -eq 0 ] && [ "$CODE" = "200" ]; then
  devlog "DEPLOYED non-chat site to $DOMAIN via MCP hosting_deployStaticWebsite (archive $(basename "$ZIP")); verify 200, live $VER. site/chat NOT included."
  echo "OK: deployed + verified."
else
  devlog "MCP deploy to $DOMAIN uncertain (rc=$RC, http=$CODE) — see $RAW. Archive $(basename "$ZIP")."
  echo "CHECK: rc=$RC http=$CODE — see $RAW"
fi
