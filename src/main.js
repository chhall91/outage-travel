import { ico } from './icons.js';
import './style.css';
import plants from './data/plants.json';
import perdiem from './data/perdiem.json';
import upcoming from './data/upcoming.json';
import { downNow, upcomingOnly } from './lib/outlists.js';
import { get, set, outages, posts, notes, ratings } from './storage.js';
import { DIMS, newRating, aggregate, mergeRating, decodeRating, ratingShareUrl, stars } from './lib/ratings.js';
import { SECTIONS, mapsSearch, yelpSearch, newNote, decodeNotes, mergeNotes, notesShareUrl } from './lib/local.js';
import { lookupRate, weeklyPay, outageWeeks } from './lib/perdiem.js';
import { milesBetween, driveEstimate, fmtDrive } from './lib/geo.js';
import { housingLinks, refTown, mapUrl, directionsUrl, stateName } from './lib/links.js';
import { KINDS, newPost, editPost, claimPost, reopenPost, mergePost, shareUrl, decodePost, uid } from './lib/board.js';
import { NRC_STATUS_URL, NRC_STATUS_PAGE, parseStatus, unitState } from './lib/status.js';
import qrcode from 'qrcode-generator';
import { makeForum } from './forum-ui.js';

const VERSION = '0.1.0';
const BASE = import.meta.env.BASE_URL;
const plantById = Object.fromEntries(plants.map((p) => [p.id, p]));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const money2 = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

const app = document.getElementById('app');
app.innerHTML = `
  <header class="bar">
    <button class="icon-btn" id="back" aria-label="Back" hidden>‹</button>
    <div class="brand" aria-hidden="true"><span class="mark"></span></div><h1 id="title">Outage Travel</h1>
    <button class="icon-btn" id="theme" aria-label="Toggle theme">${ico("theme")}</button>
  </header>
  <main id="view" tabindex="-1"></main>
  <nav class="tabbar">
    <a href="#/" data-nav="home"><span>${ico("home")}</span>My outages</a>
    <a href="#/down" data-nav="down"><span>${ico("offline")}</span>Offline</a>
    <a href="#/upcoming" data-nav="upcoming"><span>${ico("calendar")}</span>Upcoming</a>
    <a href="#/plants" data-nav="plants"><span>${ico("plant")}</span>Plants</a>
    <a href="#/about" data-nav="about"><span>${ico("info")}</span>About</a>
  </nav>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>`;
document.body.classList.add('no-ad');
const view = document.getElementById('view');
const $ = (id) => document.getElementById(id);

const applyTheme = (t) => { document.documentElement.dataset.theme = t; document.querySelector('meta[name=theme-color]').setAttribute('content', t === 'light' ? '#ffffff' : '#0b1220'); };
applyTheme(get('ot.theme', 'dark'));
$('theme').onclick = () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; set('ot.theme', t); applyTheme(t); };
let tt; function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 1900); }
$('back').onclick = () => { if (history.length > 1) history.back(); else location.hash = '#/'; };
function chrome(title, { back = false, nav = '' } = {}) {
  $('title').textContent = title; $('back').hidden = !back;
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.nav === nav));
}

// ---------- NRC reactor status: live (if CORS allows) → repo snapshot → cached copy ----------
let status = get('ot.status', null);
let statusFrom = status ? 'saved copy' : '';
async function loadStatus() {
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);
  try {
    const r = await withTimeout(fetch(NRC_STATUS_URL, { cache: 'no-store' }), 5000);
    const t = await r.text();
    if (r.ok && t.startsWith('ReportDt|')) { const s = parseStatus(t); if (!status || s.reportDate >= status.reportDate) { status = s; statusFrom = 'NRC (live)'; set('ot.status', s); return true; } }
  } catch { /* nrc.gov does not send CORS headers; fall through */ }
  try {
    const r = await withTimeout(fetch(BASE + 'reactor-status.json', { cache: 'no-cache' }), 8000);
    const s = await r.json();
    if (!status || s.reportDate >= status.reportDate) { status = s; statusFrom = 'NRC daily snapshot (auto-updated)'; set('ot.status', s); return true; }
  } catch { /* offline */ }
  return false;
}
loadStatus().then((changed) => { if (changed) render(); });

const unitRow = (u) => {
  const s = status?.units?.[u]; const st = unitState(s);
  let extra = '';
  if (s?.downSince) extra = ` · down ${s.sinceAtLeast ? 'since at least' : 'since'} ${fmtDate(s.downSince)} (${daysBetween(s.downSince, status.reportDate) + 1} d)`;
  return `<div class="unit"><span class="dot ${st.cls}"></span><b>${esc(u)}</b><span class="st ${st.cls}">${st.label}${extra}</span></div>`;
};
const statusLine = () => status ? `<p class="hint">NRC Power Reactor Status Report for <b>${fmtDate(status.reportDate)}</b> · ${esc(statusFrom)} · <a href="${NRC_STATUS_PAGE}" target="_blank" rel="noopener">source</a></p>` : '<p class="hint">Reactor status not loaded yet (needs one connection).</p>';
const plantUpcoming = (pid) => upcoming.outages.filter((o) => o.plant === pid && (o.end || o.start) >= today());

// ---------- views ----------
function home() {
  chrome('My outages', { nav: 'home' });
  const list = outages.all().sort((a, b) => (a.start || '9') < (b.start || '9') ? -1 : 1);
  const offline = status ? plants.flatMap((p) => p.units.filter((u) => status.units[u]?.power === 0).map((u) => ({ p, u, s: status.units[u] }))) : [];
  view.innerHTML = `
    ${list.length ? `<div class="olist">${list.map((o) => { const p = plantById[o.plantId]; if (!p) return ''; const down = p.units.filter((u) => status?.units?.[u]?.power === 0).length;
      return `<a class="ocard" href="#/o/${o.id}"><div class="ohead"><b>${esc(p.name)}</b>${down ? `<span class="pill bad">${down} unit${down > 1 ? 's' : ''} offline</span>` : ''}</div>
        <div class="osub">${esc(p.city)}, ${p.state} · ${o.start ? fmtDate(o.start) : 'dates TBD'}${o.end ? ' – ' + fmtDate(o.end) : ''}</div>
        ${o.company ? `<div class="osub">${esc(o.company)}</div>` : ''}<span class="chev">›</span></a>`; }).join('')}</div>`
      : `<div class="card empty"><div class="big">${ico("plant","ico xl")}</div><h2>Where’s your next outage?</h2><p class="hint">Add it once — housing, per diem & pay, and the crew board all open from it.</p></div>`}
    <a class="btn primary" href="#/add">${ico("plus")} Add an outage</a>
    <a class="ocard mt" href="#/forum" id="home-forum"><div class="ohead"><b class="ih">${ico("forum")} Forum</b>${forum.enabled ? '' : '<span class="pill">Coming soon</span>'}</div><div class="osub">Plant boards + overall: housing, food, rides, work & pay</div><span class="chev">›</span></a>
    <div class="card mt"><h3><span class="ih"><i class="sdot bad"></i>Offline</span> <small>${offline.length} units</small></h3>
      ${offline.length ? offline.map(({ p, u }) => `<a class="row-link" href="#/plant/${p.id}">${unitRow(u)}</a>`).join('') : '<p class="hint">None offline in the latest report.</p>'}
      ${statusLine()}
      <p class="hint">0% power = shut down. That includes refueling outages, maintenance and other shutdowns. The report doesn’t say which.</p>
      <a class="btn-link mt" href="#/down">See all offline ›</a> · <a class="btn-link mt" href="#/upcoming">Upcoming outages ›</a>
    </div>`;
}

