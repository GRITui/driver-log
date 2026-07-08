#!/usr/bin/env bash
#
# DriverLog — Update v2.3 (shell-driven, per FRAMEWORK.md)
#   • Session log: Start/End time snapped to 15-minute steps
#   • Night shift across dates (start 23:00 04 Jul → end 04:00 05 Jul)
#   • Service type → two levels: Provider (Grab/Lineman/Bolt/Shopee/Taxi) + Type (Car/Bike/Food/Express)
#
# Phase C (safety): this script only READS and WRITES three files under its own
# folder (site/index.html, site/sw.js, pocketbase/schema.pb.json). It runs NO
# destructive commands (no rm, mv, curl, chmod on other files). Idempotent:
# re-running after it's applied is a safe no-op.
#
# Usage:
#   chmod +x update-v2.3-provider-nightshift.sh
#   ./update-v2.3-provider-nightshift.sh
#
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "==> DriverLog v2.3 update in: $ROOT"
python3 - "$ROOT" <<'PYEOF'
#!/usr/bin/env python3
# Patcher for DriverLog v2.3 — provider/type + night-shift + 15-min step.
import sys, io
ROOT = sys.argv[1]
IDX = ROOT + "/site/index.html"
SW  = ROOT + "/site/sw.js"
SCHEMA = ROOT + "/pocketbase/schema.pb.json"

s = io.open(IDX, encoding="utf-8").read()
if 'data-prov=' in s:
    print("Already applied (found data-prov=). Skipping index.html."); sys.exit(0)

edits = []
def E(old, new): edits.append((old, new))

# --- CSS: provider selector 3 columns
E('.svc-selector{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px 14px;}',
  '.svc-selector{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px 14px;}\n.prov-selector{grid-template-columns:1fr 1fr 1fr;}')

# --- Modal: two-level provider + type
E('''      <div class="form-header" data-i18n="service_type">Service type</div>
      <div class="svc-selector">
        <div class="svc-opt sel" data-svc="GrabCar" onclick="selSvc(this)">\U0001F697 GrabCar</div>
        <div class="svc-opt" data-svc="GrabFood" onclick="selSvc(this)">\U0001F354 GrabFood</div>
        <div class="svc-opt" data-svc="GrabBike" onclick="selSvc(this)">\U0001F3CD️ GrabBike</div>
        <div class="svc-opt" data-svc="GrabExpress" onclick="selSvc(this)">\U0001F4E6 GrabExpress</div>
      </div>''',
  '''      <div class="form-header" data-i18n="select_provider">Select provider</div>
      <div class="svc-selector prov-selector">
        <div class="svc-opt sel" data-prov="Grab" onclick="selProv(this)">Grab</div>
        <div class="svc-opt" data-prov="Lineman" onclick="selProv(this)">Lineman</div>
        <div class="svc-opt" data-prov="Bolt" onclick="selProv(this)">Bolt</div>
        <div class="svc-opt" data-prov="Shopee" onclick="selProv(this)">Shopee</div>
        <div class="svc-opt" data-prov="Taxi" onclick="selProv(this)">Taxi</div>
      </div>
      <div class="form-header" data-i18n="service_type">Service type</div>
      <div class="svc-selector type-selector">
        <div class="svc-opt sel" data-type="Car" onclick="selType(this)">\U0001F697 <span data-i18n="type_car">Car</span></div>
        <div class="svc-opt" data-type="Bike" onclick="selType(this)">\U0001F3CD️ <span data-i18n="type_bike">Bike</span></div>
        <div class="svc-opt" data-type="Food" onclick="selType(this)">\U0001F354 <span data-i18n="type_food">Food</span></div>
        <div class="svc-opt" data-type="Express" onclick="selType(this)">\U0001F4E6 <span data-i18n="type_express">Express</span></div>
      </div>''')

