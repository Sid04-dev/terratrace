// =============================================================
//  data.js — the bridge between the data team and the frontend
// -------------------------------------------------------------
//  1. Loads data/processed/manifest.json + grid_<variable>.json
//     (or generates DEMO data if those files don't exist yet)
//  2. VALIDATES everything against the data contract
//  3. Answers: "give me the series for this lat/lon + variable"
//
//  The frontend never reads raw files directly — only through here.
//  So if the data team follows docs/DATA_CONTRACT.md, it just works.
// =============================================================
import { CONFIG } from './config.js';
import { analyse } from './trend.js';
import { buildMock } from './mock.js';
import { countryFeatureAt, countryByName, countryCentroid, getCountries } from './geo.js';

const state = {
  manifest: null,
  grids: {},      // id -> grid
  index: {},      // id -> Map("lat,lon" -> cell)
  trendCache: {}, // id -> Map(cell -> trend)
  isDemo: true,
  problems: [],   // validation messages (shown in the Data Check panel)
  checks: [],     // independent datasets used to cross-check a variable (e.g. GISTEMP for temperature)
};

const key = (lat, lon) => `${(+lat).toFixed(3)},${(+lon).toFixed(3)}`;

function modeFromUrl() {
  const m = new URLSearchParams(location.search).get('mode');
  return m === 'mock' || m === 'real' ? m : CONFIG.dataMode;
}