function plantPicker(selected, onPick) {
  return `<label class="field"><span class="lbl">Plant</span><input type="text" id="pq" placeholder="Search plant, town, state, owner…" autocomplete="off" value=""></label>
  <div id="plist" class="plist"></div>`;
}
function wirePicker(onPick, highlight) {
  const draw = () => {
    const q = $('pq').value.trim().toLowerCase();
    const l = plants.filter((p) => !q || [p.name, p.city, p.state, stateName(p.state), p.owner, p.nrcLocation, ...p.units].join(' ').toLowerCase().includes(q));
    $('plist').innerHTML = l.map((p) => { const down = p.units.filter((u) => status?.units?.[u]?.power === 0).length;
      return `<button type="button" class="pitem ${p.id === highlight ? 'on' : ''}" data-id="${p.id}"><b>${esc(p.name)}</b>${down ? `<span class="pill bad">${down} offline</span>` : ''}<small>${esc(p.city)}, ${p.state} · ${esc(p.owner)}</small></button>`; }).join('') || '<p class="hint">No match.</p>';
  };
  $('pq').oninput = draw; draw();
  $('plist').onclick = (e) => { const b = e.target.closest('.pitem'); if (b) onPick(b.dataset.id); };
}

function outageForm(o, isNew) {
  chrome(isNew ? 'Add outage' : 'Edit outage', { back: true, nav: 'home' });
  let pid = o.plantId;
  const drawForm = () => {
    const p = plantById[pid];
    if (!p) { view.innerHTML = `<div class="card"><h3>1 · Pick the plant</h3>${plantPicker()}</div>`; wirePicker((id) => { pid = id; drawForm(); }); return; }
    const ups = plantUpcoming(pid);
    view.innerHTML = `<form id="f" class="card">
      <h3>${isNew ? '2 · Outage details' : 'Outage details'}</h3>
      <div class="picked"><div><b>${esc(p.name)}</b><small>${esc(p.city)}, ${p.state} · ${p.units.length} unit${p.units.length > 1 ? 's' : ''}</small></div><button type="button" class="btn-sm" id="chg">Change</button></div>
      ${ups.length ? `<div class="srcbox"><b>Published outage dates:</b>${ups.map((u, i) => `<button type="button" class="btn-sm use" data-i="${i}">${esc(u.unit)} ${esc(u.label)}: ${fmtDate(u.start)}${u.end ? ' – ' + fmtDate(u.end) : ''}</button>`).join('')}<small>Source: ${ups.map((u) => `<a href="${upcoming.sources[u.src].url}" target="_blank" rel="noopener">${esc(upcoming.sources[u.src].name.split(' — ')[0])}</a>`).filter((v, i, a) => a.indexOf(v) === i).join(', ')}. Tap one to fill the dates in.</small></div>` : ''}
      <div class="row gap"><label class="field grow"><span class="lbl">Start</span><input type="date" id="start" value="${esc(o.start || '')}"></label>
      <label class="field grow"><span class="lbl">End</span><input type="date" id="end" value="${esc(o.end || '')}"></label></div>
      <label class="field"><span class="lbl">Unit(s)</span><div class="chips">${p.units.map((u) => `<label class="chip"><input type="checkbox" name="u" value="${esc(u)}" ${(o.units || []).includes(u) ? 'checked' : ''}>${esc(u)}</label>`).join('')}</div></label>
      <label class="field"><span class="lbl">Company / contractor</span><input type="text" id="company" maxlength="80" value="${esc(o.company || '')}" placeholder="Who you’re working for"></label>
      <label class="field"><span class="lbl">Notes</span><textarea id="notes" rows="3" maxlength="1000" placeholder="Shift, hall, reporting day… (keep plant security details off your phone)">${esc(o.notes || '')}</textarea></label>
      <button class="btn primary" type="submit">${isNew ? 'Save outage' : 'Save changes'}</button>
      ${isNew ? '' : '<button class="btn danger mt" type="button" id="del">Delete outage</button>'}
    </form>`;
    $('chg').onclick = () => { pid = null; drawForm(); };
    view.querySelectorAll('.use').forEach((b) => (b.onclick = () => { const u = ups[+b.dataset.i]; $('start').value = u.start; $('end').value = u.end || ''; view.querySelectorAll('input[name=u]').forEach((c) => { c.checked = c.value === u.unit; }); }));
    $('f').onsubmit = (e) => {
      e.preventDefault();
      const now = Date.now();
      const rec = { ...o, id: o.id || uid(), plantId: pid, start: $('start').value, end: $('end').value, units: [...view.querySelectorAll('input[name=u]:checked')].map((c) => c.value),
        company: $('company').value.trim(), notes: $('notes').value.trim(), createdAt: o.createdAt || now, updatedAt: now, ver: (o.ver || 0) + 1 };
      if (rec.start && rec.end && rec.end < rec.start) { toast('End date is before start'); return; }
      outages.put(rec); toast('Saved'); location.replace(`#/o/${rec.id}`);
    };
    if (!isNew) $('del').onclick = () => { if (confirm('Delete this outage? Crew posts for it stay on this phone.')) { outages.remove(o.id); location.replace('#/'); } };
  };
  drawForm();
}

function hub(o) {
  const p = plantById[o.plantId];
  chrome(p.name, { back: true, nav: 'home' });
  const r = lookupRate(perdiem, p.state, p.county, o.start || today());
  const n = posts.all().filter((x) => x.outageId === o.id && !x.deleted && x.status === 'open').length;
  const units = o.units?.length ? o.units : p.units;
  const daysTo = o.start ? daysBetween(today(), o.start) : null;
  view.innerHTML = `
    <div class="card hero"><div class="osub">${esc(p.city)}, ${esc(stateName(p.state))} · ${esc(p.owner)}</div>
      <div class="dates">${o.start ? fmtDate(o.start) : 'Dates TBD'}${o.end ? ' – ' + fmtDate(o.end) : ''}</div>
      ${daysTo != null ? `<div class="osub">${daysTo > 0 ? `Starts in ${daysTo} day${daysTo === 1 ? '' : 's'}` : o.end && o.end < today() ? 'Finished' : 'In progress'}${o.start && o.end ? ` · ${outageWeeks(o.start, o.end)} weeks` : ''}</div>` : ''}
      ${o.company ? `<div class="osub">${esc(o.company)}</div>` : ''}
      <div class="units">${units.map(unitRow).join('')}</div>
      ${status ? `<p class="hint">NRC report ${fmtDate(status.reportDate)}</p>` : ''}
    </div>
    <div class="grid">
      <a class="tile big" href="#/o/${o.id}/housing"><span class="t-ico">${ico("bed")}</span><b>Find a room</b><small>Airbnb, Furnished Finder, hotels, RV parks</small></a>
      <a class="tile big" href="#/o/${o.id}/pay"><span class="t-ico">${ico("pay")}</span><b>Pay & per diem</b><small>GSA FY${r.fy}: ${money(r.lodging)} + ${money(r.mie)}/day</small></a>
      <a class="tile big" href="#/o/${o.id}/board"><span class="t-ico">${ico("crew")}</span><b>Crew board</b><small>${n ? `${n} open post${n > 1 ? 's' : ''}` : 'Rooms & rides'}</small></a>
      <a class="tile big" href="#/plant/${p.id}"><span class="t-ico">${ico("plant")}</span><b>Plant info</b><small>Units, owner, status history</small></a>
      <a class="tile big" href="#/forum/${p.id}"><span class="t-ico">${ico("forum")}</span><b>Forum</b><small>${forum.enabled ? 'Talk with other travelers' : 'Coming soon'}</small></a>
      <a class="tile big" href="#/o/${o.id}/local"><span class="t-ico">${ico("food")}</span><b>Food & local</b><small>${(() => { const k = notes.all().filter((x) => x.outageId === o.id).length; return k ? `${k} saved spot${k > 1 ? 's' : ''} · ` : ''; })()}Diners, 24-hr food, laundry, gyms, boots</small></a>
    </div>
    ${ratingSummary(p, true)}
    ${o.notes ? `<div class="card"><h3>Notes</h3><p class="pre">${esc(o.notes)}</p></div>` : ''}
    <a class="btn ghost" href="#/o/${o.id}/edit">Edit outage</a>`;
}

