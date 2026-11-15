// =============================================================
//  science.js — the "science strip", the investigation path and
//  the connected-clues (relationship) explorer in the report panel.
//  Everything here is computed from the loaded NASA data only.
// =============================================================
import { styleFor } from './config.js';
import { getManifest, getPlaceSeries, fdrInfo } from './data.js';
import { headline } from './story.js';
import { crossCheck } from './crosscheck.js';
import { stepCheck } from './jump.js';
import { fmt, signed, el } from './util.js';
import { icon } from './icons.js';
import { unusualYears, anomalyWord } from './anomaly.js';
import { term } from './glossary.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NAME = { temperature: 'Temperature', precipitation: 'Rainfall', soil_moisture: 'Soil moisture', ndvi: 'Vegetation' };
const nameOf = (id) => NAME[id] || (getManifest().variables.find((v) => v.id === id) || {}).label || id;
const pText = (p) => (p < 0.001 ? 'p < 0.001' : `p = ${p < 0.01 ? p.toFixed(3) : p.toFixed(2)}`);

/** Source, period, observations, missing-data warning, and how to read the numbers. */
export function renderSci(series) {
  const box = $('sci');
  const t = series.trend, y = series.years;
  const src = series.source || {};
  const nYears = y.length;
  const missing = y.filter((_, i) => series.values[i] === null);
  const area = series.scope === 'country'
    ? `area-weighted average of ${series.location.n_cells} grid cell${series.location.n_cells === 1 ? '' : 's'}`
    : `one ${series.location.cell_size}° grid cell (≈ ${Math.round(series.location.cell_size * 111)} km)`;
  const unit = (!series.unit || series.unit === '0–1') ? '0–1 wetness scale' : series.unit;
  const h = headline(series);
  const ci = t.ci_per_decade ? `${signed(t.ci_per_decade[0], Math.max(1, series.decimals))} to ${signed(t.ci_per_decade[1], Math.max(1, series.decimals))}` : null;
  const u = (!series.unit || series.unit === '0–1') ? '' : ` ${series.unit}`;
  const warn = missing.length
    ? `<div class="sci-warn">${icon('warning')}<span><b>${missing.length} of ${nYears} years missing</b> (${missing.slice(0, 6).join(', ')}${missing.length > 6 ? '…' : ''}). The trend uses the ${t.n} available years only; no values were filled in.</span></div>`
    : '';
  box.innerHTML = `
    <dl class="sci-grid">
      <div><dt>Variable</dt><dd>${esc(series.label)} · ${esc(unit)}${series.aggregation ? ` · ${esc(series.aggregation)}` : ''}</dd></div>
      <div><dt>Dataset</dt><dd>${src.url ? `<a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.name)} ${esc(src.dataset || '')} <span aria-hidden="true">↗</span></a>` : esc(src.name || '')}</dd></div>
      <div><dt>Period</dt><dd>${y[0]}–${y.at(-1)} · <b>${t.n} of ${nYears}</b> annual values</dd></div>
      <div><dt>Area</dt><dd>${esc(area)}</dd></div>
    </dl>
    ${warn}
    ${(() => { const fs = fdrStatus(series); return fs ? `<div class="sci-fdr ${fs.pass ? 'ok' : series.trend.significant ? 'warn' : ''}"><b>${fs.label}</b> ${term('fdr', '(FDR)')}<b>.</b> <span>${fs.text}</span></div>` : ''; })()}
    <details class="sci-read"><summary>How to read these numbers</summary>
      <ul>
        <li><b>${esc(h.big)} per decade</b> is the typical change over ten years (${term('sen', 'Sen’s slope')}, the median of all year-to-year slopes, so a single unusual year cannot drive it).</li>
        ${ci ? `<li><b>${term('ci', '95% CI')} ${ci}${u}</b>: the range in which the true rate of change most plausibly lies. A range that includes zero means the direction itself is uncertain.</li>` : ''}
        <li><b>${term('p', pText(t.p_value))}</b>: the probability of a trend at least this consistent arising from random year-to-year variation alone. Below 0.05 is called statistically significant. The ${term('mk', 'Mann–Kendall')} test is corrected for autocorrelation (${term('hr', 'Hamed–Rao')}).</li>
        <li><b>What this does not show:</b> the cause of the change, conditions at a single town or field inside this ${series.scope === 'country' ? 'country' : 'cell'}, or what will happen after ${y.at(-1)}. A significant trend over ${nYears} years is evidence of change, not proof of a long-term climate shift.</li>
      </ul>
    </details>`;
}

