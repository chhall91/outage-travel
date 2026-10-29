// Local test backend for the forum: Node + SQLite, mirroring supabase/schema.sql rules
// (anonymous auth, display names, author-only edit/delete, hide after N reports).
// Usage: node server/forum-server.mjs [--port 8787] [--db server/forum.db] [--static dist-tunnel]
import http from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { validName, validThread, validReply, HIDE_AFTER, CATEGORIES } from '../src/lib/forum.js';

const SCHEMA = `
create table if not exists users (id text primary key, token text unique not null, display_name text, created_at text not null);
create table if not exists threads (id text primary key, board text not null, category text not null, title text not null, body text not null,
  author_id text not null, author_name text not null, created_at text not null, edited_at text, last_activity_at text not null,
  reply_count integer not null default 0, report_count integer not null default 0, hidden integer not null default 0, deleted integer not null default 0);
create index if not exists threads_board on threads(board, last_activity_at desc);
create table if not exists replies (id text primary key, thread_id text not null references threads(id) on delete cascade, body text not null,
  author_id text not null, author_name text not null, created_at text not null, edited_at text,
  report_count integer not null default 0, hidden integer not null default 0, deleted integer not null default 0);
create table if not exists reports (target_type text not null, target_id text not null, reporter_id text not null, reason text, created_at text not null,
  primary key (target_type, target_id, reporter_id));`;

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const now = () => new Date().toISOString();
const row = (r) => r && ({ ...r, hidden: !!r.hidden, deleted: !!r.deleted });

