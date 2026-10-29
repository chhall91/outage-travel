// localStorage wrapper (safe when storage is blocked). Keys are prefixed "ot.".
const mem = {};
export function get(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
  catch { return key in mem ? mem[key] : fallback; }
}
export function set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { mem[key] = value; } }

function collection(key) {
  return {
    all: () => get(key, []),
    get: (id) => get(key, []).find((x) => x.id === id),
    put(item) { const l = get(key, []); const i = l.findIndex((x) => x.id === item.id); if (i >= 0) l[i] = item; else l.unshift(item); set(key, l); return item; },
    remove(id) { set(key, get(key, []).filter((x) => x.id !== id)); },
    save: (l) => set(key, l),
  };
}
export const outages = collection('ot.outages');
export const posts = collection('ot.posts');
export const notes = collection('ot.notes');
