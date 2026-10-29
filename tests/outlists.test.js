import { test, expect } from 'vitest';
import { downNow, upcomingOnly } from '../src/lib/outlists.js';
const plants = [{ id: 'a', units: ['A 1', 'A 2'] }, { id: 'b', units: ['B 1'] }];
const up = { outages: [{ plant: 'a', unit: 'A 1', start: '2026-10-01', end: '2026-11-01' }, { plant: 'b', unit: 'B 1', start: '2027-03-01' }, { plant: 'a', unit: 'A 2', start: '2027-02-01' }] };
const status = { reportDate: '2026-10-29', units: { 'A 1': { power: 0, downSince: '2026-10-02' }, 'A 2': { power: 100 }, 'B 1': { power: 50 } } };
test('down now only has offline/reduced units, offline first, tagged with started outage', () => {
  const d = downNow(status, plants, up);
  expect(d.map((x) => x.unit)).toEqual(['A 1', 'B 1']);
  expect(d[0].published.unit).toBe('A 1'); expect(d[1].published).toBe(null);
});
test('upcoming excludes started outages and sorts by start', () => {
  expect(upcomingOnly(up, '2026-10-29').map((o) => o.unit)).toEqual(['A 2', 'B 1']);
});