function housing(o) {
  const p = plantById[o.plantId];
  chrome('Find a room', { back: true, nav: 'home' });
  const town = refTown(p.nrcLocation);
  let miles = get('ot.radius', 25), from = get('ot.from', '');
  const draw = () => {
    const links = housingLinks(p, { miles, checkin: o.start, checkout: o.end, town: town || undefined });
    const refPlant = town ? null : null;
    view.innerHTML = `
      <div class="card"><div class="osub">Searches centered on <b>${esc(p.name)}</b> (${p.lat.toFixed(4)}, ${p.lon.toFixed(4)})${o.start ? ` · ${fmtDate(o.start)} – ${fmtDate(o.end) || '?'}` : ''}</div>
        <span class="lbl mt">How far will you drive?</span>
        <div class="seg" id="rad">${[10, 25, 40, 60].map((m) => `<button type="button" class="${m === miles ? 'on' : ''}" data-v="${m}">${m} mi</button>`).join('')}</div>
        <p class="hint">${miles} mi straight-line ≈ ${fmtDrive(driveEstimate(miles).minutes)} drive (rough: ×1.3 road factor at 45 mph). ${town ? `Nearest bigger town per NRC: <b>${esc(town.city)}, ${town.st}</b>.` : ''}</p>
      </div>
      <div class="links">${links.map((l) => `<a class="lcard" href="${esc(l.url)}" target="_blank" rel="noopener"><b>${esc(l.name)}</b><small>${esc(l.note)}</small><span class="chev">↗</span></a>`).join('')}</div>
      <div class="card"><h3>Distance from a place you found</h3>
        <label class="field"><span class="lbl">Paste coordinates (lat, lon) from the listing’s map</span><input type="text" id="ll" placeholder="43.4553, -76.5105" inputmode="decimal" value="${esc(get('ot.ll', ''))}"></label>
        <div id="dist" class="result"></div>
        <label class="field"><span class="lbl">Or get directions from an address</span><input type="text" id="from" placeholder="Street, town" value="${esc(from)}"></label>
        <a class="btn ghost" id="dir" target="_blank" rel="noopener" href="#">Open driving directions ↗</a>
      </div>
      <p class="fine">These buttons open the real sites. This app shows no listings and doesn’t make any up. Check the price, dates, and host yourself before you pay.</p>`;
    $('rad').onclick = (e) => { const b = e.target.closest('button'); if (b) { miles = +b.dataset.v; set('ot.radius', miles); draw(); } };
    const calc = () => {
      const m = /(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/.exec($('ll').value); set('ot.ll', $('ll').value);
      if (!m) { $('dist').innerHTML = ''; return; }
      const d = milesBetween(p, { lat: +m[1], lon: +m[2] }), dr = driveEstimate(d);
      $('dist').innerHTML = `<b>${d.toFixed(1)} mi</b> straight-line · about <b>${dr.roadMiles} mi / ${fmtDrive(dr.minutes)}</b> driving (rough)`;
    };
    $('ll').oninput = calc; calc();
    const dir = () => { from = $('from').value.trim(); set('ot.from', from); $('dir').href = from ? directionsUrl(from, p) : mapUrl(p); };
    $('from').oninput = dir; dir();
  };
  draw();
}

function pay(o) {
  const p = plantById[o.plantId];
  chrome('Pay & per diem', { back: true, nav: 'home' });
  const r = lookupRate(perdiem, p.state, p.county, o.start || today());
  const gsaDaily = r.lodging + r.mie;
  const s = { rate: '', st: '40', ot: '20', otMult: '1.5', dt: '0', pdMode: 'gsa', pdCustom: '', pdDays: '7', ...get('ot.pay', {}), ...(o.pay || {}) };
  view.innerHTML = `
    <div class="card"><h3>GSA per diem · FY${r.fy}</h3>
      <div class="kv"><span>Location</span><b>${esc(r.standard ? `${p.county} Co., ${p.state} (standard CONUS rate)` : `${r.dest}, ${p.state}`)}</b></div>
      <div class="kv"><span>Lodging</span><b>${money(r.lodging)}/night</b></div>
      <div class="kv"><span>M&IE (meals & incidentals)</span><b>${money(r.mie)}/day</b></div>
      <div class="kv tot"><span>Max per day</span><b>${money(gsaDaily)}</b></div>
      ${r.seasons.length > 1 ? `<p class="hint">Seasonal: ${r.seasons.map((x) => `${x.b}→${x.e}: ${money(x.lodging)}`).join(' · ')} (MM-DD). Rate shown is for ${o.start ? 'your start date' : 'today'}.</p>` : ''}
      <p class="hint">GSA FY${r.fy} rates (${esc(perdiem.effective)}), from <a href="https://www.gsa.gov/travel/plan-a-trip/per-diem-rates" target="_blank" rel="noopener">gsa.gov</a>, for the plant’s county (${esc(p.county)}). GSA rates are the federal travel maximum. Your company’s per diem may be different, so use your offer if you have it.</p>
    </div>
    <form class="card" id="pf"><h3>Your week</h3>
      <div class="row gap"><label class="field grow"><span class="lbl">Hourly rate $</span><input type="text" inputmode="decimal" id="rate" value="${esc(s.rate)}" placeholder="e.g. 38.50"></label>
        <label class="field grow"><span class="lbl">OT multiplier</span><input type="text" inputmode="decimal" id="otMult" value="${esc(s.otMult)}"></label></div>
      <div class="row gap"><label class="field grow"><span class="lbl">Straight hrs</span><input type="text" inputmode="decimal" id="st" value="${esc(s.st)}"></label>
        <label class="field grow"><span class="lbl">OT hrs</span><input type="text" inputmode="decimal" id="ot" value="${esc(s.ot)}"></label>
        <label class="field grow"><span class="lbl">DT hrs (2×)</span><input type="text" inputmode="decimal" id="dt" value="${esc(s.dt)}"></label></div>
      <div class="presets"><span class="lbl">Shift presets</span><div class="chips">
        <button type="button" class="btn-sm" data-h="40,10">5×10s</button><button type="button" class="btn-sm" data-h="40,20">5×12s</button><button type="button" class="btn-sm" data-h="40,32">6×12s</button><button type="button" class="btn-sm" data-h="40,44">7×12s</button></div></div>
      <span class="lbl mt">Per diem</span>
      <div class="seg" id="pdm"><button type="button" data-v="gsa" class="${s.pdMode === 'gsa' ? 'on' : ''}">GSA max ${money(gsaDaily)}</button><button type="button" data-v="custom" class="${s.pdMode === 'custom' ? 'on' : ''}">My offer</button></div>
      <div class="row gap"><label class="field grow" id="pdcw" ${s.pdMode === 'custom' ? '' : 'hidden'}><span class="lbl">Per diem $/day</span><input type="text" inputmode="decimal" id="pdCustom" value="${esc(s.pdCustom)}"></label>
        <label class="field grow"><span class="lbl">Days paid / week</span><input type="text" inputmode="numeric" id="pdDays" value="${esc(s.pdDays)}"></label></div>
      <div class="result big" id="out"></div>
      <p class="hint"><b>Estimate before taxes.</b> It doesn’t take out taxes, union dues or deductions. Whether per diem is tax-free depends on your tax home. Ask a tax pro.</p>
    </form>`;
  let mode = s.pdMode;
  const calc = () => {
    const v = (id) => $(id).value;
    const st = { rate: v('rate'), st: v('st'), ot: v('ot'), otMult: v('otMult'), dt: v('dt'), pdMode: mode, pdCustom: v('pdCustom'), pdDays: v('pdDays') };
    set('ot.pay', { rate: st.rate, otMult: st.otMult }); outages.put({ ...outages.get(o.id), pay: st });
    const daily = mode === 'gsa' ? gsaDaily : parseFloat(st.pdCustom) || 0;
    const w = weeklyPay({ ...st, perDiemDaily: daily, perDiemDays: st.pdDays });
    const weeks = outageWeeks(o.start, o.end);
    $('out').innerHTML = `
      <div class="kv"><span>Straight time</span><b>${money2(w.stPay)}</b></div>
      <div class="kv"><span>Overtime</span><b>${money2(w.otPay)}</b></div>
      ${w.dtPay ? `<div class="kv"><span>Double time</span><b>${money2(w.dtPay)}</b></div>` : ''}
      <div class="kv"><span>Per diem (${Math.min(7, parseFloat(st.pdDays) || 0)} d × ${money(daily)})</span><b>${money2(w.perDiem)}</b></div>
      <div class="kv tot"><span>Est. weekly before taxes</span><b>${money(w.total)}</b></div>
      ${weeks ? `<div class="kv"><span>Whole outage (~${weeks} wk)</span><b>${money(w.total * weeks)}</b></div>` : ''}
      <p class="hint">${w.hours} hrs/week</p>`;
  };
  $('pf').oninput = calc;
  $('pdm').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; mode = b.dataset.v; $('pdm').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); $('pdcw').hidden = mode !== 'custom'; calc(); };
  view.querySelectorAll('[data-h]').forEach((b) => (b.onclick = () => { const [a, c] = b.dataset.h.split(','); $('st').value = a; $('ot').value = c; calc(); }));
  calc();
}