/** Unusual years: extreme even for their time (after removing the trend). */
export function renderAnomalies(series) {
  const box = $('anomalies');
  const list = unusualYears(series);
  const u = (!series.unit || series.unit === '0–1') ? '' : ` ${series.unit}`;
  const d = Math.max(0, series.decimals);
  if (!list.length) {
    box.innerHTML = `<p class="an-none">${icon('check')}<span><b>No unusual years.</b> Every year from ${series.years[0]} to ${series.years.at(-1)} lies within 2 standard deviations of what the long-term trend predicts.</span></p>`;
    return;
  }
  box.innerHTML = `<div class="an-head"><b>${term('anomaly', 'Unusual years')}</b><span>more than 2 SD from what the trend predicts</span></div>
    <ul class="an-list">${list.slice(0, 4).map((o) => `<li class="${o.z > 0 ? 'an-up' : 'an-down'}"><b>${o.year}</b><span>${anomalyWord(series.variable, o.z)}: ${fmt(o.value, d)}${u} vs about ${fmt(o.expected, d)}${u} expected (${o.z > 0 ? '+' : '−'}${fmt(Math.abs(o.z), 1)} SD)${o.record ? `, the ${o.record} in the record` : ''}</span></li>`).join('')}</ul>
    <p class="an-note">An unusual year is a single event, not a trend. It is a starting point for investigation: what happened that year?</p>`;
}

/** The six-step detective path for this place, filled with this place's real evidence. */
export function renderPath(series, placeName) {
  const t = series.trend;
  const st = styleFor(series.variable);
  const noun = (st.noun || nameOf(series.variable)).toLowerCase();
  const y0 = series.years[0], y1 = series.years.at(-1);
  const xc = crossCheck(series);
  const j = t.significant ? stepCheck(series.years, series.values) : null;
  const tested = `${t.significant ? 'Statistically significant' : 'Not statistically significant'} (${pText(t.p_value)}, ${t.n} years)`;
  const valid = [xc ? xc.badge : 'No independent dataset available', j && j.flagged ? `step change around ${j.year}` : t.significant ? 'no sudden jump' : null].filter(Boolean).join('; ');
  const near = series.scope === 'country' ? 'in' : 'near';
  const caution = cautiousConclusion(series, placeName);
  const steps = [
    ['Question', `How has ${noun} changed ${near} ${esc(placeName)} since ${y0}?`],
    ['Place & indicator', `${esc(placeName)} · ${esc(series.label)} from ${esc(series.source.name)}`],
    ['Evidence', `${t.n} annual values, shown in the chart and climate stripes above${(() => { const an = unusualYears(series); return an.length ? `; unusual year${an.length > 1 ? 's' : ''}: ${an.slice(0, 3).map((o) => o.year).join(', ')}` : '; no unusual years'; })()}`],
    ['Test', `${tested}${t.ci_per_decade ? '; 95% CI shown under the headline' : ''}`],
    ['Validate', esc(valid)],
    ['Explain', 'What other evidence would you need before claiming <i>why</i> this changed? Compare connected indicators below, then look for published studies of this region.'],
  ];
  $('path').replaceChildren(...steps.map(([k, v], i) => {
    const li = el('li', { class: 'path-step' });
    li.innerHTML = `<span class="ps-n">${i + 1}</span><div><b>${k}</b><span>${v}</span></div>`;
    return li;
  }));
  const concl = $('path-conclusion');
  concl.querySelector('p').textContent = caution;
  concl.querySelector('button').onclick = async () => {
    try { await navigator.clipboard.writeText(caution); } catch { /* clipboard blocked */ }
    const b = concl.querySelector('button'); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1500);
  };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** One cautious, evidence-matched conclusion sentence for a place. */
