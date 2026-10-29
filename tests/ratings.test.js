import { describe, it, expect } from 'vitest';
import { DIMS, newRating, aggregate, mergeRating, encodeRating, decodeRating, ratingShareUrl, stars } from '../src/lib/ratings.js';
const sc = { overall: 4, mgmt: 3, pay: 5, housing: 2, area: 4, gate: 3 };
describe('plant ratings', () => {
  it('has 6 dimensions and requires overall', () => {
    expect(DIMS.length).toBe(6);
    expect(() => newRating({ plantId: 'x', scores: { mgmt: 3 } })).toThrow();
  });
  it('clamps bad scores to null and clips text', () => {
    const r = newRating({ plantId: 'x', scores: { overall: 4, mgmt: 0, pay: 2.6 }, review: 'a'.repeat(999) });
    expect(r.scores.pay).toBe(3); expect(r.scores.mgmt).toBe(null); expect(r.review.length).toBe(400);
  });
  it('rejects out-of-range overall', () => { expect(() => newRating({ plantId: 'x', scores: { overall: 9 } })).toThrow(); });
  it('aggregates averages ignoring blanks', () => {
    const l = [newRating({ plantId: 'a', scores: sc }), newRating({ plantId: 'a', scores: { overall: 2 } }), newRating({ plantId: 'b', scores: { overall: 5 } })];
    const g = aggregate(l, 'a');
    expect(g.count).toBe(2); expect(g.avg.overall).toBe(3); expect(g.avg.mgmt).toBe(3); expect(g.avg.mgmtN).toBe(1);
    expect(aggregate(l, 'z').avg.overall).toBe(null);
  });
  it('round-trips through a share link as someone else’s rating', () => {
    const r = newRating({ plantId: 'byron', scores: sc, review: 'Good crew', season: 'Spring 2026', craft: 'Pipefitter' }, 5);
    const d = decodeRating(encodeRating(r));
    expect(d).toMatchObject({ id: r.id, plantId: 'byron', scores: sc, review: 'Good crew', season: 'Spring 2026', craft: 'Pipefitter', mine: false, origin: 'shared' });
    expect(ratingShareUrl('https://x/', r)).toMatch(/#\/import\?r=1\./);
    expect(() => decodeRating('bad')).toThrow();
  });
  it('merge keeps newer and dedupes by id', () => {
    const r = newRating({ plantId: 'a', scores: sc }, 1);
    expect(mergeRating([r], { ...r, updatedAt: 0 })).toEqual([r]);
    expect(mergeRating([r], { ...r, review: 'x', updatedAt: 9 })[0].review).toBe('x');
    expect(stars(3.6)).toBe('★★★★☆');
  });
});