const COMING = `<div class="spot"><b>Crew sharing is coming.</b> For now, posts stay on this phone. To share one, send its link or QR code, and the other person can import it with one tap. Live sync across the crew comes with a later update.</div>`;
function board(o) {
  const p = plantById[o.plantId];
  chrome('Crew board', { back: true, nav: 'home' });
  let filter = get('ot.bfilter', 'all');
  const draw = () => {
    const list = posts.all().filter((x) => x.outageId === o.id && !x.deleted && (filter === 'all' || x.kind.startsWith(filter)));
    view.innerHTML = `${COMING}
      <div class="grid four">${Object.entries(KINDS).map(([k, v]) => `<a class="tile sm" href="#/o/${o.id}/post/new?k=${k}"><span class="t-ico">${v.icon}</span><b>${v.label}</b></a>`).join('')}</div>
      <div class="seg" id="bf">${[['all', 'All'], ['room', 'Rooms'], ['ride', 'Rides']].map(([v, l]) => `<button type="button" class="${v === filter ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>
      ${list.length ? list.map((x) => postCard(x, o)).join('') : `<div class="card"><p class="hint">No posts yet for ${esc(p.name)}. Tap a button above to post that you have a room or need a ride.</p></div>`}`;
    $('bf').onclick = (e) => { const b = e.target.closest('button'); if (b) { filter = b.dataset.v; set('ot.bfilter', filter); draw(); } };
    view.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => {
      const x = posts.get(b.dataset.id); if (!x) return;
      if (b.dataset.act === 'claim') { const by = prompt('Claimed by (name):', get('ot.name', '')); if (by === null) return; posts.put(claimPost(x, by)); }
      if (b.dataset.act === 'reopen') posts.put(reopenPost(x));
      if (b.dataset.act === 'del') { if (!confirm('Delete this post?')) return; posts.put(editPost(x, { deleted: true })); }
      draw();
    }));
  };
  draw();
}
function postCard(x, o) {
  const k = KINDS[x.kind];
  return `<div class="card post ${x.status}"><div class="ohead"><b>${k.icon} ${esc(x.title)}</b><span class="pill ${x.status === 'open' ? 'good' : 'muted'}">${x.status === 'open' ? k.label : 'Claimed' + (x.claimedBy ? ' · ' + esc(x.claimedBy) : '')}</span></div>
    ${x.details ? `<p class="pre">${esc(x.details)}</p>` : ''}
    <div class="osub">${[x.when && '🗓 ' + esc(x.when), x.seats && (x.kind.startsWith('ride') ? '💺 ' : '🛏 ') + x.seats, x.price && '💲 ' + esc(x.price), x.author && '👤 ' + esc(x.author), x.contact && '📞 ' + esc(x.contact), x.origin === 'shared' && 'imported'].filter(Boolean).join(' · ')}</div>
    <div class="actions">${x.status === 'open' ? `<button class="btn-sm" data-act="claim" data-id="${x.id}">Mark claimed</button>` : `<button class="btn-sm" data-act="reopen" data-id="${x.id}">Reopen</button>`}
      <a class="btn-sm primary" href="#/o/${o.id}/post/${x.id}/share">Share</a><a class="btn-sm" href="#/o/${o.id}/post/${x.id}/edit">Edit</a><button class="btn-sm" data-act="del" data-id="${x.id}">Delete</button></div></div>`;
}
function postForm(o, x, kind) {
  chrome(x ? 'Edit post' : 'New post', { back: true, nav: 'home' });
  const k = x ? x.kind : KINDS[kind] ? kind : 'room_avail';
  const ride = k.startsWith('ride');
  const v = x || {};
  view.innerHTML = `<form class="card" id="pf">
    <div class="seg" id="kind">${Object.entries(KINDS).map(([kk, vv]) => `<button type="button" class="${kk === k ? 'on' : ''}" data-v="${kk}">${vv.icon} ${vv.label}</button>`).join('')}</div>
    <label class="field"><span class="lbl">Title</span><input type="text" id="ptitle" maxlength="80" value="${esc(v.title || '')}" placeholder="${ride ? 'e.g. Leaving Oswego 5:15a, day shift' : 'e.g. 1 room in 3BR house, 8 mi'}"></label>
    <label class="field"><span class="lbl">Details</span><textarea id="details" rows="3" maxlength="600" placeholder="${ride ? 'Pickup spot, shift, gas split…' : 'Dates, beds, kitchen, parking, pets…'}">${esc(v.details || '')}</textarea></label>
    <div class="row gap"><label class="field grow"><span class="lbl">When</span><input type="text" id="when" maxlength="40" value="${esc(v.when || '')}" placeholder="${ride ? 'Days, 5:15a' : 'Mar 20 – Apr 12'}"></label>
      <label class="field grow"><span class="lbl">${ride ? 'Seats' : 'Beds'}</span><input type="text" inputmode="numeric" id="seats" value="${esc(v.seats || '')}"></label></div>
    <label class="field"><span class="lbl">Price / split</span><input type="text" id="price" maxlength="30" value="${esc(v.price || '')}" placeholder="${ride ? '$20/wk gas' : '$900/mo'}"></label>
    <div class="row gap"><label class="field grow"><span class="lbl">Your name</span><input type="text" id="author" maxlength="60" value="${esc(v.author || get('ot.name', ''))}"></label>
      <label class="field grow"><span class="lbl">Contact</span><input type="text" id="contact" maxlength="120" value="${esc(v.contact || get('ot.contact', ''))}" placeholder="Phone or text"></label></div>
    <p class="hint">Anyone you share this post with can see your contact info. Don’t add plant security details, badge info, or site layouts.</p>
    <button class="btn primary" type="submit">${x ? 'Save' : 'Post'}</button></form>`;
  let kk = k;
  $('kind').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; kk = b.dataset.v; $('kind').querySelectorAll('button').forEach((y) => y.classList.toggle('on', y === b)); };
  $('pf').onsubmit = (e) => {
    e.preventDefault();
    const f = { kind: kk, title: $('ptitle').value, details: $('details').value, when: $('when').value, seats: $('seats').value, price: $('price').value, author: $('author').value, contact: $('contact').value };
    set('ot.name', f.author.trim()); set('ot.contact', f.contact.trim());
    const saved = x ? editPost(x, newPost({ ...x, ...f }), Date.now()) : newPost({ ...f, outageId: o.id, plantId: o.plantId });
    if (x) Object.assign(saved, { id: x.id, createdAt: x.createdAt, status: x.status, claimedBy: x.claimedBy, ver: (x.ver || 1) + 1, origin: x.origin, outageId: x.outageId });
    posts.put(saved); toast('Saved'); location.replace(`#/o/${o.id}/board`);
  };
}
function sharePost(o, x) {
  chrome('Share post', { back: true, nav: 'home' });
  const url = shareUrl(location.origin + location.pathname, x, o);
  let svg = '';
  try { const q = qrcode(0, 'M'); q.addData(url, 'Byte'); q.make(); svg = q.createSvgTag({ cellSize: 4, margin: 4, scalable: true }); } catch { svg = '<p class="hint">Too long for a QR code. Use the link.</p>'; }
  view.innerHTML = `<div class="card center"><b>${KINDS[x.kind].icon} ${esc(x.title)}</b><div class="qr">${svg}</div><p class="hint">Have them scan this with their phone camera. It opens this app and adds the post.</p></div>
    <div class="card"><label class="field"><span class="lbl">Share link</span><textarea rows="3" readonly id="url">${esc(url)}</textarea></label>
      ${navigator.share ? '<button class="btn primary" id="ns">Share… (text / group chat)</button>' : ''}<button class="btn ghost mt" id="cp">Copy link</button>
      <p class="hint">The post is packed into the link itself, so nothing gets uploaded. It includes the contact info you entered.</p></div>${COMING}`;
  $('cp').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { $('url').select(); document.execCommand('copy'); toast('Link copied'); } };
  if ($('ns')) $('ns').onclick = () => navigator.share({ title: x.title, text: `${KINDS[x.kind].label}: ${x.title}`, url }).catch(() => {});
}
function importView(code) {
  chrome('Import post', { back: true, nav: 'home' });
  let d; try { d = decodePost(code); } catch { view.innerHTML = '<div class="card"><p class="hint">That link is damaged or from a newer version.</p></div>'; return; }
  const { post, outage } = d; const p = plantById[post.plantId];
  const mine = outages.all().filter((x) => x.plantId === post.plantId);
  view.innerHTML = `<div class="card"><h3>Shared with you</h3>${postCard({ ...post }, { id: '_' }).replace(/<div class="actions">[\s\S]*?<\/div><\/div>$/, '</div>')}
    <p class="hint">${p ? esc(p.name) : 'Unknown plant'}${outage?.start ? ` · outage ${fmtDate(outage.start)} – ${fmtDate(outage.end)}` : ''}</p>
    ${p ? `<button class="btn primary" id="imp">${mine.length ? `Add to my ${esc(p.name)} outage` : `Add — and create a ${esc(p.name)} outage`}</button>` : ''}</div>`;
  if ($('imp')) $('imp').onclick = () => {
    let o = mine[0];
    if (!o) { o = { id: uid(), plantId: post.plantId, start: outage?.start || '', end: outage?.end || '', units: [], company: '', notes: '', createdAt: Date.now(), updatedAt: Date.now(), ver: 1 }; outages.put(o); }
    posts.save(mergePost(posts.all(), { ...post, outageId: o.id }));
    toast('Post added'); location.replace(`#/o/${o.id}/board`);
  };
}

