// =============================================================
//  search.js — offline place search (no API key, works at the venue)
//  Searches: built-in cities + every country + raw "lat, lon"
// =============================================================
import { getCountries } from './geo.js';

const CITIES = [
  ['Ras Al Khaimah', 'UAE', 25.79, 55.94], ['Dubai', 'UAE', 25.2, 55.27], ['Abu Dhabi', 'UAE', 24.45, 54.38],
  ['Sharjah', 'UAE', 25.35, 55.42], ['Muscat', 'Oman', 23.59, 58.41], ['Doha', 'Qatar', 25.29, 51.53],
  ['Riyadh', 'Saudi Arabia', 24.71, 46.68], ['Jeddah', 'Saudi Arabia', 21.49, 39.19], ['Kuwait City', 'Kuwait', 29.38, 47.99],
  ['Cairo', 'Egypt', 30.04, 31.24], ['Stirling', 'UK', 56.12, -3.94], ['Edinburgh', 'UK', 55.95, -3.19],
  ['Glasgow', 'UK', 55.86, -4.25], ['London', 'UK', 51.51, -0.13], ['Oxford', 'UK', 51.75, -1.26], ['Cambridge', 'UK', 52.2, 0.12],
  ['Paris', 'France', 48.86, 2.35], ['Berlin', 'Germany', 52.52, 13.4], ['Madrid', 'Spain', 40.42, -3.7],
  ['Rome', 'Italy', 41.9, 12.5], ['Athens', 'Greece', 37.98, 23.73], ['Istanbul', 'Türkiye', 41.01, 28.98],
  ['Moscow', 'Russia', 55.76, 37.62], ['Reykjavík', 'Iceland', 64.15, -21.94], ['Svalbard', 'Norway', 78.22, 15.65],
  ['Mumbai', 'India', 19.08, 72.88], ['Delhi', 'India', 28.61, 77.21], ['Kochi', 'India', 9.93, 76.27],
  ['Thiruvananthapuram', 'India', 8.52, 76.94], ['Bengaluru', 'India', 12.97, 77.59], ['Chennai', 'India', 13.08, 80.27],
  ['Karachi', 'Pakistan', 24.86, 67.0], ['Dhaka', 'Bangladesh', 23.81, 90.41], ['Kathmandu', 'Nepal', 27.72, 85.32],
  ['Colombo', 'Sri Lanka', 6.93, 79.86], ['Beijing', 'China', 39.9, 116.4], ['Shanghai', 'China', 31.23, 121.47],
  ['Tokyo', 'Japan', 35.68, 139.69], ['Seoul', 'South Korea', 37.57, 126.98], ['Singapore', 'Singapore', 1.35, 103.82],
  ['Jakarta', 'Indonesia', -6.21, 106.85], ['Manila', 'Philippines', 14.6, 120.98], ['Bangkok', 'Thailand', 13.76, 100.5],
  ['Sydney', 'Australia', -33.87, 151.21], ['Melbourne', 'Australia', -37.81, 144.96], ['Auckland', 'New Zealand', -36.85, 174.76],
  ['Nairobi', 'Kenya', -1.29, 36.82], ['Lagos', 'Nigeria', 6.52, 3.38], ['Niamey', 'Niger', 13.51, 2.11],
  ['Addis Ababa', 'Ethiopia', 9.03, 38.74], ['Cape Town', 'South Africa', -33.92, 18.42], ['Johannesburg', 'South Africa', -26.2, 28.05],
  ['New York', 'USA', 40.71, -74.01], ['Washington DC', 'USA', 38.9, -77.04], ['Houston', 'USA', 29.76, -95.37],
  ['Los Angeles', 'USA', 34.05, -118.24], ['San Francisco', 'USA', 37.77, -122.42], ['Phoenix', 'USA', 33.45, -112.07],
  ['Miami', 'USA', 25.76, -80.19], ['Anchorage', 'USA', 61.22, -149.9], ['Toronto', 'Canada', 43.65, -79.38],
  ['Vancouver', 'Canada', 49.28, -123.12], ['Mexico City', 'Mexico', 19.43, -99.13], ['Bogotá', 'Colombia', 4.71, -74.07],
  ['Lima', 'Peru', -12.05, -77.04], ['Manaus', 'Brazil', -3.12, -60.02], ['São Paulo', 'Brazil', -23.55, -46.63],
  ['Buenos Aires', 'Argentina', -34.6, -58.38], ['Santiago', 'Chile', -33.45, -70.67], ['Atacama Desert', 'Chile', -24.5, -69.25],
  ['Nuuk', 'Greenland', 64.18, -51.72], ['Al Ain', 'UAE', 24.21, 55.74], ['Fujairah', 'UAE', 25.13, 56.33],
  ['Ajman', 'UAE', 25.41, 55.44], ['Umm Al Quwain', 'UAE', 25.56, 55.55], ['Manama', 'Bahrain', 26.23, 50.59], ['Valletta', 'Malta', 35.9, 14.51],
  // regions used by the guided investigations and the demo
  ['Novaya Zemlya', 'Russia', 73.0, 57.0], ['Central Chile', 'Chile', -37.0, -72.5], ['Ganges plain', 'India', 27.0, 79.0],
  ['Punjab', 'India', 30.9, 75.8], ['Bahrain', 'Country', 26.05, 50.55], ['Malta', 'Country', 35.9, 14.4], ['Mauritius', 'Country', -20.25, 57.55], ['Sahel', 'Niger', 14.5, 6.0], ['Rondônia', 'Brazil', -10.9, -62.8], ['Northern California', 'USA', 39.5, -121.5],
  ['Sahara', 'Africa', 23.0, 13.0], ['Amazon rainforest', 'Brazil', -3.5, -62.0], ['Siberia', 'Russia', 62.0, 100.0], ['Tibetan Plateau', 'China', 33.0, 88.0], ['McMurdo Station', 'Antarctica', -77.85, 166.67], ['Maldives (Malé)', 'Maldives', 4.18, 73.51],
];

