// =============================================================
//  globe.js — the 3D Earth (globe.gl + three.js under the hood)
// -------------------------------------------------------------
//  Layers:
//    • NASA Blue Marble texture + topography bump + atmosphere
//    • country borders (hover = name)
//    • HEATMAP: the data is painted straight onto the Earth texture
//      as a smooth colour field. Faded = change not significant.
//    • pulsing ring on the selected place, pins for comparisons
// =============================================================
import { styleFor, CONFIG } from './config.js';
import { getGrid, trendForCell, mapTrendValue, rangeFor, trendDisplay } from './data.js';
import { getCountries } from './geo.js';
import { ramp } from './util.js';

let globe = null;
const TOUCH = window.matchMedia('(pointer: coarse)').matches;
let current = { id: null, mode: 'trend', year: null };
let pins = [];
let selection = null;
let highlight = null;
/** Outline + tint one country (or pass null to clear). */
export function setHighlight(name) {
  if (name === highlight || !globe) return;
  highlight = name;
  globe.polygonCapColor(globe.polygonCapColor()).polygonStrokeColor(globe.polygonStrokeColor());
}
const anomalyRange = {};

export function initGlobe(container, { onSelect, onHoverCountry, onProbe }) {
  globe = window.Globe({ animateIn: true })(container)
    .globeImageUrl('assets/textures/earth-blue-marble.jpg')
    .bumpImageUrl('assets/textures/earth-topology.png')
    .backgroundImageUrl('assets/textures/night-sky.png')
    .showAtmosphere(true)
    .atmosphereColor('#5fd6ff')
    .atmosphereAltitude(0.2)
    // --- country borders ---
    .polygonsData(getCountries())
    .polygonCapColor((d) => (d.properties.name === highlight ? 'rgba(0,224,184,0.16)' : 'rgba(0,0,0,0)'))
    .polygonSideColor(() => 'rgba(0,0,0,0)')
    .polygonStrokeColor((d) => (d.properties.name === highlight ? '#00e0b8' : 'rgba(255,255,255,0.34)'))
    .polygonAltitude(0.004)
    .onPolygonHover((d) => onHoverCountry && onHoverCountry(d ? d.properties.name : null))
    // --- selection rings ---
    .ringColor(() => (t) => `rgba(0,224,184,${1 - t})`)
    .ringMaxRadius(5)
    .ringPropagationSpeed(3)
    .ringRepeatPeriod(900)
    // --- pins / labels ---
    .labelsData([])
    .labelLat('lat').labelLng('lon').labelText('text')
    .labelSize(0.9).labelDotRadius(0.55).labelColor('color').labelResolution(3)
    .labelAltitude(0.012);

  const pick = (coords) => coords && onSelect(coords.lat, coords.lng);
  globe.onGlobeClick(pick);
  globe.onPolygonClick((_p, _e, coords) => pick(coords));
  globe.onLabelClick((l) => onSelect(l.lat, l.lon));

  const controls = globe.controls();
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.35;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 130;
  controls.maxDistance = 650;

  initHeatmap();

  // Hover probe: read the value under the mouse (like Climate Pulse / earth.nullschool)
  let raf = 0;
  container.addEventListener('mousemove', (e) => {
    if (!onProbe || raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const r = container.getBoundingClientRect();
      const c = globe.toGlobeCoords(e.clientX - r.left, e.clientY - r.top);
      onProbe(c ? c.lat : null, c ? c.lng : null, e.clientX, e.clientY);
    });
  });
  container.addEventListener('mouseleave', () => onProbe && onProbe(null, null));
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) controls.autoRotate = false;

  // Phones/tablets: cap the pixel ratio so a 3× retina screen doesn't render 9× the pixels
  globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, TOUCH ? 1.5 : 2));
  const resize = () => globe.width(container.clientWidth).height(container.clientHeight);
  window.addEventListener('resize', resize);
  resize();
  controls.maxDistance = Math.max(650, 100 * (1 + fit(2.6)) + 60);
  globe.pointOfView({ lat: 22, lng: 40, altitude: fit(2.6) }, 0);
  return globe;
}

export function getGlobe() { return globe; }
export function autoRotate(on) { if (globe) globe.controls().autoRotate = on; }