# --- Modal: 15-min step + End date + inline duration
E('''      <div class="form-row">
        <div class="field-half"><label data-i18n="start_time">Start time</label><input type="time" id="s-start" oninput="calcDuration()"></div>
        <div class="field-half"><label data-i18n="end_time">End time</label><input type="time" id="s-end" oninput="calcDuration()"></div>
      </div>
      <div class="field" id="s-dur-wrap" style="display:none;margin-bottom:10px;">
        <span style="font-size:13px;color:var(--text3);"><span data-i18n="duration">Duration</span>: <b id="s-dur" style="color:var(--red)">—</b></span>
      </div>''',
  '''      <div class="form-row">
        <div class="field-half"><label data-i18n="start_time">Start time</label><input type="time" id="s-start" step="900" oninput="calcDuration()"></div>
        <div class="field-half"><label data-i18n="end_time">End time</label><input type="time" id="s-end" step="900" oninput="calcDuration()"></div>
      </div>
      <div class="form-row">
        <div class="field-half"><label data-i18n="end_date">End date</label><input type="date" id="s-enddate" oninput="calcDuration()"></div>
        <div class="field-half" style="display:flex;align-items:flex-end;padding-bottom:10px;"><span style="font-size:13px;color:var(--text3);"><span data-i18n="duration">Duration</span>: <b id="s-dur" style="color:var(--red)">—</b></span></div>
      </div>''')

# --- Service maps → type maps + provider helpers
E('''const SVC_ICON = {GrabCar:'\U0001F697',GrabFood:'\U0001F354',GrabBike:'\U0001F3CD️',GrabExpress:'\U0001F4E6'};
const SVC_COLOR = {GrabCar:'#FEF3C7',GrabFood:'#DBEAFE',GrabBike:'#FCE7F3',GrabExpress:'#D1FAE5'};''',
  '''const TYPE_ICON = {Car:'\U0001F697',Bike:'\U0001F3CD️',Food:'\U0001F354',Express:'\U0001F4E6'};
const TYPE_COLOR = {Car:'#FEF3C7',Bike:'#FCE7F3',Food:'#DBEAFE',Express:'#D1FAE5'};
const PROVIDERS = ['Grab','Lineman','Bolt','Shopee','Taxi'];
// Split legacy combined serviceType ("GrabCar") -> {provider,type}; new records store both.
function normSvc(s) {
  if (s && s.provider) return {provider: s.provider, type: s.serviceType || 'Car'};
  const st = (s && s.serviceType) || '';
  for (const p of PROVIDERS) { if (st.startsWith(p)) return {provider: p, type: st.slice(p.length) || 'Car'}; }
  return {provider: 'Grab', type: st || 'Car'};
}
function typeLabel(type) { return t('type_' + String(type).toLowerCase()) || type; }
function svcLabel(s) { const n = normSvc(s); return `${n.provider} ${typeLabel(n.type)}`; }
const SVC_ICON = TYPE_ICON, SVC_COLOR = TYPE_COLOR;''')

# --- renderSvcBreakdown → by provider
E('''  const byType = {};
  filtered.forEach(s => {
    byType[s.serviceType] = (byType[s.serviceType]||0) + s.rev + (s.tip||0);
  });
  const el = document.getElementById('svc-breakdown');
  if (Object.keys(byType).length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([k,v]) =>
    `<div class="svc-pill"><span class="svc-name">${SVC_ICON[k]||'\U0001F697'} ${k.replace('Grab','')}</span><span class="svc-amt">฿${fmt(v)}</span></div>`
  ).join('');''',
  '''  const byProv = {};
  filtered.forEach(s => {
    const p = normSvc(s).provider;
    byProv[p] = (byProv[p]||0) + s.rev + (s.tip||0);
  });
  const el = document.getElementById('svc-breakdown');
  if (Object.keys(byProv).length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = Object.entries(byProv).sort((a,b)=>b[1]-a[1]).map(([k,v]) =>
    `<div class="svc-pill"><span class="svc-name">${k}</span><span class="svc-amt">฿${fmt(v)}</span></div>`
  ).join('');''')

