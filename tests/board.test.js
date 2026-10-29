import { describe, it, expect } from 'vitest';
import { newPost, claimPost, reopenPost, mergePost, encodePost, decodePost, shareUrl } from '../src/lib/board.js';

describe('crew board', () => {
  const base = { kind: 'ride_offer', plantId: 'byron', title: 'Rockford → Byron, days', seats: 3, contact: '555-0100', author: 'Colton' };
  it('creates posts with sync-ready fields', () => {
    const p = newPost(base, 1000);
    expect(p).toMatchObject({ schema: 1, ver: 1, status: 'open', origin: 'local', deleted: false, createdAt: 1000, seats: 3 });
    expect(() => newPost({ kind: 'nope' })).toThrow();
  });
  it('claim / reopen bump version', () => {
    const p = newPost(base, 1000), c = claimPost(p, 'Mike', 2000);
    expect(c).toMatchObject({ status: 'claimed', claimedBy: 'Mike', ver: 2, updatedAt: 2000 });
    expect(reopenPost(c, 3000)).toMatchObject({ status: 'open', ver: 3 });
  });
  it('round-trips through a share link', () => {
    const p = newPost(base, 1000);
    const url = shareUrl('https://x/', p, { start: '2027-03-01', end: '2027-04-01' });
    const { post, outage } = decodePost(url.split('p=')[1]);
    expect(post).toMatchObject({ id: p.id, title: p.title, contact: '555-0100', origin: 'shared' });
    expect(outage).toEqual({ start: '2027-03-01', end: '2027-04-01' });
    expect(() => decodePost('9.zzz')).toThrow();
  });
  it('merge keeps the newer version', () => {
    const p = newPost(base, 1000), c = claimPost(p, 'Mike', 2000);
    expect(mergePost([p], c)[0].status).toBe('claimed');
    expect(mergePost([c], p)[0].status).toBe('claimed');
    expect(mergePost([], p).length).toBe(1);
    expect(encodePost(p).startsWith('1.')).toBe(true);
  });
});
