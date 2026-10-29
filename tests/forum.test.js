import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { validName, validThread, validReply, shouldHide, sortThreads, visible, looksSensitive, timeAgo, HIDE_AFTER, CATEGORIES } from '../src/lib/forum.js';
import { localApi } from '../src/lib/forum-api.js';

let srv = null;
try { srv = await import('../server/forum-server.mjs'); } catch { /* better-sqlite3 not installed */ }

describe('forum rules', () => {
  it('has the five categories', () => expect(Object.keys(CATEGORIES)).toEqual(['housing', 'food', 'rides', 'work', 'general']));
  it('validates names', () => { expect(validName('x')).toBeTruthy(); expect(validName('Pipefitter Mike')).toBeNull(); expect(validName('a'.repeat(31))).toBeTruthy(); });
  it('validates threads', () => {
    expect(validThread({ board: 'overall', category: 'housing', title: 'Room?' })).toBeNull();
    expect(validThread({ board: 'overall', category: 'nope', title: 'Room?' })).toMatch(/category/);
    expect(validThread({ board: 'Bad Board!', category: 'housing', title: 'Room?' })).toMatch(/board/);
    expect(validThread({ board: 'overall', category: 'housing', title: 'hi' })).toMatch(/title/);
    expect(validThread({ board: 'overall', category: 'housing', title: 'ok ok', body: 'x'.repeat(4001) })).toBeTruthy();
  });
  it('validates replies', () => { expect(validReply('   ')).toBeTruthy(); expect(validReply('thanks')).toBeNull(); });
  it('hides after N reports', () => { expect(shouldHide(HIDE_AFTER - 1)).toBe(false); expect(shouldHide(HIDE_AFTER)).toBe(true); });
  it('sorts newest activity first', () => expect(sortThreads([{ id: 1, last_activity_at: '2026-01-01' }, { id: 2, last_activity_at: '2026-02-01' }]).map((x) => x.id)).toEqual([2, 1]));
  it('authors still see their own hidden posts', () => { const x = { hidden: true, author_id: 'a' }; expect(visible(x, 'a')).toBe(true); expect(visible(x, 'b')).toBe(false); });
  it('flags security-ish words', () => { expect(looksSensitive('what is the gate code')).toBe(true); expect(looksSensitive('cheap room in Oswego')).toBe(false); });
  it('formats time ago', () => { const n = Date.parse('2026-10-29T12:00:00Z'); expect(timeAgo('2026-10-29T11:58:00Z', n)).toBe('2m ago'); expect(timeAgo('2026-10-28T12:00:00Z', n)).toBe('1d ago'); });
  it('schema mirrors the rules', () => {
    const sql = readFileSync('supabase/schema.sql', 'utf8');
    expect(sql).toContain(`hide_after int := ${HIDE_AFTER}`);
    for (const k of Object.keys(CATEGORIES)) expect(sql).toContain(`'${k}'`);
    for (const t of ['profiles', 'forum_threads', 'forum_replies', 'forum_reports']) expect(sql).toMatch(new RegExp(`alter table public.${t} enable row level security`));
  });
});

describe.skipIf(!srv)('local forum server via the app adapter', () => {
  let server, base;
  const mem = () => { const m = {}; return { get: (k, d) => (k in m ? m[k] : d), set: (k, v) => { m[k] = v; } }; };
  beforeAll(async () => { server = srv.createServer(); await new Promise((r) => server.listen(0, r)); base = `http://127.0.0.1:${server.address().port}/api`; });
  afterAll(() => server.close());

  it('two users post, reply, edit, delete, and report', async () => {
    const A = localApi(base, fetch, mem()); const B = localApi(base, fetch, mem()); const C = localApi(base, fetch, mem()); const D = localApi(base, fetch, mem());
    for (const u of [A, B, C, D]) await u.init();
    await expect(A.createThread({ board: 'overall', category: 'housing', title: 'Rooms?' })).rejects.toThrow(/display name/);
    await A.setName('Colton'); await B.setName('Sparky'); await C.setName('Rigger'); await D.setName('Welder');
    const t1 = await A.createThread({ board: 'nine-mile-point', category: 'housing', title: 'Room near Oswego?', body: 'Need 6 weeks' });
    await new Promise((r) => setTimeout(r, 5));
    const t2 = await B.createThread({ board: 'nine-mile-point', category: 'rides', title: 'Carpool from Fulton' });
    await new Promise((r) => setTimeout(r, 5));
    await B.reply(t1.id, 'Try the place on Route 104');
    let l = await A.list('nine-mile-point');
    expect(l.map((x) => x.id)).toEqual([t1.id, t2.id]); // reply bumped t1 to the top
    expect(l[0].reply_count).toBe(1);
    expect((await A.list('nine-mile-point', 'rides')).length).toBe(1);
    expect(await A.counts('nine-mile-point')).toEqual({ housing: 1, rides: 1 });
    expect((await A.list('overall')).length).toBe(0);
    // edit own; can't edit others
    await A.edit('thread', t1.id, { title: 'Room near Oswego, 6 wks' });
    await expect(B.edit('thread', t1.id, { title: 'hacked' })).rejects.toThrow(/own/);
    const d = await A.thread(t1.id); expect(d.thread.title).toBe('Room near Oswego, 6 wks'); expect(d.thread.edited_at).toBeTruthy(); expect(d.replies[0].author_name).toBe('Sparky');
    // report: duplicates don't count; hidden after 3 distinct
    const rid = d.replies[0].id;
    await A.report('reply', rid, 'rude'); expect((await A.report('reply', rid, 'again')).already).toBe(true);
    await C.report('reply', rid); expect((await A.thread(t1.id)).replies.length).toBe(1);
    await D.report('reply', rid);
    expect((await A.thread(t1.id)).replies.length).toBe(0);
    expect((await B.thread(t1.id)).replies[0].hidden).toBe(true); // author still sees it, flagged
    expect((await A.list('nine-mile-point'))[0].reply_count).toBe(0);
    // delete own
    await expect(A.remove('thread', t2.id)).rejects.toThrow(/own/);
    await B.remove('thread', t2.id);
    expect((await A.list('nine-mile-point')).map((x) => x.id)).toEqual([t1.id]);
  });
});
