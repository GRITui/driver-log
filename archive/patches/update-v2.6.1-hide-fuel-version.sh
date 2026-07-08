#!/usr/bin/env bash
#
# DriverLog — Update v2.6.1 (shell-driven, per FRAMEWORK.md)
#   • Localization — Thai "Sessions" label = "บันทึก" (already applied in i18n)
#   • Mobile Engineer — HIDE the Fuel refill nav entry (code fully retained; just display:none)
#   • Mobile Engineer/DevOps — show APP_VERSION in Settings → About (bump on every deploy)
#
# Safety: only READS/WRITES site/index.html + site/sw.js under its folder. No destructive
# commands. Idempotent (re-run = safe no-op).
# Usage: chmod +x update-v2.6.1-hide-fuel-version.sh && ./update-v2.6.1-hide-fuel-version.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "==> DriverLog v2.6.1 in: $ROOT"
python3 - "$ROOT" <<'PYEOF'
#!/usr/bin/env python3
# Patcher for DriverLog v2.6.1 — hide fuel feature (keep code) + version wiring.
import sys, io, re
ROOT = sys.argv[1]
IDX = ROOT + "/site/index.html"
SW  = ROOT + "/site/sw.js"
VERSION = "2.6.0"

s = io.open(IDX, encoding="utf-8").read()
if "const APP_VERSION" in s:
    print("Already applied (found APP_VERSION). Skipping index.html."); sys.exit(0)

edits = []
def E(old, new): edits.append((old, new))

# Localization note: Thai "Sessions" label is already 'บันทึก' — no change needed.

# Mobile Engineer: hide the Fuel refill nav entry (KEEP the screen + all fuel code intact)
E('''  <button class="nav-btn" id="nav-fuel" onclick="switchScreen('fuel')">''',
  '''  <button class="nav-btn" id="nav-fuel" onclick="switchScreen('fuel')" style="display:none">''')

# Mobile Engineer: version wiring — show APP_VERSION in Settings → About
E('''<div class="settings-row"><span class="settings-label" data-i18n="version">Version</span><span style="color:var(--text3)">2.0.0</span></div>''',
  '''<div class="settings-row"><span class="settings-label" data-i18n="version">Version</span><span id="app-version" style="color:var(--text3)">%s</span></div>''' % VERSION)
E('''const DB_NAME = 'gritdrive-v2', DB_VER = 2;''',
  '''const APP_VERSION = '%s';   // bump on every deploy
const DB_NAME = 'gritdrive-v2', DB_VER = 2;''' % VERSION)
E('''async function boot() {
  applyTheme();''',
  '''async function boot() {
  applyTheme();
  { const _v = document.getElementById('app-version'); if (_v) _v.textContent = APP_VERSION; }''')

missing = []
for old, new in edits:
    if old not in s: missing.append(old[:70])
    else: s = s.replace(old, new, 1)
if missing:
    print("PATCH FAILED — anchors not found:")
    for m in missing: print("  · " + repr(m))
    sys.exit(1)
io.open(IDX, "w", encoding="utf-8").write(s)
print("index.html patched (%d edits). Version = %s" % (len(edits), VERSION))

sw = io.open(SW, encoding="utf-8").read()
sw2 = re.sub(r"const SW_VERSION = 'v[0-9.]+';", "const SW_VERSION = 'v1.5.1';", sw, count=1)
if sw2 != sw: io.open(SW,"w",encoding="utf-8").write(sw2); print("sw.js bumped to v1.5.1.")
print("DONE.")
PYEOF
echo "==> Done."
