#!/usr/bin/env bash
#
# DriverLog — Update v2.4 (shell-driven, per FRAMEWORK.md)
#   P5 Monetization — add a responsive AdSense ad unit to the dashboard so the
#   app stays FREE for drivers (funded by ads, no subscription).
#
#   NOTE: the ad unit ships with a PLACEHOLDER slot id (data-ad-slot="0000000000").
#   Replace it with a real ad-unit slot id from your AdSense account
#   (publisher ca-pub-3349895945204021) — see MONETIZATION.md.
#
# Safety: only READS/WRITES site/index.html and site/sw.js under its own folder.
# No destructive commands. Idempotent (re-run = safe no-op).
#
# Usage: chmod +x update-v2.4-ads.sh && ./update-v2.4-ads.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "==> DriverLog v2.4 (ads) update in: $ROOT"
python3 - "$ROOT" <<'PYEOF'
#!/usr/bin/env python3
# Patcher for DriverLog v2.4 — P5 monetization (AdSense ad unit, no user subscription).
import sys, io, re
ROOT = sys.argv[1]
IDX = ROOT + "/site/index.html"
SW  = ROOT + "/site/sw.js"

s = io.open(IDX, encoding="utf-8").read()
if 'ad-slot' in s:
    print("Already applied (found ad-slot). Skipping index.html."); sys.exit(0)

edits = []
def E(old, new): edits.append((old, new))

# 1) CSS for the ad container (reserve height to avoid layout shift)
E('</style>',
  '''.ad-slot{margin:16px;background:#fff;border:1px solid var(--border,#eee);border-radius:14px;padding:8px 10px 10px;min-height:120px;overflow:hidden;}
.ad-label{font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:var(--text3,#999);margin-bottom:4px;text-align:center;}
</style>''')

# 2) Dashboard ad unit (after "Top earning days")
E('''    <div class="section-title" data-i18n="top_days">Top earning days</div>
    <div class="insight-card" id="day-insights"></div>''',
  '''    <div class="section-title" data-i18n="top_days">Top earning days</div>
    <div class="insight-card" id="day-insights"></div>
    <div class="ad-slot" id="ad-dash">
      <div class="ad-label" data-i18n="ad_label">Sponsored</div>
      <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-3349895945204021" data-ad-slot="0000000000" data-ad-format="auto" data-full-width-responsive="true"></ins>
    </div>''')

# 3) Fire the ad request once the dashboard is shown
E('''  switchScreen('dash');
  // pull cloud changes in the background (won't block first paint)''',
  '''  switchScreen('dash');
  pushAds();
  // pull cloud changes in the background (won't block first paint)''')

# 4) pushAds() helper (guarded, safe if AdSense is blocked/offline)
E('''// ─── START ─────────────────────────────────────────────────────────────
boot();''',
  '''// ─── ADS (P5 monetization — free for drivers, funded by ads) ──────────────
let _adsPushed = false;
function pushAds() {
  if (_adsPushed) return;
  try { (window.adsbygoogle = window.adsbygoogle || []).push({}); _adsPushed = true; } catch (e) {}
}

// ─── START ─────────────────────────────────────────────────────────────
boot();''')

# 5) i18n label
E('''    type_car: 'Car', type_bike: 'Bike', type_food: 'Food', type_express: 'Express'
  },''',
  '''    type_car: 'Car', type_bike: 'Bike', type_food: 'Food', type_express: 'Express',
    ad_label: 'Sponsored'
  },''')
E('''    type_car: 'รถยนต์', type_bike: 'มอเตอร์ไซค์', type_food: 'อาหาร', type_express: 'ส่งของ'
  }
};''',
  '''    type_car: 'รถยนต์', type_bike: 'มอเตอร์ไซค์', type_food: 'อาหาร', type_express: 'ส่งของ',
    ad_label: 'โฆษณา'
  }
};''')

missing = []
for old, new in edits:
    if old not in s: missing.append(old[:70])
    else: s = s.replace(old, new, 1)
if missing:
    print("PATCH FAILED — anchors not found:")
    for m in missing: print("  · " + repr(m))
    sys.exit(1)
io.open(IDX, "w", encoding="utf-8").write(s)
print("index.html patched (%d edits)." % len(edits))

# 6) bump service worker
sw = io.open(SW, encoding="utf-8").read()
sw2 = re.sub(r"const SW_VERSION = 'v[0-9.]+';", "const SW_VERSION = 'v1.4.0';", sw, count=1)
if sw2 != sw: io.open(SW,"w",encoding="utf-8").write(sw2); print("sw.js bumped to v1.4.0.")
else: print("sw.js version unchanged.")
print("DONE.")
PYEOF
echo "==> Done. Replace the placeholder ad slot id, then deploy site/."
