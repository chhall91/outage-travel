// GSA per diem lookup + pay math. Pure functions.
export const norm = (s) => String(s || '').toLowerCase().replace(/\bsaint\b/g, 'st').replace(/\bcity of\b/g, '').replace(/\b(parishes|parish|counties|county)\b/g, '').replace(/[^a-z]/g, '');

const inSeason = (md, b, e) => (b <= e ? md >= b && md <= e : md >= b || md <= e);

/** Find the GSA rate for a state+county on a date (YYYY-MM-DD). Falls back to the standard CONUS rate. */
export function lookupRate(table, state, county, date) {
  const md = (date || '').slice(5, 10) || '10-01';
  const c = norm(county);
  const rows = table.nsa.filter((r) => r.st === state && r.counties.some((x) => norm(x) === c));
  if (!rows.length) return { ...table.standard, dest: 'Standard CONUS rate', county, state, standard: true, fy: table.fy, seasons: [] };
  const hit = rows.find((r) => inSeason(md, r.b, r.e)) || rows[0];
  return { lodging: hit.lodging, mie: hit.mie, dest: hit.dest, county, state, standard: false, fy: table.fy,
    seasons: rows.map((r) => ({ b: r.b, e: r.e, lodging: r.lodging, mie: r.mie })) };
}

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : 0; };

/**
 * Weekly gross estimate (before taxes).
 * {rate, st, ot, otMult=1.5, dt=0, dtMult=2, perDiemDaily, perDiemDays=7}
 */
export function weeklyPay(i) {
  const rate = num(i.rate), st = num(i.st), ot = num(i.ot), dt = num(i.dt);
  const otMult = num(i.otMult) || 1.5, dtMult = num(i.dtMult) || 2;
  const stPay = rate * st, otPay = rate * otMult * ot, dtPay = rate * dtMult * dt;
  const wages = stPay + otPay + dtPay;
  const perDiem = num(i.perDiemDaily) * Math.min(7, num(i.perDiemDays));
  const r2 = (x) => Math.round(x * 100) / 100;
  return { stPay: r2(stPay), otPay: r2(otPay), dtPay: r2(dtPay), wages: r2(wages), perDiem: r2(perDiem), total: r2(wages + perDiem), hours: st + ot + dt };
}

/** Whole outage estimate: weekly total × weeks (start/end inclusive days / 7). */
export function outageWeeks(start, end) {
  if (!start || !end) return 0;
  const d = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  return d > 0 ? Math.round((d / 7) * 10) / 10 : 0;
}