async function tryJson(url) {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

/** Load everything. Returns { manifest, isDemo, problems }. */
export async function loadData() {
  const mode = modeFromUrl();
  let manifest = null;
  if (mode !== 'mock') manifest = await tryJson(CONFIG.processedPath + 'manifest.json');

  if (manifest) {
    state.problems.push(...validateManifest(manifest));
    for (const v of manifest.variables || []) {
      const grid = await tryJson(CONFIG.processedPath + v.file);
      if (!grid) { state.problems.push(`❌ Could not load ${v.file} for variable "${v.id}"`); continue; }
      const issues = validateGrid(grid, v);
      state.problems.push(...issues);
      if (!issues.some((m) => m.startsWith('❌'))) state.grids[v.id] = grid;
    }
    manifest.variables = (manifest.variables || []).filter((v) => state.grids[v.id]);
    for (const c of manifest.checks || []) {
      if (!manifest.variables.some((v) => v.id === c.of)) continue;
      const grid = await tryJson(CONFIG.processedPath + c.file);
      if (!grid) { state.problems.push(`⚠️ Could not load the cross-check file ${c.file}`); continue; }
      const issues = validateGrid(grid, c);
      state.problems.push(...issues);
      if (!issues.some((m) => m.startsWith('❌'))) { state.grids[c.id] = grid; state.checks.push(c); }
    }
    state.isDemo = !!manifest.is_demo;
    if (!manifest.variables.length) {
      state.problems.push('❌ No valid variables in real data — falling back to DEMO data.');
      manifest = null;
    }
  } else if (mode === 'real') {
    state.problems.push('❌ ?mode=real but data/processed/manifest.json was not found — using DEMO data.');
  }

  if (!manifest) {
    const mock = buildMock();
    manifest = mock.manifest;
    state.grids = mock.grids;
    state.isDemo = true;
  }

  state.manifest = manifest;
  // Unitless 0–1 indices (soil moisture): show "+0.005" not "+0.005 0–1" on screen,
  // but keep "0–1 scale" for exports, axis titles and methods text.
  for (const v of manifest.variables) {
    if (/^0\s*[–-]\s*1$/.test(v.unit || '')) {
      v.unit_note = '0–1 scale';
      v.unit = '';
      if (state.grids[v.id]) state.grids[v.id].unit = '';
    }
  }
  for (const [id, grid] of Object.entries(state.grids)) {
    const m = new Map();
    for (const c of grid.cells) m.set(key(c.lat, c.lon), c);
    state.index[id] = m;
    state.trendCache[id] = new Map();
  }
  if (!state.problems.length) state.problems.push('✅ All data passed the contract checks.');
  if (!state.isDemo && manifest.variables.some((v) => v.id === 'precipitation' && /POWER|MERRA/i.test(`${v.source?.name} ${v.source?.dataset}`))) {
    state.problems.push('ℹ️ Known issue: MERRA-2 rainfall (NASA POWER PRECTOTCORR) has sudden step changes in some regions with sparse rain gauges, mainly parts of Africa and South and Southeast Asia. Trends there may be artefacts; check the year-by-year chart.');
  }
  return { manifest, isDemo: state.isDemo, problems: state.problems };
}

// -------------------------------------------------------------
//  Contract validation — same rules as pipeline/validate.py
// -------------------------------------------------------------
export function validateManifest(m) {
  const p = [];
  if (m.contract_version !== 1) p.push(`⚠️ manifest.contract_version is ${m.contract_version}, expected 1`);
  if (!Array.isArray(m.variables) || !m.variables.length) p.push('❌ manifest.variables must be a non-empty array');
  for (const v of m.variables || []) {
    for (const f of ['id', 'label', 'unit', 'file', 'source']) if (v[f] === undefined) p.push(`❌ variable ${v.id || '?'} is missing "${f}"`);
    if (v.source && !v.source.name) p.push(`⚠️ variable ${v.id}: source.name is empty (needed for citations)`);
    if (v.id && !/^[a-z0-9_]+$/.test(v.id)) p.push(`❌ variable id "${v.id}" must be lowercase letters/numbers/underscores`);
  }
  return p;
}

export function validateGrid(g, v) {
  const p = [];
  const tag = `grid "${v.id}"`;
  if (!Array.isArray(g.years) || g.years.length < 6) p.push(`❌ ${tag}: "years" must be an array of at least 6 years`);
  if (!Array.isArray(g.cells) || !g.cells.length) { p.push(`❌ ${tag}: "cells" must be a non-empty array`); return p; }
  if (typeof g.step !== 'number' || g.step <= 0) p.push(`❌ ${tag}: "step" (grid size in degrees) must be a positive number`);
  if (g.unit !== v.unit) p.push(`⚠️ ${tag}: unit "${g.unit}" differs from manifest unit "${v.unit}"`);
  const years = g.years || [];
  for (let i = 1; i < years.length; i++) if (years[i] !== years[i - 1] + 1) { p.push(`❌ ${tag}: years must be consecutive and ascending`); break; }
  let badLen = 0, badCoord = 0, badVal = 0, fill = 0, nulls = 0, total = 0;
  for (const c of g.cells) {
    if (!(c.lat >= -90 && c.lat <= 90 && c.lon >= -180 && c.lon <= 180)) badCoord++;
    if (!Array.isArray(c.values) || c.values.length !== years.length) { badLen++; continue; }
    for (const x of c.values) {
      total++;
      if (x === null) nulls++;
      else if (typeof x !== 'number' || !Number.isFinite(x)) badVal++;
      else if (x <= -999) fill++;
    }
  }
  if (badCoord) p.push(`❌ ${tag}: ${badCoord} cells have lat/lon outside the valid range`);
  if (badLen) p.push(`❌ ${tag}: ${badLen} cells have a "values" array that doesn't match "years" length`);
  if (badVal) p.push(`❌ ${tag}: ${badVal} values are not numbers (use null for missing)`);
  if (fill) p.push(`❌ ${tag}: ${fill} values look like NASA fill values (≤ -999). Replace them with null!`);
  if (total && nulls / total > 0.3) p.push(`⚠️ ${tag}: ${Math.round((nulls / total) * 100)}% of values are missing`);
  return p;
}

// -------------------------------------------------------------
//  Queries used by the UI
// -------------------------------------------------------------
export const getManifest = () => state.manifest;
export const isDemo = () => state.isDemo;
export const getProblems = () => state.problems;
export const getVariable = (id) => state.manifest.variables.find((v) => v.id === id) || state.checks.find((c) => c.id === id);
/** The independent dataset that cross-checks variable `of`, if one is loaded. */
export const getCheck = (of) => state.checks.find((c) => c.of === of) || null;
export const getGrid = (id) => state.grids[id];

function nearestCell(id, lat, lon) {
  const grid = state.grids[id];
  if (!grid) return null;
  const s = grid.step;
  const sLat = Math.floor((lat + 90) / s) * s - 90 + s / 2;
  const sLon = Math.floor((lon + 180) / s) * s - 180 + s / 2;
  const hit = state.index[id].get(key(sLat, sLon));
  if (hit) return hit;
  // Irregular grid or missing cell → brute-force nearest within 1.5 cells
  let best = null, bestD = Infinity;
  for (const c of grid.cells) {
    const dLon = Math.abs(((c.lon - lon + 540) % 360) - 180) * Math.cos((lat * Math.PI) / 180);
    const d = Math.hypot(c.lat - lat, dLon);
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD <= s * 1.5 ? best : null;
}

export function trendForCell(id, cell) {
  const cache = state.trendCache[id];
  if (cache.has(cell)) return cache.get(cell);
  const grid = state.grids[id];
  const t = analyse(grid.years, cell.values, { alpha: CONFIG.alpha, window: CONFIG.compareWindow });
  // If the pipeline pre-computed a trend, trust its numbers (same maths) but keep our extras.
  if (cell.trend && typeof cell.trend.per_decade === 'number') Object.assign(t, cell.trend);
  cache.set(cell, t);
  return t;
}

/**
 * The "Series" object — exactly the per-location JSON in the data contract.
 * Returns null if there is no data near this point (e.g. ocean for land-only variables).
 */
export function getSeries(id, lat, lon) {
  const cell = nearestCell(id, lat, lon);
  if (!cell) return null;
  const v = getVariable(id);
  const grid = state.grids[id];
  if (cell.values.every((x) => x === null)) return null;
  return {
    location: { lat, lon, cell_lat: cell.lat, cell_lon: cell.lon, cell_size: grid.step },
    variable: id,
    label: v.label,
    unit: v.unit,
    unit_note: v.unit_note || v.unit,
    decimals: v.decimals ?? 2,
    aggregation: v.aggregation || '',
    source: v.source,
    years: grid.years,
    values: cell.values,
    trend: trendForCell(id, cell),
    is_demo: state.isDemo,
  };
}

/** Temperature trends are shown in absolute units; everything else as % of average per decade. */
export function trendDisplay(id) {
  const v = getVariable(id);
  return v.trend_display || (v.unit === '°C' || v.unit === 'K' ? 'absolute' : 'relative');
}
export function mapTrendValue(id, t) {
  return trendDisplay(id) === 'absolute' ? t.per_decade : t.rel_per_decade;
}

/** Value range (5th–95th percentile) for colour scales. Cached per variable+mode. */
const rangeCache = {};
export function rangeFor(id, mode) {
  const k = id + mode;
  if (rangeCache[k]) return rangeCache[k];
  const grid = state.grids[id];
  const arr = [];
  if (mode === 'trend') {
    for (const c of grid.cells) { const t = mapTrendValue(id, trendForCell(id, c)); if (t !== null) arr.push(t); }
  } else {
    for (const c of grid.cells) for (const x of c.values) if (x !== null) arr.push(x);
  }
  arr.sort((a, b) => a - b);
  const q = (f) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(f * (arr.length - 1))))];
  let lo = q(0.08), hi = q(0.92);
  if (mode === 'trend') { const m = Math.max(Math.abs(lo), Math.abs(hi)) || 1; lo = -m; hi = m; }
  return (rangeCache[k] = { lo, hi });
}