# --- session row icon + title
E('''          <div class="list-icon" style="background:${SVC_COLOR[s.serviceType]||'#F2F2F7'}">${SVC_ICON[s.serviceType]||'\U0001F697'}</div>''',
  '''          <div class="list-icon" style="background:${TYPE_COLOR[normSvc(s).type]||'#F2F2F7'}">${TYPE_ICON[normSvc(s).type]||'\U0001F697'}</div>''')
E('''            <div class="list-title">${s.serviceType} · ${fmtDate(s.date)}</div>''',
  '''            <div class="list-title">${svcLabel(s)} · ${fmtDate(s.date)}</div>''')

# --- openEditSession: end date + provider/type selection
E('''  document.getElementById('s-start').value = s.startTime || '';
  document.getElementById('s-end').value = s.endTime || '';
  document.getElementById('s-dist').value = s.distance;''',
  '''  document.getElementById('s-start').value = s.startTime || '';
  document.getElementById('s-end').value = s.endTime || '';
  document.getElementById('s-enddate').value = s.endDate || s.date || '';
  document.getElementById('s-dist').value = s.distance;''')
E('''  document.querySelectorAll('.svc-opt').forEach(o => o.classList.remove('sel'));
  const svcEl = document.querySelector(`.svc-opt[data-svc="${s.serviceType}"]`);
  if (svcEl) svcEl.classList.add('sel');
  document.getElementById('modal-session').classList.add('open');''',
  '''  const nrm = normSvc(s);
  document.querySelectorAll('.svc-opt').forEach(o => o.classList.remove('sel'));
  (document.querySelector(`.prov-selector .svc-opt[data-prov="${nrm.provider}"]`) || document.querySelector('.prov-selector .svc-opt')).classList.add('sel');
  (document.querySelector(`.type-selector .svc-opt[data-type="${nrm.type}"]`) || document.querySelector('.type-selector .svc-opt')).classList.add('sel');
  calcDuration();
  document.getElementById('modal-session').classList.add('open');''')

# --- openAddSession: defaults
E('''  document.getElementById('s-start').value = '';
  document.getElementById('s-end').value = '';
  document.getElementById('s-dur-wrap').style.display = 'none';
  document.getElementById('s-dist').value = '';''',
  '''  document.getElementById('s-start').value = '';
  document.getElementById('s-end').value = '';
  document.getElementById('s-enddate').value = todayISO();
  document.getElementById('s-dur').textContent = '—';
  document.getElementById('s-dist').value = '';''')
E('''  document.querySelectorAll('.svc-opt').forEach(o => o.classList.remove('sel'));
  document.querySelector('.svc-opt[data-svc="GrabCar"]').classList.add('sel');
  document.getElementById('modal-session').classList.add('open');''',
  '''  document.querySelectorAll('.svc-opt').forEach(o => o.classList.remove('sel'));
  document.querySelector('.prov-selector .svc-opt[data-prov="Grab"]').classList.add('sel');
  document.querySelector('.type-selector .svc-opt[data-type="Car"]').classList.add('sel');
  document.getElementById('modal-session').classList.add('open');''')

# --- selSvc → selProv/selType
E('''function selSvc(el) {
  document.querySelectorAll('.svc-opt').forEach(o => o.classList.remove('sel'));
  el.classList.add('sel');
}''',
  '''function selProv(el) {
  el.closest('.prov-selector').querySelectorAll('.svc-opt').forEach(o => o.classList.remove('sel'));
  el.classList.add('sel');
}
function selType(el) {
  el.closest('.type-selector').querySelectorAll('.svc-opt').forEach(o => o.classList.remove('sel'));
  el.classList.add('sel');
}''')

