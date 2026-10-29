// Forum screens. Routes: #/forum[/<board>][?c=cat]  #/forum/t/<id>  #/forum/new?b=&c=  #/forum/edit/<type>/<id>
import { CATEGORIES, OVERALL, GUIDELINES, HIDE_AFTER, looksSensitive, validName, validThread, validReply, timeAgo } from './lib/forum.js';
import { forumApi, forumMode } from './lib/forum-api.js';
import { get, set } from './storage.js';

export function makeForum({ view, chrome, toast, esc, plantById, $ }) {
  let me = null;
  const boardName = (b) => (b === OVERALL ? 'Overall' : plantById[b]?.name || b);
  const lastPlant = () => get('ot.forum.plant', null);
  const loading = () => { view.innerHTML = '<div class="card"><p class="hint">Loading forum…</p></div>'; };
  const fail = (e) => { view.innerHTML = `<div class="card"><h3>Couldn’t reach the forum</h3><p class="hint">${esc(e.message || e)}</p><p class="hint">Check your signal and try again.</p><button class="btn ghost" id="retry">Try again</button></div>`; $('retry').onclick = () => window.dispatchEvent(new HashChangeEvent('hashchange')); };
  async function api() { const a = await forumApi(); if (a && !me) me = await a.init(); return a; }
  const guide = (open = false) => `<details class="card guide"${open ? ' open' : ''}><summary>📋 Posting guidelines</summary><ul>${GUIDELINES.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>
    <p class="hint">Posts reported by ${HIDE_AFTER} people are hidden until reviewed.</p></details>`;
  const meta = (x) => `<span class="fmeta"><b>${esc(x.author_name)}</b> · ${timeAgo(x.created_at)}${x.edited_at ? ' · edited' : ''}${x.hidden ? ' · <span class="bad-t">hidden (reported)</span>' : ''}</span>`;
  const mine = (x) => me && x.author_id === me.id;
  const actions = (type, x) => mine(x)
    ? `<div class="factions"><a class="btn-sm" href="#/forum/edit/${type}/${x.id}${type === 'reply' ? `?t=${x.thread_id}` : ''}">Edit</a><button class="btn-sm" data-del="${type}" data-id="${x.id}">Delete</button></div>`
    : `<div class="factions"><button class="btn-sm flag" data-rep="${type}" data-id="${x.id}" aria-label="Report">⚑ Report</button></div>`;

  function comingSoon() {
    view.innerHTML = `<div class="card empty"><div class="big">💬</div><h2>Forum is coming soon</h2>
      <p class="hint">A place to talk with other travelers — one board per plant plus an overall board, with Housing, Food & local, Rides, Work & pay, and General.</p>
      <p class="hint">Everything else in the app works as usual. Check back after the next update.</p></div>`;
  }

  async function nameGate(a) {
    if (me?.display_name) return true;
    return new Promise((done) => {
      const d = document.createElement('div'); d.className = 'sheet-wrap';
      d.innerHTML = `<form class="sheet" id="nf"><h3>Pick a display name</h3><p class="hint">Shown on your posts. A nickname is fine — no real name needed.</p>
        <input type="text" id="dname" maxlength="30" placeholder="e.g. Pipefitter Mike" autocomplete="nickname"><p class="hint bad-t" id="nerr"></p>
        <div class="row gap"><button type="button" class="btn ghost" id="ncan">Cancel</button><button class="btn primary">Save</button></div></form>`;
      document.body.appendChild(d); $('dname').focus();
      $('ncan').onclick = () => { d.remove(); done(false); };
      $('nf').onsubmit = async (e) => { e.preventDefault(); const n = $('dname').value; const err = validName(n); if (err) { $('nerr').textContent = err; return; }
        try { me = await a.setName(n); d.remove(); toast(`Posting as ${me.display_name}`); done(true); } catch (x) { $('nerr').textContent = x.message; } };
    });
  }
  const sensitiveOk = (...s) => !looksSensitive(s.join(' ')) || confirm('Heads up: this might mention security or site-layout details. Those aren’t allowed here. Post anyway?');

  async function board(b, cat) {
    if (!forumMode) { chrome('Forum', { back: true }); return comingSoon(); }
    if (!b) b = lastPlant() || OVERALL;
    if (b !== OVERALL && !plantById[b]) b = OVERALL;
    if (b !== OVERALL) set('ot.forum.plant', b);
    const lp = b !== OVERALL ? b : lastPlant();
    chrome(b === OVERALL ? 'Forum' : `${boardName(b)} forum`, { back: true });
    loading();
    let a, list, counts;
    try { a = await api(); [list, counts] = await Promise.all([a.list(b, cat || null), a.counts(b)]); } catch (e) { return fail(e); }
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    view.innerHTML = `
      ${lp ? `<div class="seg" role="tablist"><a class="segbtn ${b !== OVERALL ? 'on' : ''}" href="#/forum/${lp}">⚛ ${esc(boardName(lp))}</a><a class="segbtn ${b === OVERALL ? 'on' : ''}" href="#/forum/${OVERALL}">🌎 Overall</a></div>` : ''}
      <div class="chips"><a class="chip ${!cat ? 'on' : ''}" href="#/forum/${b}">All <small>${total}</small></a>${Object.entries(CATEGORIES).map(([k, v]) => `<a class="chip ${cat === k ? 'on' : ''}" href="#/forum/${b}?c=${k}">${v.icon} ${esc(v.label)} <small>${counts[k] || 0}</small></a>`).join('')}</div>
      <a class="btn primary" href="#/forum/new?b=${b}${cat ? `&c=${cat}` : ''}">＋ New thread</a>
      <div class="tlist mt">${list.length ? list.map((t) => `<a class="tcard${t.hidden ? ' dim' : ''}" href="#/forum/t/${t.id}">
          <div class="thead"><b>${esc(t.title)}</b><span class="rc" aria-label="${t.reply_count} replies">💬 ${t.reply_count}</span></div>
          <div class="osub"><span class="pill">${CATEGORIES[t.category]?.icon || ''} ${esc(CATEGORIES[t.category]?.label || t.category)}</span> ${esc(t.author_name)} · ${timeAgo(t.last_activity_at)}${t.hidden ? ' · hidden' : ''}</div></a>`).join('')
        : `<div class="card empty"><p class="hint">No threads${cat ? ` in ${esc(CATEGORIES[cat].label)}` : ''} on the ${esc(boardName(b))} board yet. Start one!</p></div>`}</div>
      ${guide()}
      ${me?.display_name ? `<p class="fine">Posting as <b>${esc(me.display_name)}</b> · <a href="#" id="rename">change</a></p>` : ''}`;
    if ($('rename')) $('rename').onclick = async (e) => { e.preventDefault(); me = { ...me, display_name: null }; if (await nameGate(a)) board(b, cat); };
  }

  function wireActions(a, rerender, onDeleteThread) {
    view.onclick = async (e) => {
      const del = e.target.closest('[data-del]'); const rep = e.target.closest('[data-rep]');
      try {
        if (del) { if (!confirm(`Delete this ${del.dataset.del === 'thread' ? 'thread' : 'reply'}?`)) return; await a.remove(del.dataset.del, del.dataset.id); toast('Deleted'); del.dataset.del === 'thread' ? onDeleteThread() : rerender(); }
        if (rep) { const reason = prompt('Report this post? Say briefly what’s wrong (security info, naming someone, disrespect…).', ''); if (reason === null) return;
          const r = await a.report(rep.dataset.rep, rep.dataset.id, reason); toast(r.already ? 'You already reported this' : 'Reported — thanks'); rerender(); }
      } catch (x) { toast(x.message); }
    };
  }

  async function thread(id) {
    if (!forumMode) { chrome('Forum', { back: true }); return comingSoon(); }
    chrome('Thread', { back: true }); loading();
    let a, d; try { a = await api(); d = await a.thread(id); } catch (e) { return fail(e); }
    const { thread: t, replies } = d;
    chrome(`${boardName(t.board)} · ${CATEGORIES[t.category]?.label || ''}`, { back: true });
    view.innerHTML = `
      <article class="card post${t.hidden ? ' dim' : ''}"><h2 class="ttitle">${esc(t.title)}</h2>${meta(t)}
        ${t.body ? `<p class="pre">${esc(t.body)}</p>` : ''}${actions('thread', t)}</article>
      <h3 class="mt">${replies.length} repl${replies.length === 1 ? 'y' : 'ies'}</h3>
      ${replies.map((r) => `<article class="card post reply${r.hidden ? ' dim' : ''}" id="r-${r.id}">${meta(r)}<p class="pre">${esc(r.body)}</p>${actions('reply', r)}</article>`).join('')}
      <form class="card" id="rf"><label class="lbl" for="rbody">Reply</label><textarea id="rbody" rows="3" maxlength="4000" placeholder="Be helpful, be respectful."></textarea>
        <p class="hint">No security or site-layout info. Don’t name individuals.</p><button class="btn primary mt">Post reply</button></form>
      <a class="btn ghost" href="#/forum/${t.board}?c=${t.category}">Back to ${esc(boardName(t.board))} · ${esc(CATEGORIES[t.category]?.label || '')}</a>`;
    wireActions(a, () => thread(id), () => location.replace(`#/forum/${t.board}`));
    $('rf').onsubmit = async (e) => {
      e.preventDefault(); const body = $('rbody').value; const err = validReply(body); if (err) return toast(err);
      if (!sensitiveOk(body) || !(await nameGate(a))) return;
      try { await a.reply(id, body); toast('Reply posted'); thread(id); setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 50); } catch (x) { toast(x.message); }
    };
  }

  async function form(q, editType, editId) {
    if (!forumMode) { chrome('Forum', { back: true }); return comingSoon(); }
    chrome(editType ? 'Edit' : 'New thread', { back: true }); loading();
    let a, x = null, b = q.b || OVERALL; try { a = await api();
      if (editType === 'thread') { x = (await a.thread(editId)).thread; b = x.board; }
      if (editType === 'reply') { const tid = q.t; const d = tid && await a.thread(tid); x = d?.replies.find((r) => r.id === editId); if (!x) throw new Error('Reply not found'); }
    } catch (e) { return fail(e); }
    if (x && !mine(x)) { view.innerHTML = '<div class="card"><p class="hint">You can only edit your own posts.</p></div>'; return; }
    if (editType === 'reply') {
      view.innerHTML = `<form class="card" id="ef"><label class="lbl" for="fbody">Reply</label><textarea id="fbody" rows="6" maxlength="4000">${esc(x.body)}</textarea><button class="btn primary mt">Save</button></form>`;
      $('ef').onsubmit = async (e) => { e.preventDefault(); const body = $('fbody').value; const err = validReply(body); if (err) return toast(err); if (!sensitiveOk(body)) return;
        try { await a.edit('reply', editId, { body }); toast('Saved'); history.back(); } catch (y) { toast(y.message); } };
      return;
    }
    const cat = x?.category || (CATEGORIES[q.c] ? q.c : 'general');
    view.innerHTML = `${guide(!x)}<form class="card" id="tf">
      <p class="hint">Board: <b>${esc(boardName(b))}</b></p>
      <span class="lbl">Category</span><div class="seg wrap" id="cats">${Object.entries(CATEGORIES).map(([k, v]) => `<button type="button" class="segbtn ${k === cat ? 'on' : ''}" data-c="${k}">${v.icon} ${esc(v.label)}</button>`).join('')}</div>
      <label class="field"><span class="lbl">Title</span><input type="text" id="ftitle" maxlength="120" placeholder="e.g. Room for rent near the plant?" value="${esc(x?.title || '')}"></label>
      <label class="field"><span class="lbl">Details</span><textarea id="fbody" rows="6" maxlength="4000" placeholder="Dates, prices, what you need…">${esc(x?.body || '')}</textarea></label>
      <button class="btn primary mt">${x ? 'Save' : 'Post thread'}</button></form>`;
    let c = cat;
    $('cats').onclick = (e) => { const k = e.target.closest('[data-c]'); if (!k) return; c = k.dataset.c; view.querySelectorAll('#cats .segbtn').forEach((n) => n.classList.toggle('on', n === k)); };
    $('tf').onsubmit = async (e) => {
      e.preventDefault(); const t = { board: b, category: c, title: $('ftitle').value, body: $('fbody').value };
      const err = validThread(t); if (err) return toast(err); if (!sensitiveOk(t.title, t.body)) return;
      try {
        if (x) { await a.edit('thread', x.id, { title: t.title, body: t.body, category: t.category }); toast('Saved'); location.replace(`#/forum/t/${x.id}`); }
        else { if (!(await nameGate(a))) return; const n = await a.createThread(t); toast('Thread posted'); location.replace(`#/forum/t/${n.id}`); }
      } catch (y) { toast(y.message); }
    };
  }

  function route(parts, q) {
    view.onclick = null;
    if (parts[1] === 't' && parts[2]) return thread(parts[2]);
    if (parts[1] === 'new') return form(q);
    if (parts[1] === 'edit' && parts[3]) return form(q, parts[2], parts[3]);
    return board(parts[1], CATEGORIES[q.c] ? q.c : null);
  }
  return { route, enabled: !!forumMode };
}