// -------------------------------------------------------------
//  Rankings — "how does this place compare with the rest of the world?"
// -------------------------------------------------------------
const sortedTrends = {};
function allTrends(id) {
  if (sortedTrends[id]) return sortedTrends[id];
  const arr = [];
  for (const c of state.grids[id].cells) {
    const v = mapTrendValue(id, trendForCell(id, c));
    if (v !== null) arr.push(v);
  }
  return (sortedTrends[id] = arr.sort((a, b) => a - b));
}

/** % of grid cells worldwide with a LOWER trend than this one (0–100). */
export function worldPercentile(id, trend) {
  const v = mapTrendValue(id, trend);
  if (v === null) return null;
  const arr = allTrends(id);
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; }
  return (lo / arr.length) * 100;
}

/** Rank of the latest year among all years (1 = highest). */
export function latestRank(series) {
  const last = series.values.at(-1);
  if (last === null) return null;
  const valid = series.values.filter((v) => v !== null);
  return { rank: valid.filter((v) => v > last).length + 1, of: valid.length, year: series.years.at(-1) };
}

/** Fastest significant increases and decreases worldwide. */
export function hotspots(id, n = 5) {
  const rows = [];
  let hidden = 0;
  const chk = getCheck(id);
  for (const c of state.grids[id].cells) {
    const t = trendForCell(id, c);
    if (!t.significant) continue;
    if (chk) {
      const o = state.index[chk.id]?.get(key(c.lat, c.lon));
      if (o && opposes(t, trendForCell(chk.id, o))) { hidden++; continue; }
    }
    const v = mapTrendValue(id, t);
    if (v !== null) rows.push({ lat: c.lat, lon: c.lon, v, t });
  }
  rows.sort((a, b) => b.v - a.v);
  return { up: rows.slice(0, n), down: rows.slice(-n).reverse(), hidden };
}

