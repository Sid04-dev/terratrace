// =============================================================
//  factsheet.js — two-page scientific fact sheet (print → PDF).
//  White background, print-quality SVG figures, full statistics,
//  validation, raw data table and references.
// =============================================================
import { CONFIG, styleFor } from './config.js';
import { fmt, signed, ramp } from './util.js';
import { formatCoord, getCountries } from './geo.js';
import { getManifest, getPlaceSeries, trendDisplay } from './data.js';
import { headline, evidenceLabel, summary } from './story.js';
import { crossCheck, checkInfo } from './crosscheck.js';
import { stepCheck } from './jump.js';
import { unusualYears, anomalyWord } from './anomaly.js';
import { cautiousConclusion, diffCorr, fdrStatus } from './science.js';
import { miniMap } from './globe.js';
import { citation, methods, areaText } from './exporter.js';

const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pTxt = (p) => (p === null || p === undefined ? '—' : p < 0.001 ? '< 0.001' : p < 0.01 ? p.toFixed(3) : p.toFixed(2));
const med = (a) => { const q = [...a].sort((m, n) => m - n), k = Math.floor(q.length / 2); return q.length % 2 ? q[k] : (q[k - 1] + q[k]) / 2; };
const NAME = { temperature: 'Temperature', precipitation: 'Rainfall', soil_moisture: 'Soil moisture' };

function niceTicks(lo, hi, n = 5) {
  const span = hi - lo || 1, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) || raw;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return { ticks: out, step };
}
const tickTxt = (v, step) => (step >= 1 ? Math.round(v).toString() : v.toFixed(step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3));