function plantsView() {
  chrome('Plants', { nav: 'plants' });
  view.innerHTML = `<div class="card">${plantPicker()}</div>${statusLine()}<p class="fine">${plants.length} sites with ${plants.reduce((n, p) => n + p.units.length, 0)} operating units, from the NRC list of power reactor units.</p>`;
  wirePicker((id) => { location.hash = `#/plant/${id}`; });
}
function plantView(p) {
  chrome(p.name, { back: true, nav: 'plants' });
  const r = lookupRate(perdiem, p.state, p.county, today());
  const ups = plantUpcoming(p.id);
  const hist = p.units.flatMap((u) => (status?.units?.[u]?.outages || []).map((x) => ({ u, ...x }))).sort((a, b) => (a.start < b.start ? 1 : -1));
  view.innerHTML = `
    <div class="card"><div class="kv"><span>Location (NRC)</span><b>${esc(p.nrcLocation)}</b></div>
      <div class="kv"><span>Town / county</span><b>${esc(p.city)}, ${esc(p.county)} Co., ${p.state}</b></div>
      <div class="kv"><span>Owner / operator</span><b>${esc(p.owner)}</b></div>
      <div class="kv"><span>Type</span><b>${p.type} · ${p.units.length} unit${p.units.length > 1 ? 's' : ''} · NRC Region ${p.region}</b></div>
      ${p.mw ? `<div class="kv"><span>Capacity (EIA)</span><b>${Math.round(p.mw).toLocaleString()} MW</b></div>` : ''}
      <div class="kv"><span>GSA FY${r.fy}</span><b>${money(r.lodging)} lodging + ${money(r.mie)} M&IE</b></div>
      <a class="btn-link mt" href="${mapUrl(p)}" target="_blank" rel="noopener">Open in Google Maps ↗</a>
      ${p.coordNote ? `<p class="hint">${esc(p.coordNote)}</p>` : ''}</div>
    <div class="card"><h3>Unit status</h3>${p.units.map(unitRow).join('')}${statusLine()}</div>
    ${ups.length ? `<div class="card"><h3>Published outage dates</h3>${ups.map((u) => `<div class="kv"><span>${esc(u.unit)} ${esc(u.label)}</span><b>${fmtDate(u.start)}${u.end ? ' – ' + fmtDate(u.end) : ' (start)'}</b></div><p class="hint">Source: <a href="${upcoming.sources[u.src].url}" target="_blank" rel="noopener">${esc(upcoming.sources[u.src].name)}</a>, checked ${fmtDate(upcoming.retrieved)}</p>`).join('')}</div>` : ''}
    <div class="card"><h3>Shutdowns in the last 365 days</h3>${hist.length ? hist.map((h) => `<div class="kv"><span>${esc(h.u)}</span><b>${fmtDate(h.start)} – ${h.ongoing ? 'now' : fmtDate(h.end)} · ${h.days} d</b></div>`).join('') : '<p class="hint">No shutdowns of 7 days or more.</p>'}
      <p class="hint">This counts runs of 0% power lasting 7 days or more in the NRC daily report. Most are refueling outages, but the report doesn’t give a reason.</p></div>
    ${ratingSummary(p, false)}
    <a class="btn primary" href="#/add?plant=${p.id}">＋ Add as my outage</a>`;
  view.querySelectorAll('[data-rdel]').forEach((b) => (b.onclick = () => { if (confirm('Delete this rating?')) { ratings.remove(b.dataset.rdel); plantView(p); } }));
}
const CREW_NOTE = '<p class="hint">Ratings from your crew, shared by link. Shared ratings from everyone are coming.</p>';
function ratingSummary(p, compact) {
  const all = ratings.all(), g = aggregate(all, p.id), list = all.filter((r) => r.plantId === p.id);
  const others = list.filter((r) => !r.mine).length;
  const head = `<div class="ohead"><h3>⭐ Worker ratings</h3>${g.count ? `<span class="pill good">${g.avg.overall} · ${g.count} rating${g.count > 1 ? 's' : ''}</span>` : ''}</div>`;
  if (compact) return `<a class="card ocard" href="#/plant/${p.id}" id="rsum">${head}${g.count ? `<div class="stars">${stars(g.avg.overall)}</div><div class="osub">${others} from others · tap to see all or rate</div>` : '<div class="osub">No ratings yet. Tap to rate this plant.</div>'}<span class="chev">›</span></a>`;
  return `<div class="card" id="ratings">${head}
    ${g.count ? DIMS.map((d) => `<div class="kv"><span>${d.label}</span><b>${g.avg[d.id] == null ? '—' : `<span class="stars">${stars(g.avg[d.id])}</span> ${g.avg[d.id]}`}</b></div>`).join('') : '<p class="hint">No ratings yet.</p>'}
    ${list.map((r) => `<div class="spot"><div><b>${r.mine ? 'You' : 'Shared'} · <span class="stars">${stars(r.scores.overall)}</span></b><div class="osub">${[r.season, r.craft].filter(Boolean).map(esc).join(' · ')}</div>${r.review ? `<p class="pre">${esc(r.review)}</p>` : ''}</div>
      <div class="actions">${r.mine ? `<a class="btn-sm primary" href="#/plant/${p.id}/rate/${r.id}/share">Share</a><a class="btn-sm" href="#/plant/${p.id}/rate/${r.id}">Edit</a>` : ''}<button class="btn-sm" data-rdel="${r.id}">Delete</button></div></div>`).join('')}
    <a class="btn primary mt" href="#/plant/${p.id}/rate">Rate this plant</a>${CREW_NOTE}</div>`;
}
function rateForm(p, x) {
  chrome('Rate ' + p.name, { back: true, nav: 'plants' });
  const sc = { ...(x?.scores || {}) };
  view.innerHTML = `<form class="card" id="rf">
    ${DIMS.map((d) => `<span class="lbl mt">${d.label}${d.id === 'overall' ? ' *' : ''}</span><div class="seg starseg" data-d="${d.id}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-v="${n}" aria-label="${n} stars">${n}★</button>`).join('')}</div>${d.id === 'gate' ? '<p class="hint">Rate the wait time only. No procedure details.</p>' : ''}`).join('')}
    <div class="row gap"><label class="field grow"><span class="lbl">Season worked</span><input type="text" id="season" maxlength="20" value="${esc(x?.season || '')}" placeholder="Spring 2026"></label>
      <label class="field grow"><span class="lbl">Craft / role</span><input type="text" id="craft" maxlength="40" value="${esc(x?.craft || get('ot.craft', ''))}" placeholder="Pipefitter"></label></div>
    <label class="field"><span class="lbl">Short review (optional)</span><textarea id="review" rows="3" maxlength="400">${esc(x?.review || '')}</textarea></label>
    <p class="hint">⚠️ No security, site layout, or proprietary info, and don’t name individuals.</p>
    <button class="btn primary" type="submit">Save rating</button></form>`;
  const paint = () => view.querySelectorAll('.starseg').forEach((g) => g.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.v <= (sc[g.dataset.d] || 0))));
  view.querySelectorAll('.starseg').forEach((g) => (g.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; const v = +b.dataset.v; sc[g.dataset.d] = sc[g.dataset.d] === v ? null : v; paint(); }));
  paint();
  $('rf').onsubmit = (e) => {
    e.preventDefault();
    let r; try { r = newRating({ id: x?.id, createdAt: x?.createdAt, plantId: p.id, scores: sc, review: $('review').value, season: $('season').value, craft: $('craft').value }); } catch { toast('Pick an overall rating'); return; }
    set('ot.craft', r.craft); ratings.put(r); toast('Rating saved'); location.replace(`#/plant/${p.id}`);
  };
}
function shareRating(p, r) {
  chrome('Share rating', { back: true, nav: 'plants' });
  const url = ratingShareUrl(location.origin + location.pathname, r);
  let svg = ''; try { const q = qrcode(0, 'M'); q.addData(url, 'Byte'); q.make(); svg = q.createSvgTag({ cellSize: 4, margin: 4, scalable: true }); } catch { svg = '<p class="hint">Too long for a QR code. Use the link.</p>'; }
  view.innerHTML = `<div class="card center"><b>${esc(p.name)} · ${stars(r.scores.overall)}</b><div class="qr">${svg}</div><p class="hint">Scan with a phone camera to add your rating to theirs.</p></div>
    <div class="card"><label class="field"><span class="lbl">Share link</span><textarea rows="3" readonly id="url">${esc(url)}</textarea></label>
    ${navigator.share ? '<button class="btn primary" id="ns">Share… (text / group chat)</button>' : ''}<button class="btn ghost mt" id="cp">Copy link</button>
    <p class="hint">The rating is packed into the link. Your name isn’t included.</p></div>`;
  $('cp').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { $('url').select(); document.execCommand('copy'); toast('Link copied'); } };
  if ($('ns')) $('ns').onclick = () => navigator.share({ title: 'Rating: ' + p.name, url }).catch(() => {});
}
function importRating(code) {
  chrome('Import rating', { back: true, nav: 'plants' });
  let r; try { r = decodeRating(code); } catch { view.innerHTML = '<div class="card"><p class="hint">That link is damaged or from a newer version.</p></div>'; return; }
  const p = plantById[r.plantId];
  view.innerHTML = `<div class="card"><h3>Rating shared with you</h3><b>${p ? esc(p.name) : 'Unknown plant'} · ${stars(r.scores.overall)}</b>
    ${DIMS.map((d) => `<div class="kv"><span>${d.label}</span><b>${r.scores[d.id] ? stars(r.scores[d.id]) : '—'}</b></div>`).join('')}
    <div class="osub">${[r.season, r.craft].filter(Boolean).map(esc).join(' · ')}</div>${r.review ? `<p class="pre">${esc(r.review)}</p>` : ''}
    ${p ? '<button class="btn primary" id="imp">Add to ratings</button>' : ''}</div>`;
  if ($('imp')) $('imp').onclick = () => { ratings.save(mergeRating(ratings.all(), r)); toast('Rating added'); location.replace(`#/plant/${p.id}`); };
}
function upcomingView() {
  chrome('Upcoming outages', { nav: 'upcoming' });
  const l = upcomingOnly(upcoming, today());
  view.innerHTML = `<div class="spot">Outages that haven’t started yet, from published schedules, soonest first. Units already shut down are under Offline.</div>
    ${l.length ? l.map((u) => { const p = plantById[u.plant]; return `<a class="ocard up" href="#/plant/${u.plant}"><div class="ohead"><b>${esc(u.unit)} · ${esc(u.label)}</b><span class="pill">Starts ${fmtDate(u.start)}</span></div>
      <div class="osub">${fmtDate(u.start)}${u.end ? ' – ' + fmtDate(u.end) : ' (start)'} · ${esc(p.name)}, ${esc(p.city)}, ${p.state}</div>
      <div class="osub">Source: ${esc(upcoming.sources[u.src].name.split(' — ')[0])}</div><span class="chev">›</span></a>`; }).join('') : '<div class="card"><p class="hint">No published upcoming outages right now.</p></div>'}
    <p class="fine">Checked ${fmtDate(upcoming.retrieved)}. Dates can change; this isn’t every plant’s schedule. Sources: ${Object.values(upcoming.sources).map((x) => `<a href="${x.url}" target="_blank" rel="noopener">${esc(x.name.split(' — ')[0])}</a>`).join(', ')}.</p>`;
}
function downView() {
  chrome('Offline', { nav: 'down' });
  const l = downNow(status, plants, upcoming);
  const off = l.filter((x) => x.power === 0), red = l.filter((x) => x.power > 0);
  const card = (x) => `<a class="ocard" href="#/plant/${x.plant.id}"><div class="ohead"><b>${esc(x.unit)}</b><span class="pill ${x.power === 0 ? 'bad' : 'warn'}">${x.power === 0 ? 'Offline' : x.power + '% power'}</span></div>
    <div class="osub">${esc(x.plant.city)}, ${x.plant.state}${x.downSince ? ` · down ${x.sinceAtLeast ? 'since at least' : 'since'} ${fmtDate(x.downSince)} (${daysBetween(x.downSince, status.reportDate) + 1} d)` : ''}</div>
    ${x.published ? `<div class="osub">Published outage: ${esc(x.published.label)}${x.published.end ? ', planned to ' + fmtDate(x.published.end) : ''}</div>` : ''}
    <div class="osub">NRC report ${fmtDate(x.date)}</div><span class="chev">›</span></a>`;
  view.innerHTML = `<div class="spot">Units shut down or at reduced power right now, from the NRC daily report.</div>
    ${!status ? '<div class="card"><p class="hint">Reactor status not loaded yet (needs one connection).</p></div>' : `
    <h3 class="sec">Offline (0%) · ${off.length}</h3>${off.map(card).join('') || '<p class="hint">None offline.</p>'}
    <h3 class="sec">Reduced power · ${red.length}</h3>${red.map(card).join('') || '<p class="hint">None at reduced power.</p>'}`}
    ${statusLine()}<p class="fine">The NRC report doesn’t say why a unit is down. It may be refueling, maintenance, or another shutdown.</p>`;
}
function about() {
  chrome('About & sources', { nav: 'about' });
  view.innerHTML = `<div class="card"><h3>Data sources</h3>
    <p><b>Plants:</b> <a href="https://www.nrc.gov/reactors/operating/list-power-reactor-units.html" target="_blank" rel="noopener">NRC List of Power Reactor Units</a> (names, units, type, location, owner/operator, region). The coordinates, county, and capacity come from the <a href="https://atlas.eia.gov/" target="_blank" rel="noopener">EIA Power Plants layer</a>. Palisades isn’t in EIA’s nuclear layer, so its coordinates are approximate.</p>
    <p><b>Per diem:</b> GSA FY${perdiem.fy} CONUS rates (${esc(perdiem.effective)}), from the file <i>${esc(perdiem.file)}</i> on <a href="https://www.gsa.gov/travel/plan-a-trip/per-diem-rates/per-diem-files" target="_blank" rel="noopener">gsa.gov</a>. It works offline. The standard rate is ${money(perdiem.standard.lodging)} + ${money(perdiem.standard.mie)}.</p>
    <p><b>Unit status:</b> <a href="${NRC_STATUS_PAGE}" target="_blank" rel="noopener">NRC Power Reactor Status Report</a> (daily % power, last 365 days). nrc.gov doesn’t allow browser apps to read it directly, so a GitHub Action fetches it every day and publishes a snapshot with this app. The last report you loaded stays saved for offline use.</p>
    <p><b>Upcoming outages:</b> only dates that are published publicly, like a contractor’s outage schedule or a utility’s announcement, each with its source. Nothing is guessed.</p>
    <p><b>Housing:</b> deep links to Airbnb, Furnished Finder, Booking.com, Campendium and Google Maps. No listings are stored or made up.</p></div>
    <div class="card"><h3>Privacy & safety</h3><p class="hint">Everything stays on this phone (localStorage). Shared posts travel inside the link. The app has no plant security info, badging, gate, or layout details. Please don’t add any to notes or posts.</p></div>
    <p class="fine">Outage Travel v${VERSION} · estimates only, not tax or pay advice.</p>`;
}


