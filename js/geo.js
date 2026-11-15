// =============================================================
//  geo.js — land/sea mask + "which country did I click?"
//  Uses only local files so the demo works with no internet.
// =============================================================

let waterData = null, waterW = 0, waterH = 0;
let countries = [];
let bounds = [];
const byName = new Map();

export async function initGeo() {
  // 1) Land/sea mask from the water texture (white = water, black = land)
  const img = await loadImage('assets/textures/earth-water.png');
  const c = document.createElement('canvas');
  c.width = waterW = img.width;
  c.height = waterH = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  waterData = ctx.getImageData(0, 0, waterW, waterH).data; // read once, index fast

  // 2) Country outlines (Natural Earth 1:110m via world-atlas)
  const topo = await fetch('assets/countries-110m.json').then((r) => r.json());
  countries = window.topojson.feature(topo, topo.objects.countries).features;
  bounds = countries.map((f) => window.d3.geoBounds(f));
  countries.forEach((f) => byName.set(f.properties.name, f));
  return countries;
}

function inBounds(b, lat, lon) {
  const [[w, s], [e, n]] = b;
  if (lat < s || lat > n) return false;
  return w <= e ? lon >= w && lon <= e : lon >= w || lon <= e; // second case crosses the date line
}
export function countryFeatureAt(lat, lon) {
  const pt = [lon, lat];
  for (let i = 0; i < countries.length; i++) {
    if (inBounds(bounds[i], lat, lon) && window.d3.geoContains(countries[i], pt)) return countries[i];
  }
  return null;
}
export const countryByName = (name) => byName.get(name) || null;
export function countryCentroid(name) {
  const f = byName.get(name);
  if (!f) return null;
  const [lon, lat] = window.d3.geoCentroid(f);
  return { lat, lon };
}

export function getCountries() { return countries; }

function loadImage(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

/** true if the point is land (checks a small neighbourhood so coasts count). */
export function isLand(lat, lon) {
  if (!waterData) return true;
  const x = Math.floor(((lon + 180) / 360) * waterW) % waterW;
  const y = Math.min(waterH - 1, Math.max(0, Math.floor(((90 - lat) / 180) * waterH)));
  return waterData[(y * waterW + x) * 4] < 160;
}

/** Fraction of land in a grid cell (sampled 5×5). Used by the mock generator. */
export function landFraction(lat, lon, step) {
  let land = 0, n = 0;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const la = lat - step / 2 + (step * (i + 0.5)) / 5;
      const lo = lon - step / 2 + (step * (j + 0.5)) / 5;
      if (isLand(la, lo)) land++;
      n++;
    }
  }
  return land / n;
}

export function countryAt(lat, lon) {
  const f = countryFeatureAt(lat, lon);
  return f ? f.properties.name : null;
}

export function formatCoord(lat, lon) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
}

/** Rough ocean name for points that aren't in any country. */
// Small countries that are too small for the 110m world map, and named seas.
// Used only when no country border is found at the clicked point.
const SMALL = [
  ['Bahrain', 26.05, 50.55, 0.45], ['Malta', 35.9, 14.4, 0.35], ['Singapore', 1.35, 103.82, 0.35],
  ['Maldives', 3.2, 73.2, 3.5], ['Mauritius', -20.25, 57.55, 0.6], ['Seychelles', -4.6, 55.5, 1.0],
  ['Barbados', 13.15, -59.55, 0.3], ['Hong Kong', 22.35, 114.15, 0.35], ['Bahamas', 24.5, -77.5, 2.5],
  ['Comoros', -11.9, 43.4, 0.8], ['Cape Verde', 15.1, -23.6, 1.2], ['Andorra', 42.55, 1.55, 0.2],
  ['Luxembourg', 49.75, 6.1, 0.35], ['Monaco', 43.73, 7.42, 0.1], ['Liechtenstein', 47.15, 9.55, 0.15],
];
const SEAS = [ // [name, latMin, latMax, lonMin, lonMax]
  ['Persian Gulf', 23.5, 30.5, 47.5, 56.6], ['Gulf of Oman', 22, 26.5, 56.6, 61.5], ['Red Sea', 12.5, 30, 32, 43.5],
  ['Caspian Sea', 36.5, 47.5, 46.5, 55], ['Black Sea', 40.5, 47, 27.5, 42], ['Mediterranean Sea', 30, 46, -6, 36.5],
  ['Baltic Sea', 53.5, 66, 9.5, 30.5], ['North Sea', 51, 61, -4, 9.5], ['Gulf of Mexico', 18, 31, -98, -81],
  ['Caribbean Sea', 9, 22, -88, -60], ['Hudson Bay', 51, 64, -95, -77], ['Bay of Bengal', 5, 23, 80, 95],
  ['Arabian Sea', 5, 25, 51, 75], ['South China Sea', 0, 23, 105, 121], ['Sea of Japan', 34, 52, 128, 142],
];
export function oceanName(lat, lon) {
  for (const [n, la, lo, r] of SMALL) if (Math.abs(lat - la) <= r && Math.abs(lon - lo) <= r) return n;
  for (const [n, a, b, c, d] of SEAS) if (lat >= a && lat <= b && lon >= c && lon <= d) return n;
  if (lat > 66) return 'Arctic Ocean';
  if (lat < -58) return 'Southern Ocean';
  if (lon > 20 && lon < 120 && lat < 30) return 'Indian Ocean';
  if (lon >= -70 && lon <= 20) return 'Atlantic Ocean';
  if (lon > -100 && lon < -70 && lat > 8) return 'Atlantic Ocean';
  return 'Pacific Ocean';
}
