// =============================================================
//  mock.js — DEMO data generator
// -------------------------------------------------------------
//  Produces data in EXACTLY the same shape as the real pipeline
//  output (docs/DATA_CONTRACT.md) so the frontend can be built
//  and tested before real NASA data is ready.
//
//  ⚠ These numbers are synthetic. The UI shows a "DEMO DATA"
//    badge whenever this file is in use. Never present them as real.
// =============================================================
import { CONFIG } from './config.js';
import { landFraction } from './geo.js';

function rng(seed) { // mulberry32 — deterministic, so the demo looks the same every time
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r) { // Box-Muller
  const u = Math.max(1e-9, r()), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const g = (x, mu, s) => Math.exp(-(((x - mu) / s) ** 2));
const near = (lat, lon, h, r = 9) => g(lat, h.lat, r) * g(((lon - h.lon + 540) % 360) - 180, 0, r);

// "Story" hotspots so the guided tour has something to show.
const HOT = {
  vegetation: [{ lat: -10, lon: -63, perYear: -0.007 }, { lat: 0, lon: 112, perYear: -0.005 }, { lat: 35, lon: 105, perYear: 0.005 }],
  precipitation: [{ lat: 14, lon: 6, pctYear: 1.4 }, { lat: -15, lon: 30, pctYear: -1.0 }, { lat: 38, lon: 0, pctYear: -1.1 }],
  fire: [{ lat: 39, lon: -121, pctYear: 7 }, { lat: -32, lon: 148, pctYear: 5 }, { lat: 62, lon: 120, pctYear: 6 }],
};

export const MOCK_MANIFEST_VARS = [
  { id: 'temperature', label: 'Air temperature (2 m)', unit: '°C', aggregation: 'annual mean', decimals: 2,
    source: { name: 'NASA POWER', dataset: 'T2M — MERRA-2 based', url: 'https://power.larc.nasa.gov/', version: 'DEMO' } },
  { id: 'precipitation', label: 'Rainfall', unit: 'mm/yr', aggregation: 'annual total', decimals: 0,
    source: { name: 'NASA POWER', dataset: 'PRECTOTCORR', url: 'https://power.larc.nasa.gov/', version: 'DEMO' } },
  { id: 'soil_moisture', label: 'Soil moisture (root zone)', unit: '0–1', aggregation: 'annual mean', decimals: 3, trend_display: 'absolute',
    source: { name: 'NASA POWER', dataset: 'GWETROOT (MERRA-2)', url: 'https://power.larc.nasa.gov/', version: 'DEMO' } },
  { id: 'vegetation', label: 'Vegetation greenness (NDVI)', unit: 'NDVI', aggregation: 'annual mean', decimals: 3, trend_display: 'absolute',
    source: { name: 'NASA MODIS', dataset: 'MOD13C2 NDVI', url: 'https://lpdaac.usgs.gov/products/mod13c2v061/', version: 'DEMO' } },
  { id: 'fire', label: 'Active fire detections', unit: 'fires/yr', aggregation: 'annual count', decimals: 0,
    source: { name: 'NASA FIRMS', dataset: 'MODIS Active Fire', url: 'https://firms.modaps.eosdis.nasa.gov/', version: 'DEMO' } },
];

export function buildMock() {
  const { step, startYear, endYear } = CONFIG.mock;
  const years = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);
  const grids = {};
  for (const v of MOCK_MANIFEST_VARS) grids[v.id] = { variable: v.id, unit: v.unit, step, years, cells: [] };

  let idx = 0;
  for (let lat = -90 + step / 2; lat < 90; lat += step) {
    for (let lon = -180 + step / 2; lon < 180; lon += step) {
      idx++;
      const land = landFraction(lat, lon, step);
      const isLand = land >= 0.3;
      const alat = Math.abs(lat);
      const cr = rng(idx * 7919);
      const gapYears = cr() < 0.15 ? new Set([years[Math.floor(cr() * years.length)]]) : new Set();

      // ---- temperature (°C, everywhere) ----
      {
        const r = rng(idx * 101 + 1);
        const sl = Math.sin((lat * Math.PI) / 180);
        let base = 30 - 38 * sl * sl + (isLand && alat < 35 ? 5 * land : 0) + (isLand && alat > 55 ? -7 : 0);
        if (!isLand) base = Math.max(base, -1.8);
        const trend = 0.012 + 0.07 * (alat / 90) ** 2.5 * (lat > 0 ? 1.4 : 0.5) + (isLand ? 0.01 : 0) + gauss(r) * 0.006;
        const values = years.map((y) => gapYears.has(y) ? null :
          +(base + trend * (y - startYear) + gauss(r) * (isLand ? 0.35 : 0.15)).toFixed(2));
        grids.temperature.cells.push({ lat, lon, values });
      }

      // ---- precipitation (mm/yr, everywhere) ----
      const r2 = rng(idx * 101 + 2);
      let pBase = 2300 * g(lat, 2, 16) + 950 * g(alat, 47, 13) + 250;
      if (isLand) pBase *= 1 - 0.85 * g(alat, 24, 8);
      let pct = gauss(r2) * 0.35;
      for (const h of HOT.precipitation) pct += h.pctYear * near(lat, lon, h);
      const precip = years.map((y) => gapYears.has(y) ? null :
        Math.max(0, Math.round(pBase * (1 + (pct / 100) * (y - startYear)) * (1 + gauss(r2) * 0.12))));
      grids.precipitation.cells.push({ lat, lon, values: precip });

      // ---- vegetation (NDVI, land only) ----
      if (isLand && alat < 80) {
        // ---- soil moisture (0–1, land only): follows rainfall, dried by warming ----
        const rs = rng(idx * 101 + 5);
        const smBase = Math.min(0.92, Math.max(0.08, 0.1 + 0.8 * Math.min(1, pBase / 2200)));
        const smTr = (pct / 100) * smBase * 0.6 - 0.0006 - (alat > 50 ? 0.0004 : 0);
        grids.soil_moisture.cells.push({ lat, lon, values: years.map((y) => gapYears.has(y) ? null :
          +Math.min(0.98, Math.max(0.02, smBase + smTr * (y - startYear) + gauss(rs) * 0.02)).toFixed(3)) });

        const r = rng(idx * 101 + 3);
        const wet = Math.min(1, pBase / 2000);
        const base = Math.max(0.05, 0.12 + 0.68 * wet - (alat > 62 ? 0.25 : 0));
        let tr = gauss(r) * 0.0012 + (alat > 55 ? 0.002 : 0);
        for (const h of HOT.vegetation) tr += h.perYear * near(lat, lon, h);
        const values = years.map((y) => gapYears.has(y) ? null :
          +Math.min(0.92, Math.max(0.02, base + tr * (y - startYear) + gauss(r) * 0.025)).toFixed(3));
        grids.vegetation.cells.push({ lat, lon, values });

        // ---- fire (count/yr, land only) ----
        const rf = rng(idx * 101 + 4);
        const fBase = 20 + 5200 * g(alat, 9, 9) * wet + 900 * g(alat, 38, 6) + 700 * g(alat, 60, 6);
        let fp = gauss(rf) * 0.8;
        for (const h of HOT.fire) fp += h.pctYear * near(lat, lon, h);
        const fires = years.map((y) => gapYears.has(y) ? null :
          Math.max(0, Math.round(fBase * Math.max(0.05, 1 + (fp / 100) * (y - startYear)) * Math.exp(gauss(rf) * 0.25))));
        grids.fire.cells.push({ lat, lon, values: fires });
      }
    }
  }

  const manifest = {
    contract_version: 1,
    title: 'TerraTrace DEMO dataset (synthetic)',
    generated: new Date().toISOString(),
    is_demo: true,
    years: [startYear, endYear],
    variables: MOCK_MANIFEST_VARS.map((v) => ({ ...v, file: `grid_${v.id}.json` })),
  };
  return { manifest, grids };
}
