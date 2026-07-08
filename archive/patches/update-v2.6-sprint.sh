#!/usr/bin/env bash
#
# DriverLog — Update v2.6 sprint (shell-driven, per FRAMEWORK.md)
#   • UX/Design Agent  — Dark mode (Light/Dark/Auto) in Settings → Preferences
#   • Support Agent    — In-app "Send feedback" (mailto) in Settings → About
#   • Data Analyst     — "Monthly" tax-ready CSV export (per-month totals + ฿/hour)
#   All localized EN/TH. No external services required.
#
# Safety: only READS/WRITES site/index.html and site/sw.js under its own folder.
# No destructive commands. Idempotent (re-run = safe no-op).
#
# Usage: chmod +x update-v2.6-sprint.sh && ./update-v2.6-sprint.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "==> DriverLog v2.6 sprint in: $ROOT"
python3 - "$ROOT" <<'PYEOF'
#!/usr/bin/env python3
# Patcher for DriverLog v2.6 sprint — dark mode + in-app feedback + monthly export.
import sys, io, re
ROOT = sys.argv[1]
IDX = ROOT + "/site/index.html"
SW  = ROOT + "/site/sw.js"

s = io.open(IDX, encoding="utf-8").read()
if 'id="set-theme"' in s:
    print("Already applied (found set-theme). Skipping index.html."); sys.exit(0)

edits = []
def E(old, new): edits.append((old, new))

# ── 1) UX/Design Agent: Dark mode CSS (variable overrides + a few hardcoded whites) ──
E('''  --radius:14px;--radius-sm:10px;--nav:60px;
}''',
  '''  --radius:14px;--radius-sm:10px;--nav:60px;
}
[data-theme="dark"]{
  --bg:#000000;--card:#1C1C1E;--border:#2C2C2E;--border-mid:#3A3A3C;
  --text:#F2F2F7;--text2:#D1D1D6;--text3:#8E8E93;--text4:#636366;--red-light:#3A1113;
}
[data-theme="dark"] .nav{background:rgba(28,28,30,.92);}
[data-theme="dark"] .svc-opt{background:#1C1C1E;color:var(--text2);}
[data-theme="dark"] .ad-slot{background:#1C1C1E;}
[data-theme="dark"] .auth-field input,[data-theme="dark"] select,[data-theme="dark"] input[type=date],[data-theme="dark"] input[type=time],[data-theme="dark"] input[type=number],[data-theme="dark"] input[type=email],[data-theme="dark"] input[type=password]{background:#1C1C1E;color:var(--text);}''')

# Appearance selector in Preferences (after Language row)
E('''      <div class="settings-row">
        <span class="settings-label" data-i18n="language">Language</span>
        <select id="set-lang" onchange="saveSetting('lang',this.value);applyLang()">
          <option value="en">English</option>
          <option value="th">ภาษาไทย</option>
        </select>
      </div>''',
  '''      <div class="settings-row">
        <span class="settings-label" data-i18n="language">Language</span>
        <select id="set-lang" onchange="saveSetting('lang',this.value);applyLang()">
          <option value="en">English</option>
          <option value="th">ภาษาไทย</option>
        </select>
      </div>
      <div class="settings-row">
        <span class="settings-label" data-i18n="appearance">Appearance</span>
        <select id="set-theme" onchange="setTheme(this.value)">
          <option value="light" data-i18n="theme_light">Light</option>
          <option value="dark" data-i18n="theme_dark">Dark</option>
          <option value="auto" data-i18n="theme_auto">Auto</option>
        </select>
      </div>''')

# theme helpers + apply on boot + set select value on enterApp
E('''// ─── ADS (P5 monetization — free for drivers, funded by ads) ──────────────''',
  '''// ─── THEME (dark mode) ────────────────────────────────────────────────────
function applyTheme() {
  const v = localStorage.getItem('ui_theme') || 'light';
  const dark = v === 'dark' || (v === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
function setTheme(v) { localStorage.setItem('ui_theme', v); applyTheme(); }

// ─── ADS (P5 monetization — free for drivers, funded by ads) ──────────────''')
E('''async function boot() {
  await openDB();''',
  '''async function boot() {
  applyTheme();
  await openDB();''')
E('''  document.getElementById('set-unit').value = settings.unit || 'km';''',
  '''  document.getElementById('set-unit').value = settings.unit || 'km';
  document.getElementById('set-theme').value = localStorage.getItem('ui_theme') || 'light';''')

