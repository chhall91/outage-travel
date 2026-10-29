// Distance + rough drive estimate. Pure functions.
const R_MI = 3958.8;
const rad = (d) => (d * Math.PI) / 180;
export function milesBetween(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}
// Rural roads: ~1.3× straight-line distance at ~45 mph average. A rough planning number, not a route.
export const ROAD_FACTOR = 1.3, AVG_MPH = 45;
export function driveEstimate(miles) {
  const road = miles * ROAD_FACTOR;
  return { roadMiles: Math.round(road), minutes: Math.round((road / AVG_MPH) * 60) };
}
/** Bounding box around a point for a radius in miles. */
export function bbox(lat, lon, miles) {
  const dLat = miles / 69.0, dLon = miles / (69.172 * Math.cos(rad(lat)));
  const f = (x) => Math.round(x * 10000) / 10000;
  return { sw: { lat: f(lat - dLat), lon: f(lon - dLon) }, ne: { lat: f(lat + dLat), lon: f(lon + dLon) } };
}
export function zoomFor(miles) { return miles <= 10 ? 12 : miles <= 20 ? 11 : miles <= 40 ? 10 : 9; }
export const fmtDrive = (min) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`);