export function flyTo(lat, lon, altitude = 1.6, ms = 1600) {
  globe.pointOfView({ lat, lng: lon, altitude: fit(altitude) }, ms);
}

/** Tall phone screens are narrow, so the globe needs to sit further away to fit across. */
function fit(alt) {
  const w = globe.width(), h = globe.height();
  if (!w || !h) return alt;
  const fov = ((globe.camera().fov || 50) * Math.PI) / 180;
  const half = Math.min(fov / 2, Math.atan(Math.tan(fov / 2) * (w / h)));
  const need = 1 / Math.sin(half) - 1; // altitude at which the whole globe just fits
  const ref = 1 / Math.sin(fov / 2) - 1; // the same on a wide screen
  return need > ref ? alt + (need - ref) * 0.75 : alt;
}

/** Anomaly = this year's value minus the cell's first-years baseline. */
function baseline(cell, years) {
  const vals = [];
  for (let i = 0; i < years.length && vals.length < CONFIG.compareWindow; i++) {
    if (cell.values[i] !== null) vals.push(cell.values[i]);
  }
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
function anomaly(id, cell, yi, years) {
  if (cell._base === undefined) cell._base = baseline(cell, years);
  const v = cell.values[yi];
  if (v === null || cell._base === null) return null;
  return trendDisplay(id) === 'absolute' ? v - cell._base : ((v - cell._base) / (Math.abs(cell._base) || 1)) * 100;
}
function rangeAnomaly(id) {
  if (anomalyRange[id]) return anomalyRange[id];
  const grid = getGrid(id);
  const yi = grid.years.length - 1;
  const arr = [];
  for (const c of grid.cells) { const a = anomaly(id, c, yi, grid.years); if (a !== null) arr.push(Math.abs(a)); }
  arr.sort((a, b) => a - b);
  const m = arr[Math.floor(arr.length * 0.9)] || 1;
  return (anomalyRange[id] = { lo: -m, hi: m });
}

// -------------------------------------------------------------
//  HEATMAP: grid → tiny image (1 pixel per cell) → blurred &
//  upscaled → blended over NASA Blue Marble → used as the globe
//  texture. Fast enough to animate the timeline.
// -------------------------------------------------------------
const heat = { base: null, mid: null, out: null, ready: false, pending: null };
let OVERLAY_ALPHA = 0.9;
let lastJob = null;
const paintListeners = [];
/** Run fn every time the heat-map is repainted (e.g. to refresh the report mini-map). */
export function onPaint(fn) { paintListeners.push(fn); }
export function setOverlayOpacity(a) { OVERLAY_ALPHA = a; if (lastJob) paint(lastJob); }

function initHeatmap() {
  const img = new Image();
  img.onload = () => {
    heat.base = img;
    heat.out = document.createElement('canvas');
    // must match the original texture size: WebGL can't shrink a texture that's already uploaded
    heat.out.width = img.width; heat.out.height = img.height;
    heat.mid = document.createElement('canvas');
    heat.mid.width = 1024; heat.mid.height = 512;
    // wait until globe.gl has created its own texture, then take it over
    const grab = () => {
      const mat = globe.globeMaterial();
      if (mat && mat.map && mat.map.image) {
        heat.tex = mat.map;
        heat.ready = true;
        if (heat.pending) paint(heat.pending);
      } else setTimeout(grab, 100);
    };
    grab();
  };
  img.src = 'assets/textures/earth-blue-marble.jpg';
}

/** cells: [{lat, lon, color: [r,g,b], a: 0..1}] on a regular grid of `step` degrees */
function paint(job) {
  lastJob = job;
  if (!heat.ready) { heat.pending = job; return; }
  const { cells, step } = job;
  const W = Math.round(360 / step), H = Math.round(180 / step);
  const small = document.createElement('canvas');
  small.width = W; small.height = H;
  const sctx = small.getContext('2d');
  const px = sctx.createImageData(W, H);
  for (const c of cells) {
    const x = Math.floor((c.lon + 180) / step), y = Math.floor((90 - c.lat) / step);
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    const i = (y * W + x) * 4;
    px.data[i] = c.color[0]; px.data[i + 1] = c.color[1]; px.data[i + 2] = c.color[2];
    px.data[i + 3] = Math.round(255 * c.a);
  }
  polarSmooth(px.data, W, H, step);
  sctx.putImageData(px, 0, 0);

  // smooth: upscale with bilinear filtering + blur, drawn 3× side by side so the ±180° seam blends
  const m = heat.mid, mctx = m.getContext('2d');
  mctx.clearRect(0, 0, m.width, m.height);
  mctx.imageSmoothingEnabled = true;
  mctx.imageSmoothingQuality = 'high';
  // two-step upscale gives smooth gradients without the 'blobby' look of a heavy blur
  const mid = document.createElement('canvas');
  mid.width = W * 8; mid.height = H * 8;
  const midc = mid.getContext('2d');
  midc.imageSmoothingEnabled = true; midc.imageSmoothingQuality = 'high';
  for (const dx of [-mid.width, 0, mid.width]) midc.drawImage(small, dx, 0, mid.width, mid.height);
  mctx.filter = `blur(${Math.max(1.5, (m.width / W) * 0.28)}px)`;
  for (const dx of [-m.width, 0, m.width]) mctx.drawImage(mid, dx, 0, m.width, m.height);
  mctx.filter = 'none';

  const o = heat.out, octx = o.getContext('2d');
  octx.globalAlpha = 1;
  octx.drawImage(heat.base, 0, 0, o.width, o.height);
  octx.globalAlpha = OVERLAY_ALPHA;
  octx.imageSmoothingEnabled = true;
  octx.drawImage(m, 0, 0, o.width, o.height);
  octx.globalAlpha = 1;

  heat.tex.image = o;
  heat.tex.needsUpdate = true;
  paintListeners.forEach((fn) => { try { fn(); } catch (e) { console.warn(e); } });
}

/** Near the poles 5° cells become thin slivers that fan out on the sphere.
 *  Average each high-latitude row sideways (wider as cells get narrower). */
function polarSmooth(d, W, H, step) {
  for (let y = 0; y < H; y++) {
    const lat = 90 - (y + 0.5) * step;
    const r = Math.round(0.6 / Math.cos((lat * Math.PI) / 180)) - 1;
    if (r < 1) continue;
    const row = new Float32Array(W * 4);
    for (let x = 0; x < W; x++) {
      let R = 0, G = 0, B = 0, A = 0, n = 0;
      for (let k = -r; k <= r; k++) {
        const i = ((y * W) + ((x + k + W) % W)) * 4, a = d[i + 3];
        R += d[i] * a; G += d[i + 1] * a; B += d[i + 2] * a; A += a; n++;
      }
      const o = x * 4;
      if (A > 0) { row[o] = R / A; row[o + 1] = G / A; row[o + 2] = B / A; }
      row[o + 3] = A / n;
    }
    for (let x = 0; x < W * 4; x++) d[y * W * 4 + x] = row[x];
  }
}

function rgb(str) { // "rgb(r,g,b)" → [r,g,b]
  return str.slice(4, -1).split(',').map(Number);
}

/** Redraw the heatmap. mode = 'trend' | 'year'. */
export function setLayer(id, mode = 'trend', year = null) {
  current = { id, mode, year };
  const grid = getGrid(id);
  if (!grid) return;
  const st = styleFor(id);
  let cells;
  if (mode === 'trend') {
    const { lo, hi } = rangeFor(id, 'trend');
    cells = grid.cells.map((c) => {
      const t = trendForCell(id, c);
      const v = mapTrendValue(id, t);
      if (v === null) return null;
      const n = (v - lo) / (hi - lo);
      const strength = Math.min(1, Math.abs(n - 0.5) * 2); // 0 = no change, 1 = strongest change
      // bigger change = more opaque; not significant = faded
      // colour fades out towards 'no change', so the real Earth shows through there;
      // significant change is near-solid, non-significant change stays light
      const a = t.significant ? 0.32 + 0.68 * Math.pow(strength, 0.5) : 0.06 + 0.3 * strength;
      return { lat: c.lat, lon: c.lon, color: rgb(ramp(st.trendColors, n)), a };
    }).filter(Boolean);
  } else {
    const yi = Math.max(0, grid.years.indexOf(year));
    const { lo, hi } = rangeAnomaly(id);
    cells = grid.cells.map((c) => {
      const a = anomaly(id, c, yi, grid.years);
      if (a === null) return null;
      const n = (a - lo) / (hi - lo);
      return { lat: c.lat, lon: c.lon, color: rgb(ramp(st.trendColors, n)), a: 0.1 + 0.9 * Math.pow(Math.min(1, Math.abs(n - 0.5) * 2), 0.6) };
    }).filter(Boolean);
  }
  paint({ cells, step: grid.step });
}

export function getLegend() {
  const { id, mode } = current;
  if (!id) return null;
  const st = styleFor(id);
  const abs = trendDisplay(id) === 'absolute';
  const range = mode === 'trend' ? rangeFor(id, 'trend') : rangeAnomaly(id);
  const grid = getGrid(id);
  return {
    colors: st.trendColors,
    lo: range.lo, hi: range.hi,
    unit: abs ? grid.unit : '%',
    title: mode === 'trend'
      ? `Change per decade${abs ? '' : ' (% of average)'}`
      : `Difference from ${grid.years[0]}–${grid.years[Math.min(grid.years.length, CONFIG.compareWindow) - 1]} average`,
  };
}

export function setSelection(lat, lon) {
  selection = { lat, lng: lon };
  globe.ringsData([selection]);
  refreshLabels();
}
export function clearSelection() { selection = null; globe.ringsData([]); refreshLabels(); }

const PIN_COLORS = ['#ffb547', '#ff5d73', '#6fb8ff', '#c792ea'];
export function setPins(list) { pins = list; refreshLabels(); }
export function pinColor(i) { return PIN_COLORS[i % PIN_COLORS.length]; }

function refreshLabels() {
  globe.labelsData(pins.map((p, i) => ({ lat: p.lat, lon: p.lon, text: p.short || p.name, color: pinColor(i) })));
}


/**
 * Flat mini-map around (lat, lon): a crop of the same heat-map image the
 * globe uses, with country borders and a marker. Returns a canvas, or null
 * if the heat-map is not ready yet. spanLon = width of the view in degrees.
 */
export function miniMap(lat, lon, { w = 360, h = 200, spanLon = 50, countries = [], highlight = null } = {}) {
  if (!heat.ready || !heat.out) return null;
  const spanLat = spanLon * (h / w);
  const c0 = Math.max(-90 + spanLat / 2, Math.min(90 - spanLat / 2, lat));
  const src = heat.out, sx = src.width / 360, sy = src.height / 180;
  const cv = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = w * dpr; cv.height = h * dpr;
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const left = lon - spanLon / 2, top = c0 + spanLat / 2;
  // draw the equirectangular image 3x side by side so views across ±180° wrap
  for (const k of [-360, 0, 360]) {
    const x0 = ((-180 + k) - left) / spanLon * w;
    g.drawImage(src, 0, 0, src.width, src.height, x0, (top - 90) / spanLat * h, 360 / spanLon * w, 180 / spanLat * h);
  }
  void sx; void sy;
  const P = (lo, la) => [((lo - left) / spanLon) * w, ((top - la) / spanLat) * h];
  const drawRing = (ring, shift) => {
    g.beginPath();
    let prev = null;
    ring.forEach(([lo, la], i) => {
      let L = lo + shift;
      if (prev !== null && Math.abs(L - prev) > 180) L += L > prev ? -360 : 360; // avoid antimeridian streaks
      const [x, y] = P(L, la);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      prev = L;
    });
    g.stroke();
  };
  for (const f of countries) {
    const geom = f.geometry;
    if (!geom) continue;
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    const hl = highlight && f.properties && f.properties.name === highlight;
    g.strokeStyle = hl ? '#00e0b8' : 'rgba(255,255,255,0.45)';
    g.lineWidth = hl ? 2 : 0.7;
    for (const shift of [-360, 0, 360]) for (const poly of polys) drawRing(poly[0], shift);
  }
  const [mx, my] = P(lon, lat);
  g.strokeStyle = '#ffffff'; g.lineWidth = 2;
  g.beginPath(); g.arc(mx, my, 7, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#00e0b8'; g.beginPath(); g.arc(mx, my, 3.2, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(mx - 16, my); g.lineTo(mx - 10, my); g.moveTo(mx + 10, my); g.lineTo(mx + 16, my);
  g.moveTo(mx, my - 16); g.lineTo(mx, my - 10); g.moveTo(mx, my + 10); g.lineTo(mx, my + 16); g.stroke();
  return cv;
}
