// Split data into two non-overlapping lists: "Offline" (NRC status) and "Upcoming" (published, not yet started).
export function downNow(status, plants, upcoming = { outages: [] }) {
  if (!status) return [];
  const out = [];
  for (const p of plants) for (const u of p.units) {
    const s = status.units?.[u];
    if (!s || s.power >= 90) continue;
    const pub = upcoming.outages.find((o) => o.plant === p.id && o.start <= status.reportDate && (!o.end || o.end >= (s.downSince || status.reportDate)) && (o.unit === u || p.units.length === 1));
    out.push({ plant: p, unit: u, power: s.power, downSince: s.downSince, sinceAtLeast: s.sinceAtLeast, date: s.date || status.reportDate, published: pub || null });
  }
  // offline first, longest-down first; then reduced power
  return out.sort((a, b) => (a.power === 0) !== (b.power === 0) ? (a.power === 0 ? -1 : 1) : (a.downSince || '9') < (b.downSince || '9') ? -1 : 1);
}
export function upcomingOnly(upcoming, today) {
  return upcoming.outages.filter((o) => o.start > today).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}
