// Parse the NRC "Power Reactor Status Report for last 365 days" (pipe-delimited) into a compact snapshot.
// Pure functions so they can be unit tested.
export const NRC_STATUS_URL = 'https://www.nrc.gov/reading-rm/doc-collections/event-status/reactor-status/powerreactorstatusforlast365days.txt';
export const NRC_STATUS_PAGE = 'https://www.nrc.gov/reading-rm/doc-collections/event-status/reactor-status/';
// NRC status-report unit names that differ from the NRC unit list names used in plants.json
export const UNIT_ALIASES = { 'Harris 1': 'Shearon Harris 1', 'LaSalle 1': 'La Salle 1', 'LaSalle 2': 'La Salle 2', 'River Bend Station 1': 'River Bend 1' };

const iso = (s) => { const [m, d, y] = s.trim().split(' ')[0].split('/').map(Number); return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; };
const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export function parseStatus(text, { minOutageDays = 7 } = {}) {
  const byUnit = {};
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split('|');
    if (parts.length !== 3 || parts[0] === 'ReportDt' || !/\d/.test(parts[0])) continue;
    const unit = UNIT_ALIASES[parts[1].trim()] || parts[1].trim();
    const p = Number(parts[2]);
    if (!Number.isFinite(p)) continue;
    (byUnit[unit] ||= []).push([iso(parts[0]), p]);
  }
  let reportDate = '';
  const units = {};
  for (const [unit, rows] of Object.entries(byUnit)) {
    rows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const last = rows[rows.length - 1];
    if (last[0] > reportDate) reportDate = last[0];
    // runs of 0% power
    const runs = []; let start = null, prev = null;
    for (const [d, p] of rows) {
      if (p === 0) { if (start === null) start = d; prev = d; }
      else if (start !== null) { runs.push([start, prev]); start = null; }
    }
    const ongoing = start !== null ? [start, prev] : null;
    if (ongoing) runs.push(ongoing);
    const outages = runs.map(([s, e]) => ({ start: s, end: e, days: dayDiff(s, e) + 1, ongoing: ongoing ? s === ongoing[0] : false }))
      .filter((o) => o.days >= minOutageDays || o.ongoing);
    units[unit] = { power: last[1], date: last[0], downSince: ongoing ? ongoing[0] : null, sinceAtLeast: !!ongoing && ongoing[0] === rows[0][0], outages };
  }
  return { reportDate, source: NRC_STATUS_URL, units };
}

export function unitState(u) {
  if (!u) return { label: 'No data', cls: 'muted' };
  if (u.power === 0) return { label: 'Offline (0%)', cls: 'bad' };
  if (u.power < 90) return { label: `Reduced (${u.power}%)`, cls: 'warn' };
  return { label: `Online (${u.power}%)`, cls: 'good' };
}
