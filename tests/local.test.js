import { describe, it, expect } from 'vitest';
import { SECTIONS, mapsSearch, yelpSearch, newNote, encodeNotes, decodeNotes, mergeNotes, notesShareUrl } from '../src/lib/local.js';
const plant = { lat: 43.5211, lon: -76.4097, city: 'Scriba', state: 'NY' };
describe('food & local', () => {
  it('has the three sections with all categories', () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(['food', 'needs', 'down']);
    expect(SECTIONS.flatMap((s) => s.items).length).toBe(23);
    const ids = SECTIONS.flatMap((s) => s.items.map((i) => i.id)); expect(new Set(ids).size).toBe(ids.length);
  });
  it('maps search is centered on the plant and zooms with radius', () => {
    const u = mapsSearch(plant, '24 hour restaurant', 10);
    expect(u).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/24\+hour\+restaurant\/@43\.5211,-76\.4097,\d+z$/);
    expect(mapsSearch(plant, 'x', 10)).not.toBe(mapsSearch(plant, 'x', 60));
  });
  it('yelp uses the reference town', () => {
    expect(yelpSearch(plant, 'BBQ', { city: 'Oswego', st: 'NY' })).toBe('https://www.yelp.com/search?find_desc=BBQ&find_loc=Oswego%2C%20NY');
  });
  it('notes need a name, clip, and round-trip through share link', () => {
    expect(() => newNote({ name: ' ' })).toThrow();
    const n = [newNote({ name: "Joe's Diner", note: 'Opens 4:30am', cat: 'breakfast' }, 1), newNote({ name: 'Laundromat <b>', note: '', cat: '' }, 2)];
    const d = decodeNotes(encodeNotes('nine-mile-point', n));
    expect(d.plantId).toBe('nine-mile-point');
    expect(d.notes.map((x) => [x.name, x.note, x.cat])).toEqual([["Joe's Diner", 'Opens 4:30am', 'breakfast'], ['Laundromat <b>', '', '']]);
    expect(notesShareUrl('https://x/', 'a', n)).toMatch(/^https:\/\/x\/#\/import\?n=1\./);
    expect(() => decodeNotes('zz')).toThrow();
  });
  it('merge skips duplicates', () => {
    const a = [newNote({ name: 'A', note: 'x' }, 1)];
    expect(mergeNotes(a, [newNote({ name: 'a', note: 'X' }, 2), newNote({ name: 'B' }, 3)]).map((x) => x.name)).toEqual(['A', 'B']);
  });
});
