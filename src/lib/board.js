// Crew board: local-first posts, shaped for a later sync backend (id, ver, updatedAt, origin, deleted).
import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate';
export const KINDS = {
  room_avail: { label: 'Room available', icon: '🛏️' },
  room_need: { label: 'Need a room', icon: '🔎' },
  ride_offer: { label: 'Ride offered', icon: '🚗' },
  ride_need: { label: 'Need a ride', icon: '🙋' },
};
export const LIMITS = { title: 80, details: 600, contact: 120, name: 60 };
const clip = (s, n) => String(s ?? '').trim().slice(0, n);
export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
export function newPost(f, now = Date.now()) {
  if (!KINDS[f.kind]) throw new Error('bad kind');
  return {
    id: f.id || uid(), schema: 1, outageId: f.outageId || null, plantId: clip(f.plantId, 40),
    kind: f.kind, title: clip(f.title, LIMITS.title) || KINDS[f.kind].label, details: clip(f.details, LIMITS.details),
    when: clip(f.when, 40), seats: Math.max(0, Math.min(20, parseInt(f.seats, 10) || 0)), price: clip(f.price, 30),
    contact: clip(f.contact, LIMITS.contact), author: clip(f.author, LIMITS.name),
    status: 'open', claimedBy: '', ver: 1, createdAt: now, updatedAt: now, origin: f.origin || 'local', deleted: false,
  };
}
export function editPost(p, changes, now = Date.now()) { return { ...p, ...changes, ver: (p.ver || 1) + 1, updatedAt: now }; }
export const claimPost = (p, by, now) => editPost(p, { status: 'claimed', claimedBy: clip(by, LIMITS.name) }, now);
export const reopenPost = (p, now) => editPost(p, { status: 'open', claimedBy: '' }, now);

/** Merge an incoming post into a list: newer ver/updatedAt wins (ready for backend sync). */
export function mergePost(list, incoming) {
  const i = list.findIndex((p) => p.id === incoming.id);
  if (i < 0) return [incoming, ...list];
  const cur = list[i];
  const newer = (incoming.ver || 0) > (cur.ver || 0) || ((incoming.ver || 0) === (cur.ver || 0) && incoming.updatedAt > cur.updatedAt);
  if (!newer) return list;
  const out = list.slice(); out[i] = incoming; return out;
}

const b64u = (u8) => { let s = ''; u8.forEach((c) => { s += String.fromCharCode(c); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (s) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
const SHARE_KEYS = ['id', 'plantId', 'kind', 'title', 'details', 'when', 'seats', 'price', 'contact', 'author', 'status', 'claimedBy', 'ver', 'createdAt', 'updatedAt'];
export function encodePost(p, outage) {
  const o = Object.fromEntries(SHARE_KEYS.map((k) => [k, p[k]]));
  if (outage) o.o = { start: outage.start || '', end: outage.end || '' };
  return '1.' + b64u(deflateSync(strToU8(JSON.stringify(o))));
}
export function decodePost(code) {
  if (!code || !code.startsWith('1.')) throw new Error('Unknown share format');
  const o = JSON.parse(strFromU8(inflateSync(unb64u(code.slice(2)))));
  const p = newPost({ ...o, origin: 'shared' }, o.createdAt || Date.now());
  return { post: { ...p, status: o.status === 'claimed' ? 'claimed' : 'open', claimedBy: clip(o.claimedBy, LIMITS.name), ver: o.ver || 1, updatedAt: o.updatedAt || p.updatedAt }, outage: o.o || null };
}
export const shareUrl = (base, p, outage) => `${base}#/import?p=${encodePost(p, outage)}`;