export function cautiousConclusion(series, placeName) {
  const t = series.trend;
  const st = styleFor(series.variable);
  const noun = (st.noun || nameOf(series.variable)).toLowerCase();
  const y0 = series.years[0], y1 = series.years.at(-1);
  const xc = crossCheck(series);
  const j = t.significant ? stepCheck(series.years, series.values) : null;
  const dir = t.per_decade > 0 ? 'increased' : 'decreased';
  const mag = headline(series).big.replace(/^[+−-]/, '');
  const near = series.scope === 'country' ? 'in' : 'near';
  const caution = !t.significant
    ? `Over ${y0}–${y1}, ${noun} ${near} ${placeName} shows no statistically significant trend (${pText(t.p_value)}); the available evidence is insufficient to conclude that it has changed.`
    : xc && (xc.kind === 'conflict' || xc.kind === 'inconsistent')
      ? `${cap(noun)} ${near} ${placeName} ${dir} by ${mag} per decade in one NASA record (${pText(t.p_value)}), but an independent record does not support this, so the trend remains unresolved.`
      : j && j.flagged
        ? `${cap(noun)} ${near} ${placeName} shifted around ${j.year}; the overall change (${headline(series).big} per decade, ${pText(t.p_value)}) reflects this step rather than gradual change.`
        : `${cap(noun)} ${near} ${placeName} ${dir} by about ${mag} per decade between ${y0} and ${y1} (${pText(t.p_value)}${xc && xc.kind === 'agree' ? ', supported by an independent NASA record' : ''}). This analysis does not identify the cause.`;
  const fs = fdrStatus(series);
  if (t.significant && fs && !fs.pass && !(xc && (xc.kind === 'conflict' || xc.kind === 'inconsistent'))) {
    return caution.replace(/ This analysis does not identify the cause\.$/, '') + ` It does not pass the stricter map-wide false-discovery-rate check${xc && xc.kind === 'agree' ? ', so the independent record is important supporting evidence' : ', so it should be treated as tentative'}. This analysis does not identify the cause.`;
  }
  return caution;
}


/** Pearson r of year-to-year changes (first differences), so shared long-term trends can't fake a link. */
export function diffCorr(a, b) {
  const xs = [], ys = [], idx = [];
  for (let i = 1; i < a.length; i++) {
    if ([a[i], a[i - 1], b[i], b[i - 1]].some((v) => v === null || v === undefined)) continue;
    xs.push(a[i] - a[i - 1]); ys.push(b[i] - b[i - 1]); idx.push(i);
  }
  const n = xs.length;
  if (n < 8) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  if (!sxx || !syy) return null;
  const r = sxy / Math.sqrt(sxx * syy);
  const tStat = Math.abs(r) * Math.sqrt((n - 2) / Math.max(1e-12, 1 - r * r));
  return { r, n, sig: tStat > tCrit(n - 2), xs, ys, idx };
}
// two-sided 5% critical t for small samples (df 6–40), else 2.0
function tCrit(df) {
  const T = { 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228, 12: 2.179, 14: 2.145, 16: 2.12, 18: 2.101, 20: 2.086, 22: 2.074, 25: 2.06, 30: 2.042, 40: 2.021 };
  const ks = Object.keys(T).map(Number).sort((a, b) => a - b);
  let best = 2.0;
  for (const k of ks) if (df >= k) best = T[k];
  return best;
}

/** Scatter plot of year-to-year changes, with a least-squares line. */
function scatter(c, xName, yName, hiIdx = -1) {
  const W = 150, H = 110, P = 14;
  const ext = (a) => { const m = Math.max(...a.map(Math.abs)) || 1; return [-m * 1.08, m * 1.08]; };
  const [x0, x1] = ext(c.xs), [y0, y1] = ext(c.ys);
  const X = (v) => P + ((v - x0) / (x1 - x0)) * (W - 2 * P);
  const Y = (v) => H - P - ((v - y0) / (y1 - y0)) * (H - 2 * P);
  const n = c.xs.length, mx = c.xs.reduce((a, b) => a + b, 0) / n, my = c.ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (c.xs[i] - mx) * (c.ys[i] - my); sxx += (c.xs[i] - mx) ** 2; }
  const b = sxx ? sxy / sxx : 0, a = my - b * mx;
  const pts = c.xs.map((x, i) => (c.idx[i] === hiIdx ? '' : `<circle cx="${X(x).toFixed(1)}" cy="${Y(c.ys[i]).toFixed(1)}" r="2.4"/>`)).join('');
  const h = c.idx.indexOf(hiIdx);
  const hi = h >= 0 ? `<circle cx="${X(c.xs[h]).toFixed(1)}" cy="${Y(c.ys[h]).toFixed(1)}" r="4.6" class="rs-hi"/>` : '';
  return `<svg class="rel-scatter" viewBox="0 0 ${W} ${H}" role="img" aria-label="Scatter of year-to-year changes in ${esc(xName)} against ${esc(yName)}">
    <line x1="${X(0)}" x2="${X(0)}" y1="${P / 2}" y2="${H - P / 2}" class="rs-axis"/><line x1="${P / 2}" x2="${W - P / 2}" y1="${Y(0)}" y2="${Y(0)}" class="rs-axis"/>
    ${pts}${hi}<line x1="${X(x0)}" y1="${Y(a + b * x0)}" x2="${X(x1)}" y2="${Y(a + b * x1)}" class="rs-fit"/>
    <text x="${W - 2}" y="${Y(0) - 3}" text-anchor="end" class="rs-lab">Δ ${esc(xName)}</text><text x="${X(0) + 3}" y="9" class="rs-lab">Δ ${esc(yName)}</text></svg>`;
}

