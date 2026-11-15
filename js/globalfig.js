// =============================================================
//  globalfig.js — two "big picture" scientific figures for the
//  Data page, computed from the loaded grids:
//   1. Warming by latitude (zonal-mean trend, two NASA records)
//   2. Distribution of trends across Earth's surface (area-weighted)
// =============================================================
import { getGrid, trendForCell, getCheck, fdrInfo } from './data.js';
import { styleFor } from './config.js';
import { ramp, fmt, signed } from './util.js';

const $ = (id) => document.getElementById(id);
const W8 = (lat) => Math.cos((lat * Math.PI) / 180);

/** Area-weighted mean trend per latitude band (step = grid step). */
function zonal(id) {
  const grid = getGrid(id);
  if (!grid) return null;
  const bands = new Map();
  for (const c of grid.cells) {
    const t = trendForCell(id, c);
    if (t.per_decade === null) continue;
    const b = bands.get(c.lat) || { s: 0, n: 0 };
    b.s += t.per_decade; b.n += 1;
    bands.set(c.lat, b);
  }
  return [...bands.entries()].sort((a, b) => a[0] - b[0]).map(([lat, b]) => ({ lat, v: b.s / b.n }));
}

function latitudeChart() {
  const main = zonal('temperature');
  if (!main) return '';
  const chk = getCheck('temperature');
  const second = chk ? zonal(chk.id) : null;
  const W = 640, H = 230, P = { l: 46, r: 14, t: 14, b: 30 };
  const all = [...main, ...(second || [])].map((d) => d.v);
  const ymax = Math.max(0.2, ...all) * 1.08, ymin = Math.min(0, ...all) * 1.08;
  const X = (lat) => P.l + ((lat + 90) / 180) * (W - P.l - P.r);
  const Y = (v) => P.t + (1 - (v - ymin) / (ymax - ymin)) * (H - P.t - P.b);
  const path = (d) => d.map((p, i) => `${i ? 'L' : 'M'}${X(p.lat).toFixed(1)},${Y(p.v).toFixed(1)}`).join('');
  const ticks = [];
  for (let v = Math.ceil(ymin * 5) / 5; v <= ymax + 1e-9; v += 0.2) ticks.push(+v.toFixed(1));
  const arctic = main.filter((d) => d.lat >= 66).map((d) => d.v), rest = main.filter((d) => d.lat < 60 && d.lat > -60).map((d) => d.v);
  const ratio = arctic.length && rest.length ? (arctic.reduce((a, b) => a + b, 0) / arctic.length) / (rest.reduce((a, b) => a + b, 0) / rest.length) : null;
  return `<figure class="gf">
    <figcaption><b>Warming by latitude, 2001–2024</b><span>Average temperature trend in each 5° latitude band (°C per decade).${ratio && ratio > 1 ? ` North of 66°N, warming is about ${fmt(ratio, 1)}× the average between 60°S and 60°N: the “Arctic amplification” documented in climate research.` : ''} The two records differ most around Antarctica, where weather stations are scarcest.</span></figcaption>
    <svg viewBox="0 0 ${W} ${H}" class="gf-svg" role="img" aria-label="Line chart of temperature trend by latitude">
      ${ticks.map((v) => `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" class="${v === 0 ? 'gf-zero' : 'gf-grid'}"/><text x="${P.l - 6}" y="${Y(v) + 4}" text-anchor="end" class="gf-ax">${signed(v, 1)}</text>`).join('')}
      ${[-60, -30, 0, 30, 60].map((l) => `<line x1="${X(l)}" x2="${X(l)}" y1="${P.t}" y2="${H - P.b}" class="gf-grid"/>`).join('')}
      ${[-90, -60, -30, 0, 30, 60, 90].map((l) => `<text x="${X(l)}" y="${H - 10}" text-anchor="${l === -90 ? 'start' : l === 90 ? 'end' : 'middle'}" class="gf-ax">${l === 0 ? 'Eq' : `${Math.abs(l)}°${l < 0 ? 'S' : 'N'}`}</text>`).join('')}
      <rect x="${X(66)}" y="${P.t}" width="${X(90) - X(66)}" height="${H - P.t - P.b}" class="gf-arctic"/>
      <text x="${X(78)}" y="${P.t + 12}" text-anchor="middle" class="gf-ax">Arctic</text>
      ${second ? `<path d="${path(second)}" class="gf-l2"/>` : ''}
      <path d="${path(main)}" class="gf-l1"/>
    </svg>
    <div class="gf-key"><span><i class="gk1"></i>NASA MERRA-2 (main record)</span>${second ? `<span><i class="gk2"></i>${chk.short || 'NASA GISTEMP'} (independent record)</span>` : ''}</div>
  </figure>`;
}

function histogram() {
  const grid = getGrid('temperature');
  if (!grid) return '';
  const st = styleFor('temperature');
  const step = 0.1, lo = -0.8, hi = 1.2;
  const nb = Math.round((hi - lo) / step);
  const sig = new Array(nb).fill(0), non = new Array(nb).fill(0);
  let wTot = 0, wUp = 0, wDown = 0;
  for (const c of grid.cells) {
    const t = trendForCell('temperature', c);
    if (t.per_decade === null) continue;
    const w = W8(c.lat);
    wTot += w;
    const i = Math.max(0, Math.min(nb - 1, Math.floor((t.per_decade - lo) / step)));
    (t.significant ? sig : non)[i] += w;
    if (t.significant) { if (t.per_decade > 0) wUp += w; else wDown += w; }
  }
  const pct = (a) => a.map((v) => (v / wTot) * 100);
  const S = pct(sig), N = pct(non);
  const max = Math.max(...S.map((v, i) => v + N[i]));
  const W = 640, H = 210, P = { l: 40, r: 10, t: 12, b: 30 };
  const bw = (W - P.l - P.r) / nb;
  const Y = (v) => H - P.b - (v / max) * (H - P.t - P.b);
  const bars = S.map((s, i) => {
    const mid = lo + (i + 0.5) * step;
    const col = ramp(st.trendColors, Math.max(0, Math.min(1, (mid + 0.6) / 1.2)));
    const x = P.l + i * bw + 1;
    return `<rect x="${x.toFixed(1)}" y="${Y(s).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${(H - P.b - Y(s)).toFixed(1)}" fill="${col}"><title>${signed(mid, 2)} °C/decade: ${fmt(s, 1)}% of Earth (significant)</title></rect>
      <rect x="${x.toFixed(1)}" y="${Y(s + N[i]).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${(Y(s) - Y(s + N[i])).toFixed(1)}" fill="${col}" opacity="0.3"><title>${signed(mid, 2)} °C/decade: ${fmt(N[i], 1)}% of Earth (not significant)</title></rect>`;
  }).join('');
  const X0 = P.l + ((0 - lo) / step) * bw;
  const ticks = [-0.8, -0.4, 0, 0.4, 0.8, 1.2];
  return `<figure class="gf">
    <figcaption><b>How much of Earth warmed, and by how much</b><span>Share of Earth’s surface (area-weighted) in each trend range. Solid = statistically significant; pale = not significant. ${fmt((wUp / wTot) * 100, 0)}% of the surface warmed significantly and ${fmt((wDown / wTot) * 100, 0)}% cooled significantly (NASA MERRA-2, 2001–2024).${(() => { const f = fdrInfo('temperature'); return f ? ` After the Benjamini–Hochberg multiple-testing correction, ${f.fdr.toLocaleString()} of the ${f.raw.toLocaleString()} significant places remain significant (about ${Math.round(f.expected)} would be expected by chance alone without correction).` : ''; })()}</span></figcaption>
    <svg viewBox="0 0 ${W} ${H}" class="gf-svg" role="img" aria-label="Histogram of temperature trends across Earth">
      ${bars}
      <line x1="${X0}" x2="${X0}" y1="${P.t}" y2="${H - P.b}" class="gf-zero"/>
      <line x1="${P.l}" x2="${W - P.r}" y1="${H - P.b}" y2="${H - P.b}" class="gf-grid"/>
      ${ticks.map((v, i) => `<text x="${P.l + ((v - lo) / step) * bw}" y="${H - 12}" text-anchor="${i === ticks.length - 1 ? 'end' : 'middle'}" class="gf-ax">${signed(v, 1)}</text>`).join('')}
      <text x="${W - P.r}" y="${H - 1}" text-anchor="end" class="gf-ax">°C per decade</text>
      <text x="${P.l - 6}" y="${Y(max) + 4}" text-anchor="end" class="gf-ax">${fmt(max, 0)}%</text>
      <text x="${P.l - 6}" y="${H - P.b + 4}" text-anchor="end" class="gf-ax">0</text>
    </svg>
  </figure>`;
}

let done = false;
/** Render once, the first time the Data page opens (the maths takes a moment). */
export function renderGlobalFigures() {
  const box = $('global-figs');
  if (!box || done) return;
  try {
    box.innerHTML = latitudeChart() + histogram();
    done = true;
  } catch (e) {
    console.warn('global figures', e);
    box.innerHTML = '';
  }
}
