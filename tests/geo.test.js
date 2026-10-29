import { describe, it, expect } from 'vitest';
import { milesBetween, driveEstimate, bbox, fmtDrive, zoomFor } from '../src/lib/geo.js';
import { housingLinks, refTown } from '../src/lib/links.js';
import plants from '../src/data/plants.json';

describe('distance', () => {
  it('zero for same point', () => { expect(milesBetween({ lat: 40, lon: -80 }, { lat: 40, lon: -80 })).toBe(0); });
  it('1 degree of latitude ≈ 69 mi', () => { expect(milesBetween({ lat: 40, lon: -80 }, { lat: 41, lon: -80 })).toBeCloseTo(69.1, 0); });
  it('Nine Mile Point ↔ FitzPatrick are neighbors (< 1 mi)', () => {
    const a = plants.find((p) => p.id === 'nine-mile-point'), b = plants.find((p) => p.id === 'fitzpatrick');
    expect(milesBetween(a, b)).toBeLessThan(1);
  });
  it('Salem ↔ Hope Creek < 1 mi; Braidwood ↔ Dresden ~ 10 mi', () => {
    const g = (id) => plants.find((p) => p.id === id);
    expect(milesBetween(g('salem'), g('hope-creek'))).toBeLessThan(1);
    const d = milesBetween(g('braidwood'), g('dresden')); expect(d).toBeGreaterThan(6); expect(d).toBeLessThan(15);
  });
  it('drive estimate uses 1.3 road factor at 45 mph', () => {
    expect(driveEstimate(45)).toEqual({ roadMiles: 59, minutes: 78 });
    expect(fmtDrive(78)).toBe('1 h 18 min'); expect(fmtDrive(20)).toBe('20 min');
  });
  it('bbox spans the radius', () => {
    const b = bbox(40, -80, 25);
    expect(milesBetween({ lat: 40, lon: -80 }, { lat: b.ne.lat, lon: -80 })).toBeCloseTo(25, 0);
    expect(milesBetween({ lat: 40, lon: -80 }, { lat: 40, lon: b.ne.lon })).toBeCloseTo(25, 0);
    expect(zoomFor(10)).toBe(12); expect(zoomFor(60)).toBe(9);
  });
});

describe('plants data', () => {
  it('55 sites / 95 units with coordinates inside the US', () => {
    expect(plants.length).toBe(55);
    expect(plants.reduce((n, p) => n + p.units.length, 0)).toBe(95);
    for (const p of plants) { expect(p.lat).toBeGreaterThan(24); expect(p.lat).toBeLessThan(49); expect(p.lon).toBeLessThan(-66); expect(p.lon).toBeGreaterThan(-125); expect(p.owner).toBeTruthy(); }
  });
});

describe('housing links', () => {
  const p = plants.find((x) => x.id === 'nine-mile-point');
  it('reference town parsed from NRC location', () => { expect(refTown(p.nrcLocation)).toEqual({ city: 'Oswego', st: 'NY' }); });
  it('builds deep links centered on the plant with dates', () => {
    const l = housingLinks(p, { miles: 25, checkin: '2027-03-20', checkout: '2027-04-12', town: refTown(p.nrcLocation) });
    const by = Object.fromEntries(l.map((x) => [x.id, x.url]));
    expect(by.airbnb).toContain('checkin=2027-03-20'); expect(by.airbnb).toContain('ne_lat=');
    expect(by.ff).toBe('https://www.furnishedfinder.com/housing/us--ny--oswego');
    expect(by.booking).toContain('ss=Oswego%2C%20NY');
    expect(by.campendium).toContain(`lat=${p.lat}`);
    expect(by['gm-rv']).toContain(`@${p.lat},${p.lon},`);
  });
});