let index = [];

export function initSearch() {
  index = CITIES.map(([name, country, lat, lon]) => ({ name, sub: country, lat, lon, kind: 'city' }));
  for (const f of getCountries()) {
    const [lon, lat] = window.d3.geoCentroid(f);
    if (Number.isFinite(lat)) index.push({ name: f.properties.name, sub: 'Country', lat, lon, kind: 'country' });
  }
}

/** Parse "25.8, 55.9" or "25.8N 55.9E" style input. */
function parseCoords(q) {
  const m = q.trim().match(/^(-?\d+(?:\.\d+)?)\s*°?\s*([NS])?[\s,]+(-?\d+(?:\.\d+)?)\s*°?\s*([EW])?$/i);
  if (!m) return null;
  let lat = +m[1], lon = +m[3];
  if (m[2] && m[2].toUpperCase() === 'S') lat = -Math.abs(lat);
  if (m[4] && m[4].toUpperCase() === 'W') lon = -Math.abs(lon);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { name: `${lat.toFixed(2)}, ${lon.toFixed(2)}`, sub: 'Coordinates', lat, lon, kind: 'coords' };
}

export function search(q, limit = 7) {
  q = q.trim();
  if (!q) return [];
  const c = parseCoords(q);
  if (c) return [c];
  const n = ({ uk: 'united kingdom', uae: 'united arab emirates', usa: 'united states of america', us: 'united states of america', rak: 'ras al khaimah' })[q.toLowerCase()] || q.toLowerCase();
  return index
    .map((p) => {
      const nm = p.name.toLowerCase();
      const score = nm === n ? 0 : nm.startsWith(n) ? 1 : nm.includes(n) ? 2 : p.sub.toLowerCase().startsWith(n) ? 3 : 9;
      return { p, score };
    })
    .filter((x) => x.score < 9)
    .sort((a, b) => a.score - b.score || (a.p.kind === 'city' ? -1 : 1))
    .slice(0, limit)
    .map((x) => x.p);
}

/** Find a nice name for a clicked point: nearest known city within ~60 km. */
export function nearestNamed(lat, lon, maxKm = 60) {
  let best = null, bestD = Infinity;
  for (const p of index) {
    if (p.kind !== 'city') continue;
    const d = haversine(lat, lon, p.lat, p.lon);
    if (d < bestD) { bestD = d; best = p; }
  }
  return bestD <= maxKm ? best : null;
}

export function haversine(la1, lo1, la2, lo2) {
  const R = 6371, r = Math.PI / 180;
  const a = Math.sin(((la2 - la1) * r) / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(((lo2 - lo1) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const ALIASES = [[/\b(uae|emirates)\b/g, 'united arab emirates'], [/\b(uk|britain)\b/g, 'united kingdom'], [/\b(usa|america|united states)\b/g, 'united states of america'], [/\brak\b/g, 'ras al khaimah']];
const norm = (t) => ' ' + t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';

/** Find every known city / country mentioned in free text (used by the chat assistant). */
export function findPlaces(text) {
  let t = text.toLowerCase();
  for (const [re, full] of ALIASES) if (!t.includes(full)) t = t.replace(re, full);
  t = norm(t);
  const hits = [];
  for (const p of index) {
    const n = norm(p.name.replace(/\(.*?\)/g, ''));
    if (n.length < 5) continue;
    const i = t.indexOf(n);
    if (i >= 0) hits.push({ p, i, end: i + n.length });
  }
  hits.sort((a, b) => (b.end - b.i) - (a.end - a.i));
  const kept = [];
  for (const h of hits) if (!kept.some((k) => h.i < k.end - 1 && k.i < h.end - 1)) kept.push(h);
  return kept.sort((a, b) => a.i - b.i).map((h) => h.p);
}
