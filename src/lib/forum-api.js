// Forum data adapter. One interface, two backends:
//  - Supabase: when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set at build time
//  - Local test server (server/forum-server.mjs): when VITE_FORUM_API is set (e.g. "/api")
// Without either, forumApi() returns null and the app shows "Forum is coming soon".
import { get, set } from '../storage.js';

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const LOCAL = import.meta.env.VITE_FORUM_API;
export const forumMode = SB_URL && SB_KEY ? 'supabase' : LOCAL ? 'local' : null;

export function localApi(base, fetchFn = (...a) => fetch(...a), store = { get, set }) {
  const TK = 'ot.forum.token';
  let token = store.get(TK, null);
  const call = async (method, path, body) => {
    const r = await fetchFn(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Server error ${r.status}`);
    return j;
  };
  let uid = null;
  return {
    kind: 'local',
    async init() {
      if (token) { try { const m = await call('GET', '/me'); uid = m.id; return m; } catch { token = null; } }
      const a = await call('POST', '/auth/anon'); token = a.token; store.set(TK, token); uid = a.user.id; return a.user;
    },
    get uid() { return uid; },
    me: () => call('GET', '/me'),
    setName: (n) => call('PUT', '/me', { display_name: n }),
    list: (board, category) => call('GET', `/threads?board=${encodeURIComponent(board)}${category ? `&category=${category}` : ''}`).then((l) => l.filter((x) => !x.deleted)),
    counts: (board) => call('GET', `/counts?board=${encodeURIComponent(board)}`),
    thread: (id) => call('GET', `/threads/${id}`),
    createThread: (t) => call('POST', '/threads', t),
    reply: (tid, body) => call('POST', `/threads/${tid}/replies`, { body }),
    edit: (type, id, patch) => call('PATCH', `/${type === 'thread' ? 'threads' : 'replies'}/${id}`, patch),
    remove: (type, id) => call('DELETE', `/${type === 'thread' ? 'threads' : 'replies'}/${id}`),
    report: (type, id, reason) => call('POST', '/report', { type, id, reason }),
  };
}

const COLS = 'id,board,category,title,body,author_id,author_name,created_at,edited_at,last_activity_at,reply_count,hidden,deleted';
export function supabaseApi(createClient, url, key) {
  const sb = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ot.forum.sb' } });
  let uid = null;
  const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  return {
    kind: 'supabase',
    async init() {
      let { data: { session } } = await sb.auth.getSession();
      if (!session) session = ok(await sb.auth.signInAnonymously()).session;
      uid = session.user.id;
      return this.me();
    },
    get uid() { return uid; },
    async me() { const d = ok(await sb.from('profiles').select('display_name').eq('id', uid).maybeSingle()); return { id: uid, display_name: d?.display_name || null }; },
    async setName(n) { ok(await sb.from('profiles').upsert({ id: uid, display_name: String(n).trim() })); return { id: uid, display_name: String(n).trim() }; },
    async list(board, category) {
      let q = sb.from('forum_threads').select(COLS).eq('board', board).eq('deleted', false).order('last_activity_at', { ascending: false }).limit(200);
      if (category) q = q.eq('category', category);
      return ok(await q);
    },
    async counts(board) {
      const l = ok(await sb.from('forum_threads').select('category').eq('board', board).eq('deleted', false).eq('hidden', false));
      return l.reduce((a, r) => ({ ...a, [r.category]: (a[r.category] || 0) + 1 }), {});
    },
    async thread(id) {
      const thread = ok(await sb.from('forum_threads').select(COLS).eq('id', id).maybeSingle());
      if (!thread || thread.deleted) throw new Error('Thread not found');
      const replies = ok(await sb.from('forum_replies').select('id,thread_id,body,author_id,author_name,created_at,edited_at,hidden,deleted').eq('thread_id', id).eq('deleted', false).order('created_at'));
      return { thread, replies };
    },
    async createThread(t) { return ok(await sb.from('forum_threads').insert({ board: t.board, category: t.category, title: t.title.trim(), body: String(t.body || '').trim() }).select(COLS).single()); },
    async reply(tid, body) { return ok(await sb.from('forum_replies').insert({ thread_id: tid, body: String(body).trim() }).select().single()); },
    async edit(type, id, patch) { return ok(await sb.from(type === 'thread' ? 'forum_threads' : 'forum_replies').update(patch).eq('id', id).select().single()); },
    async remove(type, id) { ok(await sb.from(type === 'thread' ? 'forum_threads' : 'forum_replies').update({ deleted: true }).eq('id', id)); return { ok: true }; },
    async report(type, id, reason) {
      const { error } = await sb.from('forum_reports').insert({ target_type: type, target_id: id, reason: reason || '' });
      if (error && error.code !== '23505') throw new Error(error.message);
      return { ok: true, already: !!error };
    },
  };
}

let inst = null;
export async function forumApi() {
  if (inst) return inst;
  if (forumMode === 'supabase') { const { createClient } = await import('@supabase/supabase-js'); inst = supabaseApi(createClient, SB_URL, SB_KEY); }
  else if (forumMode === 'local') inst = localApi(LOCAL);
  return inst;
}