export function createForum(dbPath = ':memory:') {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON'); db.exec(SCHEMA);
  const userByToken = (t) => (t ? db.prepare('select * from users where token = ?').get(t) : null);
  const need = (u) => { if (!u) throw new HttpError(401, 'Sign in first'); return u; };
  const needName = (u) => { need(u); if (!u.display_name) throw new HttpError(400, 'Set a display name before posting'); return u; };
  const canSee = (x, u) => x && ((!x.hidden && !x.deleted) || (u && x.author_id === u.id));
  const recount = (tid) => db.prepare(`update threads set
      reply_count = (select count(*) from replies where thread_id = @tid and deleted = 0 and hidden = 0),
      last_activity_at = max(created_at, coalesce((select max(created_at) from replies where thread_id = @tid and deleted = 0), created_at))
    where id = @tid`).run({ tid });
  const getT = (id) => db.prepare('select * from threads where id = ?').get(id);
  const getR = (id) => db.prepare('select * from replies where id = ?').get(id);

  const api = {
    anon() { const u = { id: randomUUID(), token: randomBytes(24).toString('hex'), display_name: null, created_at: now() }; db.prepare('insert into users values (@id,@token,@display_name,@created_at)').run(u); return { token: u.token, user: { id: u.id, display_name: null } }; },
    me(u) { need(u); return { id: u.id, display_name: u.display_name }; },
    setName(u, name) { need(u); const e = validName(name); if (e) throw new HttpError(400, e); const n = String(name).trim(); db.prepare('update users set display_name = ? where id = ?').run(n, u.id); return { id: u.id, display_name: n }; },
    list(u, { board, category }) {
      const l = db.prepare(`select * from threads where board = ? ${category ? 'and category = ?' : ''} order by last_activity_at desc limit 200`).all(...[board, category].filter(Boolean));
      return l.map(row).filter((x) => canSee(x, u)).map(({ report_count, ...x }) => x);
    },
    counts(u, { board }) { return db.prepare('select category, count(*) n from threads where board = ? and hidden = 0 and deleted = 0 group by category').all(board).reduce((a, r) => ({ ...a, [r.category]: r.n }), {}); },
    thread(u, id) {
      const t = row(getT(id)); if (!canSee(t, u)) throw new HttpError(404, 'Thread not found');
      const replies = db.prepare('select * from replies where thread_id = ? order by created_at').all(id).map(row).filter((x) => canSee(x, u)).map(({ report_count, ...x }) => x);
      const { report_count, ...thread } = t; return { thread, replies };
    },
    createThread(u, b) {
      needName(u); const e = validThread(b || {}); if (e) throw new HttpError(400, e);
      const t = { id: randomUUID(), board: b.board, category: b.category, title: b.title.trim(), body: String(b.body || '').trim(), author_id: u.id, author_name: u.display_name, created_at: now() };
      db.prepare(`insert into threads (id,board,category,title,body,author_id,author_name,created_at,last_activity_at) values (@id,@board,@category,@title,@body,@author_id,@author_name,@created_at,@created_at)`).run(t);
      return row(getT(t.id));
    },
    reply(u, tid, body) {
      needName(u); const t = row(getT(tid)); if (!t || t.hidden || t.deleted) throw new HttpError(404, 'Thread not found');
      const e = validReply(body); if (e) throw new HttpError(400, e);
      const r = { id: randomUUID(), thread_id: tid, body: String(body).trim(), author_id: u.id, author_name: u.display_name, created_at: now() };
      db.prepare('insert into replies (id,thread_id,body,author_id,author_name,created_at) values (@id,@thread_id,@body,@author_id,@author_name,@created_at)').run(r);
      recount(tid); return row(getR(r.id));
    },
    edit(u, type, id, patch) {
      need(u); const x = type === 'thread' ? getT(id) : getR(id);
      if (!x || x.deleted) throw new HttpError(404, 'Not found'); if (x.author_id !== u.id) throw new HttpError(403, 'You can only edit your own posts');
      if (type === 'thread') {
        const n = { ...x, title: patch.title ?? x.title, body: patch.body ?? x.body, category: patch.category ?? x.category };
        const e = validThread(n); if (e) throw new HttpError(400, e);
        db.prepare('update threads set title=?, body=?, category=?, edited_at=? where id=?').run(n.title.trim(), String(n.body).trim(), n.category, now(), id);
        return row(getT(id));
      }
      const e = validReply(patch.body); if (e) throw new HttpError(400, e);
      db.prepare('update replies set body=?, edited_at=? where id=?').run(String(patch.body).trim(), now(), id); return row(getR(id));
    },
    remove(u, type, id) {
      need(u); const x = type === 'thread' ? getT(id) : getR(id);
      if (!x) throw new HttpError(404, 'Not found'); if (x.author_id !== u.id) throw new HttpError(403, 'You can only delete your own posts');
      db.prepare(`update ${type === 'thread' ? 'threads' : 'replies'} set deleted=1, body='' where id=?`).run(id);
      if (type === 'reply') recount(x.thread_id); return { ok: true };
    },
    report(u, type, id, reason = '') {
      need(u); if (!['thread', 'reply'].includes(type)) throw new HttpError(400, 'Bad type');
      const tbl = type === 'thread' ? 'threads' : 'replies'; const x = db.prepare(`select * from ${tbl} where id=?`).get(id);
      if (!x) throw new HttpError(404, 'Not found');
      const ins = db.prepare('insert or ignore into reports values (?,?,?,?,?)').run(type, id, u.id, String(reason).slice(0, 300), now());
      if (ins.changes) {
        db.prepare(`update ${tbl} set report_count = report_count + 1, hidden = (report_count + 1) >= ? where id=?`).run(HIDE_AFTER, id);
        if (type === 'reply') recount(x.thread_id);
      }
      return { ok: true, already: !ins.changes };
    },
    userByToken, db,
  };
  return api;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

export function createServer({ dbPath = ':memory:', staticDir = null } = {}) {
  const f = createForum(dbPath);
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS' }); res.end(JSON.stringify(obj)); };
    if (req.method === 'OPTIONS') return send(204, {});
    if (url.pathname.startsWith('/api/')) {
      try {
        let body = {};
        if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
          let s = ''; for await (const c of req) { s += c; if (s.length > 20000) throw new HttpError(413, 'Too large'); }
          body = s ? JSON.parse(s) : {};
        }
        const u = f.userByToken((req.headers.authorization || '').replace(/^Bearer /, ''));
        const p = url.pathname.slice(5).split('/').filter(Boolean); const m = req.method; const q = Object.fromEntries(url.searchParams);
        let out;
        if (p[0] === 'auth' && p[1] === 'anon' && m === 'POST') out = f.anon();
        else if (p[0] === 'me' && m === 'GET') out = f.me(u);
        else if (p[0] === 'me' && m === 'PUT') out = f.setName(u, body.display_name);
        else if (p[0] === 'threads' && !p[1] && m === 'GET') out = f.list(u, q);
        else if (p[0] === 'counts' && m === 'GET') out = f.counts(u, q);
        else if (p[0] === 'threads' && !p[1] && m === 'POST') out = f.createThread(u, body);
        else if (p[0] === 'threads' && p[1] && p[2] === 'replies' && m === 'POST') out = f.reply(u, p[1], body.body);
        else if (p[0] === 'threads' && p[1] && m === 'GET') out = f.thread(u, p[1]);
        else if ((p[0] === 'threads' || p[0] === 'replies') && p[1] && m === 'PATCH') out = f.edit(u, p[0] === 'threads' ? 'thread' : 'reply', p[1], body);
        else if ((p[0] === 'threads' || p[0] === 'replies') && p[1] && m === 'DELETE') out = f.remove(u, p[0] === 'threads' ? 'thread' : 'reply', p[1]);
        else if (p[0] === 'report' && m === 'POST') out = f.report(u, body.type, body.id, body.reason);
        else throw new HttpError(404, 'No such endpoint');
        return send(200, out);
      } catch (e) { return send(e.status || (e instanceof SyntaxError ? 400 : 500), { error: e.status ? e.message : 'Server error' }); }
    }
    if (!staticDir) return send(404, { error: 'Not found' });
    let fp = resolve(staticDir, '.' + decodeURIComponent(url.pathname));
    if (!fp.startsWith(resolve(staticDir))) return send(403, { error: 'no' });
    if (!existsSync(fp) || statSync(fp).isDirectory()) fp = join(staticDir, 'index.html');
    res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream', 'cache-control': fp.endsWith('.html') || fp.endsWith('sw.js') ? 'no-cache' : 'public, max-age=3600' });
    res.end(readFileSync(fp));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const port = Number(arg('--port', 8787));
  createServer({ dbPath: arg('--db', 'server/forum.db'), staticDir: arg('--static', null) }).listen(port, () => console.log(`forum server on :${port}`));
}