# --- duration helpers: cross-date aware
E('''function durationHours(start, end) {
  const a = parseHM(start), b = parseHM(end);
  if (a == null || b == null) return 0;
  let d = b - a;
  if (d < 0) d += 1440;          // crossed midnight (overnight shift)
  return d / 60;
}
function sessionHours(s) { return durationHours(s.startTime, s.endTime); }
function fmtHours(h) {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return curLang() === 'th' ? `${hh} ชม. ${mm} นาที` : `${hh}h ${mm}m`;
}
function calcDuration() {
  const st = document.getElementById('s-start').value;
  const en = document.getElementById('s-end').value;
  const wrap = document.getElementById('s-dur-wrap');
  const h = durationHours(st, en);
  if (st && en && h > 0) { wrap.style.display = 'block'; document.getElementById('s-dur').textContent = fmtHours(h); }
  else { wrap.style.display = 'none'; }
}''',
  '''function durationHours(start, end) {   // legacy same-day helper (kept for safety)
  const a = parseHM(start), b = parseHM(end);
  if (a == null || b == null) return 0;
  let d = b - a; if (d < 0) d += 1440;
  return d / 60;
}
// Cross-date aware: uses start date + end date so a night shift spanning midnight is exact.
function sessionHours(s) {
  if (!s.startTime || !s.endTime) return 0;
  const sd = s.date, ed = s.endDate || s.date;
  const start = new Date(`${sd}T${s.startTime}:00`);
  let end = new Date(`${ed}T${s.endTime}:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  if (end <= start) end = new Date(end.getTime() + 86400000);  // safety net if end date not advanced
  return (end - start) / 3600000;
}
function fmtHours(h) {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return curLang() === 'th' ? `${hh} ชม. ${mm} นาที` : `${hh}h ${mm}m`;
}
function calcDuration() {
  const sd = document.getElementById('s-date').value;
  const st = document.getElementById('s-start').value;
  const en = document.getElementById('s-end').value;
  const edEl = document.getElementById('s-enddate');
  const durEl = document.getElementById('s-dur');
  if (!(sd && st && en)) { if (durEl) durEl.textContent = '—'; return; }
  let ed = edEl.value || sd;
  if (en <= st && ed === sd) {              // shift crosses midnight -> next day
    const nd = new Date(sd + 'T00:00:00'); nd.setDate(nd.getDate() + 1);
    ed = isoOf(nd); edEl.value = ed;
  }
  if (!edEl.value) edEl.value = ed;
  const h = sessionHours({date: sd, startTime: st, endDate: ed, endTime: en});
  if (durEl) durEl.textContent = h > 0 ? fmtHours(h) : '—';
}''')

# --- saveSession: provider + type + endDate
E('''  const svcEl = document.querySelector('.svc-opt.sel');
  const svc = svcEl ? svcEl.dataset.svc : 'GrabCar';
  const date = document.getElementById('s-date').value;
  const startTime = document.getElementById('s-start').value || '';
  const endTime = document.getElementById('s-end').value || '';''',
  '''  const provEl = document.querySelector('.prov-selector .svc-opt.sel');
  const typeEl = document.querySelector('.type-selector .svc-opt.sel');
  const provider = provEl ? provEl.dataset.prov : 'Grab';
  const svc = typeEl ? typeEl.dataset.type : 'Car';
  const date = document.getElementById('s-date').value;
  const startTime = document.getElementById('s-start').value || '';
  const endTime = document.getElementById('s-end').value || '';
  const endDate = document.getElementById('s-enddate').value || date;''')
E('''  const obj = {uid, serviceType:svc, date, startTime, endTime, distance:dist, consumption:cons, oilPrice:oil, exp, rev, tip, netRev: rev+tip-exp};''',
  '''  const obj = {uid, provider, serviceType:svc, date, endDate, startTime, endTime, distance:dist, consumption:cons, oilPrice:oil, exp, rev, tip, netRev: rev+tip-exp};''')

# --- sync toServer / fromServer
E('''    serviceType: rec.serviceType, date: rec.date, startTime: rec.startTime || '', endTime: rec.endTime || '',''',
  '''    provider: rec.provider || '', serviceType: rec.serviceType, date: rec.date, endDate: rec.endDate || '', startTime: rec.startTime || '', endTime: rec.endTime || '',''')
