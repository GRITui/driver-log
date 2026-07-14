/* DriverLog — site/fleet.js
 *
 * Standalone fleet-owner console. Deliberately NOT a screen inside app.js's
 * bootApp()/enterApp() — those assume the mobile driver DOM (dashboard,
 * sessions, settings screens) is present and would throw on this page's
 * very different desktop layout. This duplicates the small pieces of
 * app.js it actually needs (auth cache read, apiFetch, toast) rather than
 * pulling in the whole driver app.
 */
const AUTH_CACHE_KEY = 'api_auth';
function readAuthCache() {
  try { return JSON.parse(localStorage.getItem(AUTH_CACHE_KEY)) || null; } catch { return null; }
}
async function apiFetch(path, opts = {}) {
  const auth = readAuthCache();
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (auth && auth.token) headers['Authorization'] = 'Bearer ' + auth.token;
  const res = await fetch(path, Object.assign({}, opts, { headers }));
  let body = null;
  try { body = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new Error((body && body.error) || ('Request failed: ' + res.status));
  return body;
}
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}
function fmt(n, dec = 0) {
  return Number(n || 0).toLocaleString('en', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

let currentFleetId = null;
let ownedFleets = [];
let currentPeriod = 'month';

function periodRange(period) {
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = new Date();
  if (period === 'week') {
    const start = new Date(today); start.setDate(today.getDate() - today.getDay());
    return { since: iso(start), until: iso(today) };
  }
  if (period === 'all') return { since: '2020-01-01', until: iso(today) };
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return { since: iso(start), until: iso(today) };
}

async function boot() {
  const auth = readAuthCache();
  if (!auth || !auth.token) { location.replace('/login.html'); return; }

  let my;
  try { my = await apiFetch('/api/fleet-my'); }
  catch (err) { renderError(err.message); return; }

  ownedFleets = my.owned || [];
  if (!ownedFleets.length) { renderNoFleets(); return; }

  const params = new URLSearchParams(location.search);
  currentFleetId = params.get('fleetId') || ownedFleets[0].id;
  if (!ownedFleets.some(f => f.id === currentFleetId)) currentFleetId = ownedFleets[0].id;

  await loadAndRender();
}

async function loadAndRender() {
  const { since, until } = periodRange(currentPeriod);
  let data;
  try { data = await apiFetch(`/api/fleet-dashboard?fleetId=${encodeURIComponent(currentFleetId)}&since=${since}&until=${until}`); }
  catch (err) { renderError(err.message); return; }
  renderDashboard(data);
}

function renderError(msg) {
  document.getElementById('fleet-shell').innerHTML = `<div class="fleet-empty-owner"><h2>Couldn't load fleet</h2><p>${escapeHtml(msg)}</p></div>`;
}

function renderNoFleets() {
  document.getElementById('fleet-shell').innerHTML = `
    <div class="fleet-empty-owner">
      <h2>You don't own a fleet yet</h2>
      <p>Create one to invite drivers and see aggregated earnings, trips, and fuel efficiency across your team.</p>
      <button class="btn-fleet-invite" onclick="createFleetFromEmptyState()">+ Create a fleet</button>
    </div>`;
}

async function createFleetFromEmptyState() {
  const name = (prompt("Fleet name:") || '').trim();
  if (!name) return;
  try { await apiFetch('/api/fleet-create', { method: 'POST', body: JSON.stringify({ name }) }); await boot(); }
  catch (err) { toast(err.message); }
}

function switchFleet(id) { currentFleetId = id; history.replaceState(null, '', `/fleet.html?fleetId=${id}`); loadAndRender(); }
function switchPeriod(p) { currentPeriod = p; loadAndRender(); }

async function inviteDriver() {
  const email = (prompt("Driver's email:") || '').trim().toLowerCase();
  if (!email) return;
  try { await apiFetch('/api/fleet-invite', { method: 'POST', body: JSON.stringify({ fleetId: currentFleetId, email }) }); toast('Invite sent!'); await loadAndRender(); }
  catch (err) { toast(err.message); }
}

function renderDashboard(data) {
  const { fleet, drivers, pendingInvites } = data;
  const totalRevenue = drivers.reduce((a, d) => a + d.revenue, 0);
  const totalNet = drivers.reduce((a, d) => a + d.netRevenue, 0);
  const totalTrips = drivers.reduce((a, d) => a + d.trips, 0);
  const totalDistance = drivers.reduce((a, d) => a + d.distance, 0);
  const totalLiters = drivers.reduce((a, d) => a + d.liters, 0);
  const fleetKmPerL = totalDistance > 0 && totalLiters > 0 ? totalDistance / totalLiters : null;
  const avgRevPerDriver = drivers.length ? totalRevenue / drivers.length : 0;
  const initial = (fleet.name || '?').trim().charAt(0).toUpperCase() || '?';

  const fleetSwitcher = ownedFleets.length > 1
    ? `<select class="fleet-select" onchange="switchFleet(this.value)">${ownedFleets.map(f => `<option value="${f.id}" ${f.id === currentFleetId ? 'selected' : ''}>${escapeHtml(f.name)}</option>`).join('')}</select>`
    : '';

  const rows = drivers.length
    ? drivers.map(d => `
      <tr>
        <td><div class="fleet-driver-cell"><div class="fleet-driver-avatar">${escapeHtml((d.firstName || '?').charAt(0).toUpperCase() || '?')}</div><div class="fleet-driver-name">${escapeHtml(d.firstName || d.email)}</div></div></td>
        <td class="num">${fmt(d.trips)}</td>
        <td class="num fleet-rev-strong">฿${fmt(d.revenue)}</td>
        <td class="num">฿${fmt(d.netRevenue)}</td>
        <td class="num">${d.kmPerL != null ? fmt(d.kmPerL, 1) : '—'}</td>
      </tr>`).join('')
    : `<tr><td colspan="5" class="fleet-empty">No active drivers yet — invite one to see stats here.</td></tr>`;

  const inviteRows = pendingInvites.length
    ? pendingInvites.map(p => `<div class="fleet-invite-row"><span>${escapeHtml(p.firstName || p.email)}</span><span class="fleet-invite-status">Awaiting response</span></div>`).join('')
    : `<div class="fleet-empty">No pending invites.</div>`;

  document.getElementById('fleet-shell').innerHTML = `
    <div class="fleet-topbar">
      <div class="fleet-brand">
        <div class="fleet-brand-mark">${escapeHtml(initial)}</div>
        <div>
          <div class="fleet-brand-name">${escapeHtml(fleet.name)}</div>
          <div class="fleet-brand-sub">${drivers.length} active driver${drivers.length === 1 ? '' : 's'}</div>
        </div>
        ${fleetSwitcher}
      </div>
      <div class="fleet-topbar-right">
        <select class="fleet-select" onchange="switchPeriod(this.value)">
          <option value="month" ${currentPeriod === 'month' ? 'selected' : ''}>This month</option>
          <option value="week" ${currentPeriod === 'week' ? 'selected' : ''}>This week</option>
          <option value="all" ${currentPeriod === 'all' ? 'selected' : ''}>All time</option>
        </select>
        <button class="btn-fleet-invite" onclick="inviteDriver()">+ Invite driver</button>
      </div>
    </div>

    <div class="fleet-stat-strip">
      <div class="stat-card"><div class="stat-label">Fleet revenue</div><div class="stat-val">฿${fmt(totalRevenue)}</div></div>
      <div class="stat-card"><div class="stat-label">Fleet net revenue</div><div class="stat-val">฿${fmt(totalNet)}</div></div>
      <div class="stat-card"><div class="stat-label">Total trips</div><div class="stat-val">${fmt(totalTrips)}</div></div>
      <div class="stat-card"><div class="stat-label">Avg revenue / driver</div><div class="stat-val">฿${fmt(avgRevPerDriver)}</div></div>
    </div>

    <div class="fleet-body-grid">
      <div>
        <div class="fleet-panel">
          <div class="fleet-panel-hd"><div class="fleet-panel-title">Driver leaderboard</div><div class="fleet-panel-note">Sorted by net revenue${fleetKmPerL != null ? ' · fleet avg ' + fmt(fleetKmPerL, 1) + ' km/L' : ''}</div></div>
          <div class="fleet-tbl-wrap">
            <table class="fleet-tbl">
              <thead><tr><th>Driver</th><th class="num">Trips</th><th class="num">Revenue</th><th class="num">Net</th><th class="num">km/L avg</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      </div>
      <div>
        <div class="fleet-panel">
          <div class="fleet-panel-hd"><div class="fleet-panel-title">Pending invites</div></div>
          ${inviteRows}
        </div>
        <div class="fleet-privacy-panel">
          <div class="fleet-privacy-hd">
            <div class="fleet-privacy-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3Z"/></svg></div>
            <div class="fleet-privacy-title">Every driver opts in, by name</div>
          </div>
          <ul class="fleet-privacy-list">
            <li>You see nothing until a driver accepts your invite</li>
            <li>They can leave any time — no approval needed from you</li>
            <li>You see session and fuel stats only, never their login</li>
          </ul>
        </div>
      </div>
    </div>`;
}

boot();
