import { describe, it, expect } from 'vitest';
import table from '../src/data/perdiem.json';
import plants from '../src/data/plants.json';
import { lookupRate, weeklyPay, outageWeeks, norm } from '../src/lib/perdiem.js';

describe('GSA FY2027 data', () => {
  it('is FY2027 with the published standard CONUS rate ($113 lodging / $68 M&IE)', () => {
    expect(table.fy).toBe(2027);
    expect(table.standard).toEqual({ lodging: 113, mie: 68 });
    expect(table.nsa.length).toBeGreaterThan(250);
  });
  it('Oswego County NY (Nine Mile Point / FitzPatrick) = Syracuse/Oswego $136 / $80', () => {
    const r = lookupRate(table, 'NY', 'Oswego', '2027-03-01');
    expect(r).toMatchObject({ lodging: 136, mie: 80, standard: false, dest: 'Syracuse / Oswego' });
  });
  it('Benton County WA (Columbia) = Richland/Pasco', () => {
    expect(lookupRate(table, 'WA', 'Benton', '2027-03-20').dest).toBe('Richland / Pasco');
  });
  it('normalizes county names (Miami Dade vs Miami-Dade, parish suffix, Saint)', () => {
    expect(lookupRate(table, 'FL', 'Miami Dade', '2027-01-10').dest).toBe('Miami');
    expect(norm('Jefferson Parishes')).toBe(norm('Jefferson'));
    expect(norm('Saint Lucie')).toBe(norm('St. Lucie'));
  });
  it('unlisted county falls back to standard rate', () => {
    expect(lookupRate(table, 'KS', 'Coffey', '2027-03-01')).toMatchObject({ lodging: 113, mie: 68, standard: true });
  });
  it('picks the seasonal row for the date (Gulf Shores, Baldwin AL)', () => {
    expect(lookupRate(table, 'AL', 'Baldwin', '2026-11-15').lodging).toBe(144);
    expect(lookupRate(table, 'AL', 'Baldwin', '2027-04-01').lodging).toBe(177);
  });
  it('every plant resolves to a rate', () => {
    for (const p of plants) { const r = lookupRate(table, p.state, p.county, '2027-03-01'); expect(r.lodging).toBeGreaterThan(100); expect(r.mie).toBeGreaterThanOrEqual(68); }
  });
});

describe('weekly pay', () => {
  it('ST + OT at 1.5× + 7 days per diem', () => {
    const w = weeklyPay({ rate: 40, st: 40, ot: 32, perDiemDaily: 216, perDiemDays: 7 });
    expect(w).toMatchObject({ stPay: 1600, otPay: 1920, wages: 3520, perDiem: 1512, total: 5032, hours: 72 });
  });
  it('double time and custom OT multiplier', () => {
    const w = weeklyPay({ rate: 30, st: 40, ot: 10, otMult: 1.5, dt: 12, dtMult: 2 });
    expect(w.dtPay).toBe(720); expect(w.wages).toBe(1200 + 450 + 720);
  });
  it('ignores blanks/negatives and caps per diem at 7 days', () => {
    const w = weeklyPay({ rate: '', st: -5, ot: 'x', perDiemDaily: 100, perDiemDays: 9 });
    expect(w).toMatchObject({ wages: 0, perDiem: 700, total: 700 });
  });
  it('rounds to cents', () => { expect(weeklyPay({ rate: 33.333, st: 3 }).stPay).toBe(100); });
  it('outage weeks from inclusive dates', () => {
    expect(outageWeeks('2027-03-01', '2027-03-28')).toBe(4);
    expect(outageWeeks('2027-03-01', '')).toBe(0);
    expect(outageWeeks('2027-03-10', '2027-03-01')).toBe(0);
  });
});