/** True when the cross-check dataset's trend points the OPPOSITE way (a ranking shouldn't lead with a disputed result). */
function opposes(t, other) {
  return !!other && other.per_decade !== null && Math.sign(other.per_decade) !== Math.sign(t.per_decade);
}

// -------------------------------------------------------------
//  COUNTRY LEVEL — average all grid cells inside a country
//  (area-weighted, because cells near the poles are smaller)
// -------------------------------------------------------------
const cellCountry = new Map();   // "lat,lon" -> country name | null
const countryCells = {};         // id -> Map(name -> [cells])
const countryCache = new Map();  // "id|name" -> Series | null

function countryOfCell(c) {
  const k = key(c.lat, c.lon);
  if (!cellCountry.has(k)) {
    const f = countryFeatureAt(c.lat, c.lon);
    cellCountry.set(k, f ? f.properties.name : null);
  }
  return cellCountry.get(k);
}
function cellsByCountry(id) {
  if (countryCells[id]) return countryCells[id];
  const m = new Map();
  for (const c of state.grids[id].cells) {
    const n = countryOfCell(c);
    if (!n) continue;
    if (!m.has(n)) m.set(n, []);
    m.get(n).push(c);
  }
  return (countryCells[id] = m);
}

/** Series for a whole country. Small countries with no cell centre inside use the nearest cell (approx: true). */
export function getCountrySeries(id, name) {
  const ck = id + '|' + name;
  if (countryCache.has(ck)) return countryCache.get(ck);
  const grid = state.grids[id], v = getVariable(id), centre = countryCentroid(name);
  let out = null;
  if (grid && v && centre) {
    let cells = cellsByCountry(id).get(name) || [];
    let approx = false;
    if (!cells.length) {
      const c = nearestCell(id, centre.lat, centre.lon);
      if (c) { cells = [c]; approx = true; }
    }
    if (cells.length) {
      const dec = (v.decimals ?? 2) + 1;
      const w = cells.map((c) => Math.cos((c.lat * Math.PI) / 180));
      const wAll = w.reduce((a, b) => a + b, 0);
      const values = grid.years.map((_, i) => {
        let sw = 0, sv = 0;
        cells.forEach((c, j) => { const x = c.values[i]; if (x !== null) { sw += w[j]; sv += w[j] * x; } });
        return sw / wAll >= 0.5 ? +(sv / sw).toFixed(dec) : null; // need at least half the country covered
      });
      if (values.some((x) => x !== null)) {
        out = {
          scope: 'country',
          location: { lat: centre.lat, lon: centre.lon, cell_lat: centre.lat, cell_lon: centre.lon, cell_size: grid.step, country: name, n_cells: cells.length, approx },
          variable: id, label: v.label, unit: v.unit, unit_note: v.unit_note || v.unit, decimals: v.decimals ?? 2, aggregation: v.aggregation || '', source: v.source,
          years: grid.years, values,
          trend: analyse(grid.years, values, { alpha: CONFIG.alpha, window: CONFIG.compareWindow }),
          is_demo: state.isDemo,
        };
      }
    }
  }
  countryCache.set(ck, out);
  return out;
}