/** Fig. 1 — annual series, Sen trend, 95% CI band, early/late means, unusual years. */
function figSeries(s, an) {
  const W = 680, H = 250, P = { l: 52, r: 14, t: 14, b: 30 };
  const x = s.years, y = s.values, t = s.trend;
  const v = y.filter((a) => a !== null);
  const b = t.per_decade / 10;
  const xs = [], ys = []; x.forEach((yr, i) => { if (y[i] !== null) { xs.push(yr); ys.push(y[i]); } });
  const a = med(ys.map((val, i) => val - b * xs[i]));
  const xm = med(xs), ym = a + b * xm;
  const [clo, chi] = t.ci_per_decade ? t.ci_per_decade.map((q) => q / 10) : [b, b];
  const band = x.map((yr) => [ym + clo * (yr - xm), ym + chi * (yr - xm)]).map(([p, q]) => [Math.min(p, q), Math.max(p, q)]);
  const lo0 = Math.min(...v, ...band.map((q) => q[0])), hi0 = Math.max(...v, ...band.map((q) => q[1]));
  const pad = (hi0 - lo0) * 0.08 || 1;
  const { ticks, step } = niceTicks(lo0 - pad, hi0 + pad);
  const y0 = Math.min(lo0 - pad, ticks[0]), y1 = Math.max(hi0 + pad, ticks.at(-1));
  const X = (yr) => P.l + ((yr - x[0]) / (x.at(-1) - x[0])) * (W - P.l - P.r);
  const Y = (val) => P.t + (1 - (val - y0) / (y1 - y0)) * (H - P.t - P.b);
  const anY = new Set(an.map((o) => o.year));
  let d = '', pen = false;
  y.forEach((val, i) => { if (val === null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(x[i]).toFixed(1)},${Y(val).toFixed(1)}`; pen = true; });
  const bandPath = `M${x.map((yr, i) => `${X(yr).toFixed(1)},${Y(band[i][1]).toFixed(1)}`).join('L')}L${[...x].reverse().map((yr) => { const i = x.indexOf(yr); return `${X(yr).toFixed(1)},${Y(band[i][0]).toFixed(1)}`; }).join('L')}Z`;
  const w = Math.min(5, Math.floor(x.length / 2));
  const mean = (arr) => arr.reduce((p, q) => p + q, 0) / arr.length;
  const e = mean(y.slice(0, w).filter((q) => q !== null)), l = mean(y.slice(-w).filter((q) => q !== null));
  const yrTicks = [...new Set([...x.filter((yr) => (yr - x[0]) % 4 === 0 && x.at(-1) - yr >= 2), x.at(-1)])];
  return `<svg viewBox="0 0 ${W} ${H}" class="fs-fig">
    ${ticks.map((tv) => `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(tv)}" y2="${Y(tv)}" class="g"/><text x="${P.l - 6}" y="${Y(tv) + 3.5}" text-anchor="end" class="ax">${tickTxt(tv, step)}</text>`).join('')}
    ${yrTicks.map((yr) => `<text x="${X(yr)}" y="${H - 12}" text-anchor="middle" class="ax">${yr}</text><line x1="${X(yr)}" x2="${X(yr)}" y1="${H - P.b}" y2="${H - P.b + 4}" class="k"/>`).join('')}
    <line x1="${P.l}" x2="${W - P.r}" y1="${H - P.b}" y2="${H - P.b}" class="k"/><line x1="${P.l}" x2="${P.l}" y1="${P.t}" y2="${H - P.b}" class="k"/>
    <text transform="translate(12,${(P.t + H - P.b) / 2}) rotate(-90)" text-anchor="middle" class="ax">${esc(s.unit_note || s.unit || '')}</text>
    <path d="${bandPath}" class="band"/>
    <line x1="${X(x[0])}" x2="${X(x[w - 1])}" y1="${Y(e)}" y2="${Y(e)}" class="mean"/><line x1="${X(x.at(-w))}" x2="${X(x.at(-1))}" y1="${Y(l)}" y2="${Y(l)}" class="mean"/>
    <path d="${d}" class="series"/>
    <line x1="${X(x[0])}" y1="${Y(a + b * x[0])}" x2="${X(x.at(-1))}" y2="${Y(a + b * x.at(-1))}" class="trend"/>
    ${y.map((val, i) => (val === null ? '' : `<circle cx="${X(x[i]).toFixed(1)}" cy="${Y(val).toFixed(1)}" r="${anY.has(x[i]) ? 4 : 2.4}" class="${anY.has(x[i]) ? 'pt an' : 'pt'}"/>`)).join('')}
  </svg>
  <div class="fs-key"><span><i class="k1"></i>Annual value</span><span><i class="k2"></i>Sen’s-slope trend</span><span><i class="k3"></i>95% CI of trend</span><span><i class="k4"></i>5-year means (first, last)</span><span><i class="k5"></i>Unusual year (&gt;2 SD)</span></div>`;
}

/** Fig. 2 — annual departure from the first-5-year baseline (bar chart). */
function figAnomaly(s) {
  const W = 680, H = 170, P = { l: 52, r: 14, t: 10, b: 26 };
  const x = s.years, y = s.values;
  const w = Math.min(5, Math.floor(x.length / 2));
  const base = y.slice(0, w).filter((q) => q !== null).reduce((p, q, _, arr) => p + q / arr.length, 0);
  const dv = y.map((q) => (q === null ? null : q - base));
  const m = Math.max(...dv.filter((q) => q !== null).map(Math.abs)) * 1.1 || 1;
  const { ticks, step } = niceTicks(-m, m, 4);
  const lim = Math.max(m, Math.abs(ticks[0]), Math.abs(ticks.at(-1)));
  const X = (i) => P.l + (i / x.length) * (W - P.l - P.r);
  const Y = (val) => P.t + (1 - (val + lim) / (2 * lim)) * (H - P.t - P.b);
  const st = styleFor(s.variable);
  const bw = (W - P.l - P.r) / x.length;
  return `<svg viewBox="0 0 ${W} ${H}" class="fs-fig">
    ${ticks.map((tv) => `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(tv)}" y2="${Y(tv)}" class="${tv === 0 ? 'k' : 'g'}"/><text x="${P.l - 6}" y="${Y(tv) + 3.5}" text-anchor="end" class="ax">${signed(tv, step >= 1 ? 0 : step >= 0.1 ? 1 : 2)}</text>`).join('')}
    ${dv.map((q, i) => (q === null ? '' : `<rect x="${(X(i) + 1.5).toFixed(1)}" y="${Math.min(Y(q), Y(0)).toFixed(1)}" width="${(bw - 3).toFixed(1)}" height="${Math.abs(Y(q) - Y(0)).toFixed(1)}" fill="${ramp(st.trendColors, Math.max(0, Math.min(1, 0.5 + q / (2 * lim))))}" stroke="#333" stroke-width="0.3"/>`)).join('')}
    ${x.map((yr, i) => { const show = i === x.length - 1 || ((yr - x[0]) % 4 === 0 && x.at(-1) - yr >= 2); return show ? `<text x="${X(i) + bw / 2}" y="${H - 9}" text-anchor="middle" class="ax">${yr}</text>` : ''; }).join('')}
  </svg>`;
}

/** Fig. 3 — climate stripes. */
function figStripes(s) {
  const W = 680, H = 46;
  const v = s.values.filter((q) => q !== null), avg = v.reduce((p, q) => p + q, 0) / v.length;
  const m = Math.max(...v.map((q) => Math.abs(q - avg))) || 1;
  const st = styleFor(s.variable), bw = W / s.values.length;
  return `<svg viewBox="0 0 ${W} ${H + 14}" class="fs-fig">${s.values.map((q, i) => `<rect x="${(i * bw).toFixed(2)}" y="0" width="${(bw + 0.6).toFixed(2)}" height="${H}" fill="${q === null ? '#ccc' : ramp(st.trendColors, 0.5 + (q - avg) / (2 * m))}"/>`).join('')}
    <text x="0" y="${H + 11}" class="ax">${s.years[0]}</text><text x="${W}" y="${H + 11}" text-anchor="end" class="ax">${s.years.at(-1)}</text></svg>`;
}

/** Fig. 5 — scatter of year-to-year changes for each other indicator. */
function figScatter(c, xn, yn) {
  const W = 210, H = 160, P = 22;
  const ext = (arr) => { const m = Math.max(...arr.map(Math.abs)) * 1.1 || 1; return [-m, m]; };
  const [x0, x1] = ext(c.xs), [y0, y1] = ext(c.ys);
  const X = (q) => P + ((q - x0) / (x1 - x0)) * (W - 2 * P), Y = (q) => H - P - ((q - y0) / (y1 - y0)) * (H - 2 * P);
  const n = c.xs.length, mx = c.xs.reduce((p, q) => p + q, 0) / n, my = c.ys.reduce((p, q) => p + q, 0) / n;
  let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (c.xs[i] - mx) * (c.ys[i] - my); sxx += (c.xs[i] - mx) ** 2; }
  const bb = sxx ? sxy / sxx : 0, aa = my - bb * mx;
  return `<svg viewBox="0 0 ${W} ${H}" class="fs-fig fs-sc">
    <rect x="${P}" y="${P}" width="${W - 2 * P}" height="${H - 2 * P}" class="frame"/>
    <line x1="${X(0)}" x2="${X(0)}" y1="${P}" y2="${H - P}" class="g"/><line x1="${P}" x2="${W - P}" y1="${Y(0)}" y2="${Y(0)}" class="g"/>
    ${c.xs.map((q, i) => `<circle cx="${X(q).toFixed(1)}" cy="${Y(c.ys[i]).toFixed(1)}" r="2.6" class="pt"/>`).join('')}
    <line x1="${X(x0)}" y1="${Y(aa + bb * x0)}" x2="${X(x1)}" y2="${Y(aa + bb * x1)}" class="trend"/>
    <text x="${W / 2}" y="${H - 6}" text-anchor="middle" class="ax">Δ ${esc(xn)}</text>
    <text transform="translate(10,${H / 2}) rotate(-90)" text-anchor="middle" class="ax">Δ ${esc(yn)}</text>
    <text x="${W - P - 3}" y="${P + 11}" text-anchor="end" class="ax b">r = ${signed(c.r, 2)}${c.sig ? '*' : ''}</text></svg>`;
}

export function scientificFactSheet(series, place, scope) {
  const s = series, t = s.trend, h = headline(s), ev = evidenceLabel(t.p_value, s.years);
  const d = Math.max(0, s.decimals), u = (!s.unit || s.unit === '0–1') ? '' : ` ${s.unit}`;
  const unitTxt = (!s.unit || s.unit === '0–1') ? '0–1 wetness scale' : s.unit;
  const rel = trendDisplay(s.variable) !== 'absolute' && t.rel_per_decade !== null && t.per_decade;
  const xc = crossCheck(s), j = stepCheck(s.years, s.values), an = unusualYears(s);
  const L = s.location;
  const map = miniMap(L.cell_lat ?? L.lat, L.cell_lon ?? L.lon, { w: 420, h: 230, spanLon: 60, countries: getCountries(), highlight: s.scope === 'country' ? L.country : null });
  const mapImg = map ? map.toDataURL('image/jpeg', 0.9) : null;
  const y0 = s.years[0], y1 = s.years.at(-1);
  const ciTxt = t.ci_per_decade ? `${signed(t.ci_per_decade[0], Math.max(1, d))} to ${signed(t.ci_per_decade[1], Math.max(1, d))}${u}` : '—';
  const pct = Math.abs(t.first_mean) > 1e-9 ? ((t.last_mean - t.first_mean) / Math.abs(t.first_mean)) * 100 : null;
  const cl = (v, p, n) => `${Math.abs(v).toFixed(1)}${v >= 0 ? p : n}`;
  const id = `TT-${s.variable.slice(0, 3).toUpperCase()}-${cl(L.cell_lat ?? L.lat, 'N', 'S')}${cl(L.cell_lon ?? L.lon, 'E', 'W')}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  // connected clues
  const others = getManifest().variables.filter((v) => v.id !== s.variable);
  const rels = others.map((v) => { const o = getPlaceSeries(v.id, { lat: L.lat, lon: L.lon, country: L.country }, scope); const c = o && diffCorr(s.values, o.values); return c ? { v, c } : null; }).filter(Boolean);
  const xcRow = xc ? `<tr><td>Independent record</td><td>${esc(checkInfo(xc.chk).full)}</td><td>${headline(xc.s2).big} per decade, p ${pTxt(xc.s2.trend.p_value)}</td><td><b>${esc(xc.badge)}</b></td></tr>` : '<tr><td>Independent record</td><td>—</td><td>Not available</td><td>—</td></tr>';
  const jRow = `<tr><td>Step-change test</td><td>Single step vs linear model</td><td>${j ? `R² step ${fmt(j.r2Step, 2)} vs line ${fmt(j.r2Line, 2)}` : '—'}</td><td><b>${j && j.flagged ? `Step around ${j.year}` : 'Gradual (no step)'}</b></td></tr>`;
  const acRow = `<tr><td>Autocorrelation</td><td>Hamed–Rao (1998) variance correction</td><td>Variance factor ×${fmt(t.ac_factor ?? 1, 2)}; uncorrected p ${pTxt(t.p_value_classic)}</td><td><b>${t.significant ? 'Significant after correction' : 'Not significant'}</b></td></tr>`;
  const fs = fdrStatus(s);
  const fdrRow = fs ? `<tr><td>Multiple testing</td><td>Benjamini–Hochberg FDR across ${fs.f.tests.toLocaleString()} places (q = 0.05)</td><td>Map-wide threshold p ≤ ${fs.f.pCrit ? fs.f.pCrit.toFixed(4) : '—'}; ${fs.f.fdr.toLocaleString()} of ${fs.f.raw.toLocaleString()} locally significant places pass</td><td><b>${fs.label}</b></td></tr>` : '';
  const anRow = `<tr><td>Unusual years</td><td>&gt; 2 robust SD from trend</td><td>${an.length ? an.slice(0, 4).map((o) => `${o.year} (${o.z > 0 ? '+' : '−'}${fmt(Math.abs(o.z), 1)} SD)`).join(', ') : 'None'}</td><td><b>${an.length ? `${an.length} flagged` : 'None'}</b></td></tr>`;
  const half = Math.ceil(s.years.length / 2);
  const dataRows = [s.years.slice(0, half), s.years.slice(half)].map((yrs) => `<tr><th>Year</th>${yrs.map((yr) => `<th>${yr}</th>`).join('')}</tr><tr><td>${esc(unitTxt)}</td>${yrs.map((yr) => { const val = s.values[s.years.indexOf(yr)]; const isA = an.some((o) => o.year === yr); return `<td class="${isA ? 'an' : ''}">${val === null ? '—' : fmt(val, d)}</td>`; }).join('')}</tr>`).join('');
  const refs = [
    citation(s, 'apa'),
    ...(xc ? [citation(xc.s2, 'apa')] : []),
    'Mann, H. B. (1945). Nonparametric tests against trend. Econometrica, 13(3), 245–259.',
    'Kendall, M. G. (1975). Rank Correlation Methods (4th ed.). Charles Griffin.',
    'Sen, P. K. (1968). Estimates of the regression coefficient based on Kendall’s tau. Journal of the American Statistical Association, 63(324), 1379–1389.',
    'Hamed, K. H., & Rao, A. R. (1998). A modified Mann–Kendall trend test for autocorrelated data. Journal of Hydrology, 204, 182–196.',
    'Gilbert, R. O. (1987). Statistical Methods for Environmental Pollution Monitoring. Van Nostrand Reinhold.',
  ];
  const box = document.getElementById('print-sheet');
  box.innerHTML = `
  <section class="fs-page">
    <header class="fs-head"><div><b>${CONFIG.appName}</b> · Climate Trend Fact Sheet</div><div>${id} · ${today}</div></header>
    ${s.is_demo ? '<div class="fs-warn">DEMO DATA — synthetic values, not for citation</div>' : ''}
    <h1>${esc(s.label)}: ${esc(place)}</h1>
    <p class="fs-sub">${s.scope === 'country' ? `Area-weighted national average (${L.n_cells} grid cell${L.n_cells === 1 ? '' : 's'})` : `${L.cell_size}° grid cell centred on ${formatCoord(L.cell_lat ?? L.lat, L.cell_lon ?? L.lon)} (≈ ${Math.round(L.cell_size * 111)} km)`} · ${y0}–${y1} · ${esc(s.source.name)} ${esc(s.source.dataset || '')}</p>
    <div class="fs-stats">
      <div><span>Trend (Sen’s slope)</span><b>${h.big}</b><em>per decade${rel ? ` (${signed(t.per_decade, d)}${u})` : ''}</em></div>
      <div><span>95% confidence interval</span><b class="sm">${ciTxt}</b><em>per decade</em></div>
      <div><span>Mann–Kendall (corrected)</span><b>p ${pTxt(t.p_value)}</b><em>${esc(ev.text)}</em></div>
      <div><span>Change in 5-year mean</span><b class="sm">${signed(t.last_mean - t.first_mean, d)}${u}</b><em>${pct !== null && s.unit !== '°C' ? `${signed(pct, 0)}% · ` : ''}${y0}–${y0 + 4} → ${y1 - 4}–${y1}</em></div>
      <div><span>Independent check</span><b class="sm">${xc ? esc(xc.badge.replace(' Note', '')) : '—'}</b><em>${xc ? esc(checkInfo(xc.chk).name) : 'no second record'}</em></div>
      <div><span>Record</span><b>${t.n}/${s.years.length}</b><em>valid years, none filled</em></div>
    </div>
    <div class="fs-row">
      <figure class="fs-main"><figcaption><b>Figure 1.</b> Annual ${esc(s.label.toLowerCase())} with Sen’s-slope trend and its 95% confidence band.</figcaption>${figSeries(s, an)}</figure>
    </div>
    <div class="fs-row two">
      <figure><figcaption><b>Figure 2.</b> Departure from the ${y0}–${y0 + 4} mean (${esc(s.unit_note || s.unit || '')}).</figcaption>${figAnomaly(s)}</figure>
      ${mapImg ? `<figure><figcaption><b>Figure 3.</b> Location (marker) on the ${esc(NAME[s.variable] || s.label)} map.</figcaption><img src="${mapImg}" class="fs-map" alt="Location map"></figure>` : ''}
    </div>
    <figure><figcaption><b>Figure 4.</b> Climate stripes: each bar is one year, coloured relative to the ${y0}–${y1} mean.</figcaption>${figStripes(s)}</figure>
    <h2>Key finding</h2>
    <p class="fs-concl">${esc(cautiousConclusion(s, place))}</p>
  </section>
  <section class="fs-page">
    <header class="fs-head"><div><b>${CONFIG.appName}</b> · ${esc(s.label)}: ${esc(place)}</div><div>${id} · page 2</div></header>
    <h2>Table 1. Statistical results</h2>
    <table class="fs-tab"><tbody>
      <tr><td>Sen’s slope</td><td><b>${signed(t.per_decade, Math.max(2, d))}${u} per decade</b></td><td>95% CI (Gilbert 1987)</td><td>${ciTxt}</td></tr>
      <tr><td>Mann–Kendall p (Hamed–Rao corrected)</td><td><b>${pTxt(t.p_value)}</b></td><td>Uncorrected p</td><td>${pTxt(t.p_value_classic)}</td></tr>
      <tr><td>Significance (α = ${CONFIG.alpha})</td><td><b>${t.significant ? 'Yes' : 'No'}</b></td><td>Valid years</td><td>${t.n} of ${s.years.length} (${fmt(t.completeness * 100, 0)}%)</td></tr>
      <tr><td>${y0}–${y0 + 4} mean</td><td>${fmt(t.first_mean, d)}${u}</td><td>${y1 - 4}–${y1} mean</td><td>${fmt(t.last_mean, d)}${u}</td></tr>
      <tr><td>Highest year</td><td>${t.max ? `${t.max.year} (${fmt(t.max.value, d)}${u})` : '—'}</td><td>Lowest year</td><td>${t.min ? `${t.min.year} (${fmt(t.min.value, d)}${u})` : '—'}</td></tr>
    </tbody></table>
    <h2>Table 2. Validation and robustness checks</h2>
    <table class="fs-tab hd"><thead><tr><th>Check</th><th>Method</th><th>Result</th><th>Outcome</th></tr></thead><tbody>${xcRow}${jRow}${acRow}${fdrRow}${anRow}</tbody></table>
    ${xc ? `<p class="fs-note">${esc(xc.advice)}</p>` : ''}
    ${rels.length ? `<h2>Figure 5. Connected Earth-system indicators</h2>
    <div class="fs-row sc">${rels.map((r) => figScatter(r.c, NAME[s.variable] || s.label, NAME[r.v.id] || r.v.label)).join('')}
      <p class="fs-note">Year-to-year changes at this location (n = ${rels[0].c.n}); * = significant at α = 0.05. First differences remove shared long-term trends. Correlation does not imply causation.</p></div>` : ''}
    <h2>Table 3. Annual values (${esc(unitTxt)}${s.aggregation ? `, ${esc(s.aggregation)}` : ''})</h2>
    <table class="fs-tab data">${dataRows}</table>
    <h2>Interpretation and limitations</h2>
    <p>${esc(summary(s, place))}</p>
    <ul class="fs-lim"><li>This analysis tests whether change occurred, not why; causes are not assessed.</li><li>Values represent ${esc(areaText(s))}, not conditions at a single site.</li><li>A ${s.years.length}-year record can miss longer-term variability; results do not predict future years.</li>${s.source && /MERRA|POWER|GLDAS/i.test(`${s.source.name} ${s.source.dataset}`) ? '<li>The primary record is derived from a model constrained by observations (reanalysis), not direct measurement.</li>' : ''}</ul>
    <h2>Methods</h2>
    <p class="fs-small">${esc(methods(s, place))}</p>
    <h2>References</h2>
    <ol class="fs-refs">${refs.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>
    <footer class="fs-foot">Generated with ${CONFIG.appName} (NASA Space Apps Challenge 2026) on ${today}. All values are computed from the cited NASA datasets and are reproducible with the stated methods. Verify against the original data before publication.</footer>
  </section>`;
  document.body.classList.add('printing');
  setTimeout(() => { window.print(); document.body.classList.remove('printing'); }, 250);
}
