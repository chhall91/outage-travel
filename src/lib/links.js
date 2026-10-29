// Deep links to housing searches centered on a plant. No listings are invented — these open the real sites.
import { bbox, zoomFor } from './geo.js';
const STATES = { AL: 'Alabama', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CT: 'Connecticut', FL: 'Florida', GA: 'Georgia', IL: 'Illinois', KS: 'Kansas', LA: 'Louisiana', MD: 'Maryland', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', NE: 'Nebraska', NH: 'New Hampshire', NJ: 'New Jersey', NY: 'New York', NC: 'North Carolina', OH: 'Ohio', PA: 'Pennsylvania', SC: 'South Carolina', TN: 'Tennessee', TX: 'Texas', VA: 'Virginia', WA: 'Washington', WI: 'Wisconsin', DE: 'Delaware' };
export const stateName = (st) => STATES[st] || st;

/** Reference town from the NRC location text, e.g. "6 miles NE of Oswego, NY" → {city:'Oswego', st:'NY'} */
export function refTown(nrcLocation) {
  const m = /of\s+(.+),\s*([A-Z]{2})\s*$/.exec(nrcLocation || '');
  return m ? { city: m[1].trim(), st: m[2] } : null;
}
const slug = (s) => s.toLowerCase().replace(/\./g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function housingLinks(plant, { miles = 25, checkin = '', checkout = '', town } = {}) {
  const { lat, lon } = plant;
  const t = town || { city: plant.city, st: plant.state };
  const place = `${t.city}, ${t.st}`;
  const b = bbox(lat, lon, miles), z = zoomFor(miles);
  const q = (o) => Object.entries(o).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return [
    { id: 'airbnb', name: 'Airbnb', note: 'Map search in your radius', url: `https://www.airbnb.com/s/homes?${q({ ne_lat: b.ne.lat, ne_lng: b.ne.lon, sw_lat: b.sw.lat, sw_lng: b.sw.lon, search_by_map: 'true', search_type: 'user_map_move', checkin, checkout })}` },
    { id: 'ff', name: 'Furnished Finder', note: `Monthly rentals near ${place}`, url: `https://www.furnishedfinder.com/housing/us--${t.st.toLowerCase()}--${slug(t.city)}` },
    { id: 'booking', name: 'Booking.com', note: `Hotels near ${place}`, url: `https://www.booking.com/searchresults.html?${q({ ss: place, latitude: lat, longitude: lon, checkin, checkout })}` },
    { id: 'campendium', name: 'Campendium RV parks', note: 'RV parks map around the plant', url: `https://maps.campendium.com/?lng=${lon}&lat=${lat}&z=${z}&a4=p!RVPK` },
    { id: 'gm-rv', name: 'Google Maps: RV parks', note: 'RV parks & campgrounds nearby', url: `https://www.google.com/maps/search/RV+parks/@${lat},${lon},${z}z` },
    { id: 'gm-lodging', name: 'Google Maps: lodging', note: 'Hotels, motels & extended stay', url: `https://www.google.com/maps/search/extended+stay+hotels/@${lat},${lon},${z}z` },
  ];
}
export const directionsUrl = (from, plant) => `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${plant.lat},${plant.lon}`;
export const mapUrl = (plant) => `https://www.google.com/maps/search/?api=1&query=${plant.lat},${plant.lon}`;