function sparkPair(a, b) {
  const W = 120, H = 34;
  const norm = (arr) => {
    const v = arr.filter((x) => x !== null);
    const m = v.reduce((s, x) => s + x, 0) / v.length;
    const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length) || 1;
    return arr.map((x) => (x === null ? null : (x - m) / sd));
  };
  const path = (arr) => {
    const z = norm(arr), n = z.length;
    let d = '', pen = false;
    z.forEach((v, i) => {
      if (v === null) { pen = false; return; }
      const x = (i / (n - 1)) * W, yv = H / 2 - Math.max(-2.5, Math.min(2.5, v)) * (H / 5.4);
      d += `${pen ? 'L' : 'M'}${x.toFixed(1)},${yv.toFixed(1)}`; pen = true;
    });
    return d;
  };
  return `<svg class="rel-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${path(a)}" class="rs-a"/><path d="${path(b)}" class="rs-b"/></svg>`;
}

/** Connected clues: how the other indicators at this place move with the selected one. */
export function renderRelations(place, scope, variable, year = null) {
  const box = $('relations');
  const base = getPlaceSeries(variable, place, scope);
  const others = getManifest().variables.filter((v) => v.id !== variable);
  const rows = [];
  for (const v of others) {
    const s = base && getPlaceSeries(v.id, place, scope);
    if (!s) continue;
    const c = diffCorr(base.values, s.values);
    if (!c) continue;
    const strength = Math.abs(c.r) >= 0.7 ? 'strong' : Math.abs(c.r) >= 0.4 ? 'moderate' : Math.abs(c.r) >= 0.2 ? 'weak' : 'no clear';
    const way = c.r > 0 ? 'move together' : 'move in opposite directions';
    rows.push(`<div class="rel-row ${c.sig ? 'sig' : ''}">
      <div class="rel-top"><b>${esc(nameOf(variable))} ↔ ${esc(nameOf(v.id))}</b><span class="rel-r">${term('r', 'r')} = ${signed(c.r, 2)}</span></div>
      <div class="rel-body">${scatter(c, nameOf(variable), nameOf(v.id), year ? base.years.indexOf(year) : -1)}<span class="rel-txt">${strength === 'no clear' ? 'No clear year-to-year relationship' : `${cap(strength)} ${c.sig ? 'and statistically significant' : 'but not statistically significant'}: in years when one rises, the other tends to ${c.r > 0 ? 'rise' : 'fall'} (they ${way})`}. n = ${c.n} year-to-year changes.</span></div>
    </div>`);
  }
  if (!rows.length) { box.innerHTML = '<p class="muted small">No other indicator is available at this location.</p>'; return; }
  box.innerHTML = `${rows.join('')}
    <p class="rel-note">${icon('info')}<span>Correlation shows that two indicators vary together; it does not show that one causes the other. Both may respond to a third factor, such as El Niño. Each dot is one year’s change in both indicators; the line is the best fit. r summarises all years together, so it does not change with the timeline; in Timeline view the orange dot marks the change into the selected year. Using year-to-year changes means shared long-term trends cannot create a false link.</span></p>`;
}

/** Map-wide (multiple-testing) status of one trend, for any report. */
export function fdrStatus(series) {
  const f = fdrInfo(series.variable);
  const t = series.trend;
  if (!f || t.p_value === null) return null;
  const pass = t.significant && f.pCrit > 0 && t.p_value <= f.pCrit;
  return {
    pass, f,
    label: !t.significant ? 'Not significant locally' : pass ? 'Passes map-wide FDR check' : 'Significant locally, not map-wide',
    text: !t.significant
      ? `Not significant at this location, so no map-wide check applies.`
      : pass
        ? `Also passes the stricter map-wide test (Benjamini–Hochberg false discovery rate, p ≤ ${f.pCrit.toFixed(4)}), which allows for testing ${f.tests.toLocaleString()} places at once.`
        : `Significant when this place is tested on its own, but not under the stricter map-wide test (Benjamini–Hochberg false discovery rate, p ≤ ${f.pCrit ? f.pCrit.toFixed(4) : '—'}). Testing ${f.tests.toLocaleString()} places would produce about ${f.expected} “significant” results by chance alone, so treat this result as supported only if other evidence (an independent record or published studies) agrees.`,
  };
}
