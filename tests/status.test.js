import { describe, it, expect } from 'vitest';
import { parseStatus, unitState } from '../src/lib/status.js';
import snap from '../public/reactor-status.json';
import plants from '../src/data/plants.json';
import upcoming from '../src/data/upcoming.json';

const sample = `ReportDt|Unit|Power
10/3/2026 12:00:00 AM|Byron 2|0
10/1/2026 12:00:00 AM|Byron 2|100
10/2/2026 12:00:00 AM|Byron 2|0
10/4/2026 12:00:00 AM|Byron 2|50
10/1/2026 12:00:00 AM|Harris 1|0
10/2/2026 12:00:00 AM|Harris 1|0
10/3/2026 12:00:00 AM|Harris 1|0
10/4/2026 12:00:00 AM|Harris 1|0`;

describe('NRC status parsing', () => {
  const s = parseStatus(sample, { minOutageDays: 2 });
  it('finds the latest report date and power', () => {
    expect(s.reportDate).toBe('2026-10-04');
    expect(s.units['Byron 2']).toMatchObject({ power: 50, downSince: null });
    expect(s.units['Byron 2'].outages).toEqual([{ start: '2026-10-02', end: '2026-10-03', days: 2, ongoing: false }]);
  });
  it('maps NRC status names to unit list names and flags ongoing outages', () => {
    expect(s.units['Shearon Harris 1']).toMatchObject({ power: 0, downSince: '2026-10-01', sinceAtLeast: true });
  });
  it('labels unit states', () => {
    expect(unitState({ power: 0 }).cls).toBe('bad'); expect(unitState({ power: 60 }).cls).toBe('warn'); expect(unitState({ power: 100 }).cls).toBe('good'); expect(unitState(null).cls).toBe('muted');
  });
  it('bundled snapshot covers every unit in the plant list', () => {
    expect(snap.reportDate).toMatch(/^\d{4}-\d\d-\d\d$/);
    for (const p of plants) for (const u of p.units) expect(snap.units[u], u).toBeTruthy();
  });
  it('every upcoming outage has a source and a known plant/unit', () => {
    for (const o of upcoming.outages) {
      const p = plants.find((x) => x.id === o.plant);
      expect(p, o.plant).toBeTruthy(); expect(p.units).toContain(o.unit); expect(upcoming.sources[o.src].url).toMatch(/^https:/);
    }
  });
});
