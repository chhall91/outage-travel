// Plant ratings from workers. Shape is aggregation-ready: one record per (author device, plant, season),
// numeric 1-5 per dimension, null = not rated. A backend can average by plantId and dimension.
import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate';
export const DIMS = [
  ['overall', 'Overall'], ['mgmt', 'Management / supervision'], ['pay', 'Pay & per diem'],
  ['housing', 'Housing availability'], ['area', 'Local area'], ['gate', 'Gate / badging wait'],
].map(([id, label]) => ({ id, label }));
export const LIMITS = { review: 400, season: 20, craft: 40 };
const clip = (s, n) => String(s ?? '').trim().slice(0, n);
const star = (v) => { const n = Math.round(Number(v)); return n >= 1 && n <= 5 ? n : null; };
const rid = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export function newRating(f, now = Date.now()) {
  const scores = Object.fromEntries(DIMS.map((d) => [d.id, star(f.scores?.[d.id])]));
  if (!scores.overall) throw new Error('overall rating required');
  return { id: f.id || rid(), schema: 1, plantId: clip(f.plantId, 40), scores, review: clip(f.review, LIMITS.review),
    season: clip(f.season, LIMITS.season), craft: clip(f.craft, LIMITS.craft), mine: f.mine !== false,
    origin: f.origin || 'local', createdAt: f.createdAt || now, updatedAt: now };
}
/** Average per dimension (ignoring nulls) + count, for one plant. */
export function aggregate(list, plantId) {
  const rs = list.filter((r) => r.plantId === plantId);
  const avg = {};
  for (const d of DIMS) { const v = rs.map((r) => r.scores[d.id]).filter((x) => x); avg[d.id] = v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null; avg[d.id + 'N'] = v.length; }
  return { count: rs.length, avg };
}
export function mergeRating(list, r) { const i = list.findIndex((x) => x.id === r.id); if (i < 0) return [...list, r]; if (r.updatedAt <= list[i].updatedAt) return list; const o = list.slice(); o[i] = r; return o; }
const b64u = (u8) => { let s = ''; u8.forEach((c) => { s += String.fromCharCode(c); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (s) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
export function encodeRating(r) {
  const o = { i: r.id, p: r.plantId, s: DIMS.map((d) => r.scores[d.id] || 0), v: r.review, se: r.season, c: r.craft, t: r.createdAt, u: r.updatedAt };
  return '1.' + b64u(deflateSync(strToU8(JSON.stringify(o))));
}
export function decodeRating(code) {
  if (!code || !code.startsWith('1.')) throw new Error('Unknown share format');
  const o = JSON.parse(strFromU8(inflateSync(unb64u(code.slice(2)))));
  const r = newRating({ id: o.i, plantId: o.p, scores: Object.fromEntries(DIMS.map((d, k) => [d.id, o.s?.[k]])), review: o.v, season: o.se, craft: o.c, mine: false, origin: 'shared', createdAt: o.t }, o.u || Date.now());
  return { ...r, updatedAt: o.u || r.updatedAt };
}
export const ratingShareUrl = (base, r) => `${base}#/import?r=${encodeRating(r)}`;
export const stars = (v) => v == null ? '—' : '★'.repeat(Math.round(v)) + '☆'.repeat(5 - Math.round(v));