function localView(o) {
  const p = plantById[o.plantId];
  chrome('Food & local', { back: true, nav: 'home' });
  const town = refTown(p.nrcLocation);
  let miles = get('ot.lradius', 10), yelp = get('ot.yelp', false);
  const catLabel = Object.fromEntries(SECTIONS.flatMap((s) => s.items.map((i) => [i.id, i.icon + ' ' + i.label])));
  const draw = () => {
    const mine = notes.all().filter((x) => x.outageId === o.id);
    view.innerHTML = `
      <div class="card"><div class="osub">Searches centered on <b>${esc(p.name)}</b>${town ? ` · nearest town <b>${esc(town.city)}, ${town.st}</b>` : ''}</div>
        <span class="lbl mt">How far out?</span>
        <div class="seg" id="rad">${[5, 10, 25, 40].map((m) => `<button type="button" class="${m === miles ? 'on' : ''}" data-v="${m}">${m} mi</button>`).join('')}</div>
        <div class="seg" id="src"><button type="button" class="${yelp ? '' : 'on'}" data-v="0">Google Maps</button><button type="button" class="${yelp ? 'on' : ''}" data-v="1">+ Yelp links</button></div>
        <p class="hint">📶 These open live map searches, so they need signal. Your saved spots below work offline.</p></div>
      <div class="card" id="fav"><h3>⭐ My spots & notes</h3>
        ${mine.length ? mine.map((x) => `<div class="spot"><div><b>${esc(x.name)}</b>${x.cat && catLabel[x.cat] ? ` <span class="pill muted">${esc(catLabel[x.cat])}</span>` : ''}${x.note ? `<div class="osub">${esc(x.note)}</div>` : ''}</div>
          <div class="actions"><a class="btn-sm" target="_blank" rel="noopener" href="${esc(mapsSearch(p, x.name + (town ? ' ' + town.city + ' ' + town.st : ''), miles))}">Map ↗</a><button class="btn-sm" data-del="${x.id}">Delete</button></div></div>`).join('') : '<p class="hint">Save places worth remembering, e.g. “Joe’s Diner, opens 4:30am”.</p>'}
        <form id="nf"><label class="field"><span class="lbl">Place</span><input type="text" id="nname" maxlength="80" placeholder="Joe’s Diner"></label>
          <label class="field"><span class="lbl">Note</span><input type="text" id="nnote" maxlength="300" placeholder="Opens 4:30am, big portions"></label>
          <label class="field"><span class="lbl">Type</span><select id="ncat"><option value="">—</option>${SECTIONS.map((s) => `<optgroup label="${esc(s.title)}">${s.items.map((i) => `<option value="${i.id}">${esc(i.label)}</option>`).join('')}</optgroup>`).join('')}</select></label>
          <button class="btn primary" type="submit">Save spot</button></form>
        ${mine.length ? `<a class="btn ghost mt" href="#/o/${o.id}/local/share">Share my spots with the crew</a>` : ''}</div>
      ${SECTIONS.map((s) => `<h3 class="sec">${s.icon} ${esc(s.title)}</h3><div class="links">${s.items.map((i) => `<a class="lcard" data-cat="${i.id}" href="${esc(mapsSearch(p, i.q, miles))}" target="_blank" rel="noopener"><b>${i.icon} ${esc(i.label)}</b>${i.note ? `<small>${esc(i.note)}</small>` : ''}<span class="chev">↗</span></a>${yelp ? `<a class="ylink" href="${esc(yelpSearch(p, i.yelp, town))}" target="_blank" rel="noopener">${esc(i.label)} on Yelp ↗</a>` : ''}`).join('')}</div>`).join('')}
      <p class="fine">These buttons open real Google Maps${yelp ? ' and Yelp' : ''} searches. This app lists no businesses and makes none up. Check hours before you drive.</p>`;
    $('rad').onclick = (e) => { const b = e.target.closest('button'); if (b) { miles = +b.dataset.v; set('ot.lradius', miles); draw(); } };
    $('src').onclick = (e) => { const b = e.target.closest('button'); if (b) { yelp = b.dataset.v === '1'; set('ot.yelp', yelp); draw(); } };
    $('nf').onsubmit = (e) => { e.preventDefault(); try { notes.put(newNote({ name: $('nname').value, note: $('nnote').value, cat: $('ncat').value, outageId: o.id, plantId: o.plantId })); toast('Saved'); draw(); } catch { toast('Add a place name'); } };
    view.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { if (confirm('Delete this spot?')) { notes.remove(b.dataset.del); draw(); } }));
  };
  draw();
}
function shareNotes(o) {
  const p = plantById[o.plantId];
  chrome('Share my spots', { back: true, nav: 'home' });
  const mine = notes.all().filter((x) => x.outageId === o.id);
  const url = notesShareUrl(location.origin + location.pathname, o.plantId, mine);
  let svg = '';
  try { const q = qrcode(0, 'M'); q.addData(url, 'Byte'); q.make(); svg = q.createSvgTag({ cellSize: 4, margin: 4, scalable: true }); } catch { svg = '<p class="hint">Too many spots for a QR code. Use the link.</p>'; }
  view.innerHTML = `<div class="card center"><b>⭐ ${mine.length} spot${mine.length === 1 ? '' : 's'} near ${esc(p.name)}</b><div class="qr">${svg}</div><p class="hint">Have them scan this with their phone camera. It opens this app and adds your spots.</p></div>
    <div class="card"><label class="field"><span class="lbl">Share link</span><textarea rows="3" readonly id="url">${esc(url)}</textarea></label>
      ${navigator.share ? '<button class="btn primary" id="ns">Share… (text / group chat)</button>' : ''}<button class="btn ghost mt" id="cp">Copy link</button>
      <p class="hint">Your spots are packed into the link itself, so nothing gets uploaded.</p></div>`;
  $('cp').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { $('url').select(); document.execCommand('copy'); toast('Link copied'); } };
  if ($('ns')) $('ns').onclick = () => navigator.share({ title: 'Spots near ' + p.name, url }).catch(() => {});
}
function importNotes(code) {
  chrome('Import spots', { back: true, nav: 'home' });
  let d; try { d = decodeNotes(code); } catch { view.innerHTML = '<div class="card"><p class="hint">That link is damaged or from a newer version.</p></div>'; return; }
  const p = plantById[d.plantId]; const mine = outages.all().filter((x) => x.plantId === d.plantId);
  view.innerHTML = `<div class="card"><h3>Spots shared with you</h3>${d.notes.map((x) => `<div class="spot"><div><b>${esc(x.name)}</b>${x.note ? `<div class="osub">${esc(x.note)}</div>` : ''}</div></div>`).join('')}
    <p class="hint">${p ? esc(p.name) : 'Unknown plant'}</p>${p ? `<button class="btn primary" id="imp">${mine.length ? `Add to my ${esc(p.name)} outage` : `Add — and create a ${esc(p.name)} outage`}</button>` : ''}</div>`;
  if ($('imp')) $('imp').onclick = () => {
    let o = mine[0];
    if (!o) { o = { id: uid(), plantId: d.plantId, start: '', end: '', units: [], company: '', notes: '', createdAt: Date.now(), updatedAt: Date.now(), ver: 1 }; outages.put(o); }
    const others = notes.all().filter((x) => x.outageId !== o.id);
    notes.save([...others, ...mergeNotes(notes.all().filter((x) => x.outageId === o.id), d.notes.map((x) => ({ ...x, outageId: o.id })))]);
    toast('Spots added'); location.replace(`#/o/${o.id}/local`);
  };
}
const forum = makeForum({ view, chrome, toast, esc, plantById, $ });
// ---------- router ----------
function render() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs = ''] = h.split('?');
  const q = Object.fromEntries(new URLSearchParams(qs));
  const parts = path.split('/').filter(Boolean);
  window.scrollTo(0, 0);
  if (!parts.length) return home();
  if (parts[0] === 'add') return outageForm({ plantId: plantById[q.plant] ? q.plant : null, start: q.s || '', end: q.e || '', units: q.u ? [q.u] : [] }, true);
  if (parts[0] === 'plants') return plantsView();
  if (parts[0] === 'plant' && plantById[parts[1]]) {
    const p = plantById[parts[1]];
    if (parts[2] === 'rate') { const r = parts[3] && ratings.get(parts[3]); if (r && parts[4] === 'share') return shareRating(p, r); return rateForm(p, r || null); }
    return plantView(p);
  }
  if (parts[0] === 'forum') return forum.route(parts, q);
  if (parts[0] === 'upcoming') return upcomingView();
  if (parts[0] === 'down') return downView();
  if (parts[0] === 'about') return about();
  if (parts[0] === 'import' && q.p) return importView(q.p);
  if (parts[0] === 'import' && q.r) return importRating(q.r);
  if (parts[0] === 'import' && q.n) return importNotes(q.n);
  if (parts[0] === 'o') {
    const o = outages.get(parts[1]);
    if (!o || !plantById[o.plantId]) { location.replace('#/'); return; }
    const sub = parts[2];
    if (!sub) return hub(o);
    if (sub === 'edit') return outageForm(o, false);
    if (sub === 'housing') return housing(o);
    if (sub === 'pay') return pay(o);
    if (sub === 'board') return board(o);
    if (sub === 'local') return parts[3] === 'share' ? shareNotes(o) : localView(o);
    if (sub === 'post') {
      if (parts[3] === 'new') return postForm(o, null, q.k);
      const x = posts.get(parts[3]); if (!x) return board(o);
      if (parts[4] === 'share') return sharePost(o, x);
      if (parts[4] === 'edit') return postForm(o, x);
    }
  }
  home();
}
window.addEventListener('hashchange', render);
render();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register(BASE + 'sw.js').catch(() => {}));
}