# ── 2) Customer Support Agent: in-app feedback (mailto) ──
E('''      <a class="settings-row" href="/privacy.html" target="_blank" rel="noopener" style="text-decoration:none">
        <span class="settings-label" data-i18n="privacy_policy">Privacy policy</span>
        <span style="color:var(--red);font-size:15px;font-weight:700">↗</span>
      </a>''',
  '''      <a class="settings-row" href="mailto:grit4game@gmail.com?subject=DriverLog%20feedback" style="text-decoration:none">
        <span class="settings-label" data-i18n="send_feedback">Send feedback</span>
        <span style="color:var(--red);font-size:15px;font-weight:700">↗</span>
      </a>
      <a class="settings-row" href="/privacy.html" target="_blank" rel="noopener" style="text-decoration:none">
        <span class="settings-label" data-i18n="privacy_policy">Privacy policy</span>
        <span style="color:var(--red);font-size:15px;font-weight:700">↗</span>
      </a>''')

# ── 3) Data Analyst Agent: monthly / tax-ready CSV export ──
E('''      <div class="export-btns">
        <button onclick="exportCSV()">📊 CSV</button>
        <button onclick="exportImage()">📷 <span data-i18n="image_word">Image</span></button>
      </div>''',
  '''      <div class="export-btns">
        <button onclick="exportCSV()">📊 CSV</button>
        <button onclick="exportImage()">📷 <span data-i18n="image_word">Image</span></button>
        <button onclick="exportMonthlyCSV()">📅 <span data-i18n="monthly_word">Monthly</span></button>
      </div>''')
E('''function exportCSV() {''',
  '''function exportMonthlyCSV() {
  const by = {};
  sessions.forEach(s => {
    const m = (s.date || '').slice(0, 7); if (!m) return;
    if (!by[m]) by[m] = {sessions: 0, hours: 0, rev: 0, tip: 0, exp: 0, net: 0};
    by[m].sessions++; by[m].hours += sessionHours(s);
    by[m].rev += s.rev || 0; by[m].tip += s.tip || 0; by[m].exp += s.exp || 0; by[m].net += s.netRev || 0;
  });
  let csv = 'Month,Sessions,Hours,Revenue (฿),Tips (฿),Fuel (฿),Net (฿),Net per hour (฿)\\n';
  Object.keys(by).sort().forEach(m => {
    const o = by[m], ph = o.hours > 0 ? o.net / o.hours : 0;
    csv += `"${m}",${o.sessions},${o.hours.toFixed(2)},${o.rev},${o.tip},${o.exp},${o.net},${ph.toFixed(1)}\\n`;
  });
  const blob = new Blob([csv], {type: 'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `driver-monthly-${currentUser.username}-${todayISO()}.csv`;
  a.click();
  toast(t('exported'));
}

function exportCSV() {''')

# ── i18n keys (EN + TH) ──
E('''    ad_label: 'Sponsored', privacy_policy: 'Privacy policy'
  },''',
  '''    ad_label: 'Sponsored', privacy_policy: 'Privacy policy',
    appearance: 'Appearance', theme_light: 'Light', theme_dark: 'Dark', theme_auto: 'Auto',
    send_feedback: 'Send feedback', monthly_word: 'Monthly', exported: 'Exported!'
  },''')
E('''    ad_label: 'โฆษณา', privacy_policy: 'นโยบายความเป็นส่วนตัว'
  }
};''',
  '''    ad_label: 'โฆษณา', privacy_policy: 'นโยบายความเป็นส่วนตัว',
    appearance: 'ธีม', theme_light: 'สว่าง', theme_dark: 'มืด', theme_auto: 'อัตโนมัติ',
    send_feedback: 'ส่งความคิดเห็น', monthly_word: 'รายเดือน', exported: 'ส่งออกแล้ว!'
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

sw = io.open(SW, encoding="utf-8").read()
sw2 = re.sub(r"const SW_VERSION = 'v[0-9.]+';", "const SW_VERSION = 'v1.5.0';", sw, count=1)
if sw2 != sw: io.open(SW,"w",encoding="utf-8").write(sw2); print("sw.js bumped to v1.5.0.")
print("DONE.")
PYEOF
echo "==> Done (staged, not deployed)."