/** One entry point for the UI: a spot (grid cell) or the whole country it sits in. */
export function getPlaceSeries(id, place, scope) {
  return scope === 'country' && place.country ? getCountrySeries(id, place.country) : getSeries(id, place.lat, place.lon);
}

/** Countries ranked by trend (only significant ones, only countries with real cells inside). */
export function countryRanking(id, n = 5) {
  const rows = [];
  let hidden = 0;
  const chk = getCheck(id);
  for (const name of cellsByCountry(id).keys()) {
    const s = getCountrySeries(id, name);
    if (!s || !s.trend.significant) continue;
    if (chk) {
      const o = getCountrySeries(chk.id, name);
      if (o && opposes(s.trend, o.trend)) { hidden++; continue; }
    }
    const val = mapTrendValue(id, s.trend);
    if (val !== null) rows.push({ name, v: val, t: s.trend, lat: s.location.lat, lon: s.location.lon, country: name });
  }
  rows.sort((a, b) => b.v - a.v);
  return { up: rows.filter((r) => r.v > 0).slice(0, n), down: rows.filter((r) => r.v < 0).slice(-n).reverse(), total: cellsByCountry(id).size, hidden };
}

/** Whole-planet summary: share of the mapped area with significant rises / falls. */
export function worldSummary(id) {
  let up = 0, down = 0, all = 0, sum = 0;
  for (const c of state.grids[id].cells) {
    const t = trendForCell(id, c);
    if (t.per_decade === null) continue;
    const w = Math.cos((c.lat * Math.PI) / 180);
    all += w; sum += w * t.per_decade;
    if (t.significant) { if (t.per_decade > 0) up += w; else down += w; }
  }
  return all ? { up: (up / all) * 100, down: (down / all) * 100, mean_per_decade: sum / all } : null;
}
export const countryCount = () => getCountries().length;


/**
 * Benjamini–Hochberg false-discovery-rate threshold for one variable:
 * testing ~2,600 places at α = 0.05 would flag ~5% by chance, so a
 * map-wide claim needs a stricter p cut-off. Returns
 * { pCrit, tests, raw, fdr, expected } (cached).
 */
const fdrCache = {};
export function fdrInfo(id, q = CONFIG.alpha) {
  if (fdrCache[id]) return fdrCache[id];
  const grid = state.grids[id];
  if (!grid) return null;
  const ps = [];
  for (const c of grid.cells) {
    const t = trendForCell(id, c);
    if (t.p_value !== null && t.p_value !== undefined) ps.push(t.p_value);
  }
  const m = ps.length, s = [...ps].sort((a, b) => a - b);
  let pCrit = 0;
  s.forEach((p, i) => { if (p <= (q * (i + 1)) / m) pCrit = p; });
  return (fdrCache[id] = { pCrit, tests: m, raw: ps.filter((p) => p < q).length, fdr: ps.filter((p) => p <= pCrit && pCrit > 0).length, expected: Math.round(q * m) });
}
