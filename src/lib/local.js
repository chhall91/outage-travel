// Food & local amenities: one-tap map searches near the plant. No listings are invented.
import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate';
import { zoomFor } from './geo.js';
export const SECTIONS = [
  { id: 'food', title: 'Food', icon: '🍽️', items: [
    ['local', '🍴', 'Local restaurants', 'local restaurants', 'Restaurants'],
    ['breakfast', '🍳', 'Diners & breakfast', 'diner breakfast open early', 'Breakfast & Brunch', 'Early opens for day shift'],
    ['24h', '🌙', '24-hour food', '24 hour restaurant', 'Open 24 hours', 'For night shift'],
    ['bbq', '🍖', 'BBQ & local favorites', 'BBQ', 'BBQ'],
    ['pizza', '🍕', 'Pizza & delivery', 'pizza delivery', 'Pizza'],
    ['grocery', '🛒', 'Grocery stores', 'grocery store', 'Grocery'],
    ['coffee', '☕', 'Coffee', 'coffee', 'Coffee'],
    ['gasfood', '⛽', 'Gas station food', 'gas station convenience store', 'Convenience store'],
  ] },
  { id: 'needs', title: 'Daily needs', icon: '🧺', items: [
    ['laundry', '🧺', 'Laundromats', 'laundromat', 'Laundromat'],
    ['gym', '🏋️', 'Gyms', 'gym', 'Gym'],
    ['pharmacy', '💊', 'Pharmacies', 'pharmacy', 'Pharmacy'],
    ['urgent', '🏥', 'Urgent care & hospital', 'urgent care', 'Urgent care', 'Emergency? Call 911'],
    ['walmart', '🏬', 'Walmart & Target', 'Walmart', 'Department stores'],
    ['hardware', '🔨', "Lowe's / Home Depot / hardware", 'hardware store', 'Hardware stores'],
    ['boots', '🥾', 'Work boots & workwear', 'work boots workwear Tractor Supply', 'Work boots'],
    ['auto', '🔧', 'Auto repair & tires', 'auto repair tires', 'Auto repair'],
    ['truck', '🚛', 'Truck stops & fuel', 'truck stop', 'Truck stop'],
    ['bank', '🏦', 'Banks & ATMs', 'bank ATM', 'Banks'],
    ['church', '⛪', 'Churches', 'church', 'Churches'],
    ['barber', '💈', 'Barbers', 'barber shop', 'Barbers'],
  ] },
  { id: 'down', title: 'Downtime', icon: '🎣', items: [
    ['bars', '🍺', 'Bars & breweries', 'bar brewery', 'Bars'],
    ['outdoors', '🎣', 'Fishing & outdoors', 'fishing bait tackle boat launch', 'Fishing'],
    ['movies', '🎬', 'Movie theaters', 'movie theater', 'Cinema'],
  ] },
].map((s) => ({ ...s, items: s.items.map(([id, icon, label, q, yelp, note]) => ({ id, icon, label, q, yelp, note: note || '' })) }));

export const mapsSearch = (plant, q, miles = 25) =>
  `https://www.google.com/maps/search/${encodeURIComponent(q).replace(/%20/g, '+')}/@${plant.lat},${plant.lon},${zoomFor(miles)}z`;
export const yelpSearch = (plant, desc, town) => {
  const t = town || { city: plant.city, st: plant.state };
  return `https://www.yelp.com/search?find_desc=${encodeURIComponent(desc)}&find_loc=${encodeURIComponent(`${t.city}, ${t.st}`)}`;
};

// Favorites / notes, saved per outage, shareable by link.
export const NOTE_LIMITS = { name: 80, note: 300 };
const clip = (s, n) => String(s ?? '').trim().slice(0, n);
export function newNote(f, now = Date.now()) {
  const name = clip(f.name, NOTE_LIMITS.name);
  if (!name) throw new Error('name required');
  return { id: f.id || 'n' + now.toString(36) + Math.random().toString(36).slice(2, 8), outageId: f.outageId || null, plantId: clip(f.plantId, 40), name, note: clip(f.note, NOTE_LIMITS.note), cat: clip(f.cat, 20), createdAt: now };
}
const b64u = (u8) => { let s = ''; u8.forEach((c) => { s += String.fromCharCode(c); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (s) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
export function encodeNotes(plantId, notes) {
  return '1.' + b64u(deflateSync(strToU8(JSON.stringify({ p: plantId, n: notes.map((x) => [x.name, x.note, x.cat || '']) }))));
}
export function decodeNotes(code) {
  if (!code || !code.startsWith('1.')) throw new Error('Unknown share format');
  const o = JSON.parse(strFromU8(inflateSync(unb64u(code.slice(2)))));
  const now = Date.now();
  return { plantId: clip(o.p, 40), notes: (o.n || []).slice(0, 100).map(([name, note, cat], i) => newNote({ name, note, cat, plantId: o.p }, now + i)).filter(Boolean) };
}
/** Merge imported notes, skipping exact duplicates (same name + note). */
export function mergeNotes(list, incoming) {
  const key = (x) => (x.name + '|' + x.note).toLowerCase();
  const seen = new Set(list.map(key));
  return [...list, ...incoming.filter((x) => !seen.has(key(x)) && seen.add(key(x)))];
}
export const notesShareUrl = (base, plantId, notes) => `${base}#/import?n=${encodeNotes(plantId, notes)}`;