E('''  if (store === 'sessions') rec = { serviceType: sr.serviceType, date: sr.date, startTime: sr.startTime || '', endTime: sr.endTime || '', distance: sr.distance,''',
  '''  if (store === 'sessions') rec = { provider: sr.provider || '', serviceType: sr.serviceType, date: sr.date, endDate: sr.endDate || '', startTime: sr.startTime || '', endTime: sr.endTime || '', distance: sr.distance,''')

# --- i18n EN + TH additions
E('''    image_exported: 'Image saved!', image_export_fail: 'Could not export image'
  },''',
  '''    image_exported: 'Image saved!', image_export_fail: 'Could not export image',
    select_provider: 'Select provider', end_date: 'End date',
    type_car: 'Car', type_bike: 'Bike', type_food: 'Food', type_express: 'Express'
  },''')
E('''    image_exported: 'บันทึกรูปแล้ว!', image_export_fail: 'ส่งออกรูปไม่สำเร็จ'
  }
};''',
  '''    image_exported: 'บันทึกรูปแล้ว!', image_export_fail: 'ส่งออกรูปไม่สำเร็จ',
    select_provider: 'เลือกผู้ให้บริการ', end_date: 'วันที่สิ้นสุด',
    type_car: 'รถยนต์', type_bike: 'มอเตอร์ไซค์', type_food: 'อาหาร', type_express: 'ส่งของ'
  }
};''')

# CSV (raw strings because JS source contains literal backslash-n)
E(r'''  let csv = 'Date,Service,Distance (km),Consumption (km/L),Fuel Expense (฿),Revenue (฿),Tips (฿),Net Revenue (฿)\n';'''.replace('\\u0E3F','฿'),
  r'''  let csv = 'Date,End date,Start,End,Provider,Type,Distance (km),Consumption (km/L),Fuel Expense (฿),Revenue (฿),Tips (฿),Net Revenue (฿)\n';'''.replace('\\u0E3F','฿'))
E(r'''    csv += `"${s.date}","${s.serviceType}",${s.distance},${s.consumption},${s.exp},${s.rev},${s.tip||0},${s.netRev||0}\n`;''',
  r'''    const n = normSvc(s); csv += `"${s.date}","${s.endDate||s.date}","${s.startTime||''}","${s.endTime||''}","${n.provider}","${n.type}",${s.distance},${s.consumption},${s.exp},${s.rev},${s.tip||0},${s.netRev||0}\n`;''')

# apply
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

# --- schema: add endDate + provider
sc = io.open(SCHEMA, encoding="utf-8").read()
if '"provider"' not in sc:
    a = '      { "name": "date", "type": "text", "required": false, "options": { "max": 20 } },\n      { "name": "startTime"'
    b = '      { "name": "date", "type": "text", "required": false, "options": { "max": 20 } },\n      { "name": "endDate", "type": "text", "required": false, "options": { "max": 20 } },\n      { "name": "provider", "type": "text", "required": false, "options": { "max": 20 } },\n      { "name": "startTime"'
    if a in sc:
        sc = sc.replace(a, b, 1); io.open(SCHEMA,"w",encoding="utf-8").write(sc); print("schema.pb.json patched.")
    else: print("schema anchor not found (skipped).")
else:
    print("schema already has provider (skipped).")

# --- bump service worker
sw = io.open(SW, encoding="utf-8").read()
import re
sw2 = re.sub(r"const SW_VERSION = 'v[0-9.]+';", "const SW_VERSION = 'v1.3.0';", sw, count=1)
if sw2 != sw: io.open(SW,"w",encoding="utf-8").write(sw2); print("sw.js bumped to v1.3.0.")
else: print("sw.js version unchanged.")
print("DONE.")
PYEOF
echo "==> Done. Review site/index.html, then deploy the site/ folder."
