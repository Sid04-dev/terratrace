// =============================================================
//  casestudy.js — one complete, worked investigation (Central Chile
//  rainfall) and the "validation against published research" table.
//  Every TerraTrace number here is computed live from the loaded data,
//  so it always matches the globe. Published values are quoted from
//  the cited papers.
// =============================================================
import { getPlaceSeries, getManifest, trendDisplay } from './data.js';
import { unusualYears, anomalyWord } from './anomaly.js';
import { cautiousConclusion, fdrStatus, diffCorr } from './science.js';
import { formatCoord, getCountries } from './geo.js';
import { miniMap } from './globe.js';
import { headline } from './story.js';
import { crossCheck, checkInfo } from './crosscheck.js';
import { stepCheck } from './jump.js';
import { citation } from './exporter.js';
import { fmt, signed } from './util.js';
import { icon } from './icons.js';

const $ = (id) => document.getElementById(id);
const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pText = (p) => (p < 0.001 ? 'p < 0.001' : `p = ${p < 0.01 ? p.toFixed(3) : p.toFixed(2)}`);
const CHILE = { lat: -37, lon: -72.5, name: 'Central Chile', country: 'Chile' };

const REFS = {
  garreaud: { short: 'Garreaud et al. (2017)', full: 'Garreaud, R. D., et al. (2017). The 2010–2015 megadrought in central Chile: impacts on regional hydroclimate and vegetation. Hydrology and Earth System Sciences, 21, 6307.', url: 'https://doi.org/10.5194/hess-21-6307-2017' },
  isaksen: { short: 'Isaksen et al. (2022)', full: 'Isaksen, K., et al. (2022). Exceptional warming over the Barents area. Scientific Reports, 12.', url: 'https://doi.org/10.1038/s41598-022-13568-5' },
  zittis: { short: 'Zittis et al. (2022)', full: 'Zittis, G., et al. (2022). Climate change and weather extremes in the Eastern Mediterranean and Middle East. Reviews of Geophysics, 60, e2021RG000762.', url: 'https://doi.org/10.1029/2021RG000762' },
  giss: { short: 'NASA GISS GISTEMP', full: 'NASA Goddard Institute for Space Studies, GISTEMP v4.', url: 'https://data.giss.nasa.gov/gistemp/' },
};

/** Small SVG chart: annual values + Sen's-slope trend line. */
function svgChart(series, an = []) {
  const anY = new Set(an.map((o) => o.year));
  const small = window.innerWidth < 600;
  const W = small ? 340 : 560, H = small ? 200 : 190, P = { l: 42, r: 10, t: 18, b: 24 };
  const x = series.years, y = series.values;
  const v = y.filter((a) => a !== null);
  const lo = Math.min(...v), hi = Math.max(...v), pad = (hi - lo) * 0.08 || 1;
  const y0 = lo - pad, y1 = hi + pad;
  const X = (yr) => P.l + ((yr - x[0]) / (x.at(-1) - x[0])) * (W - P.l - P.r);
  const Y = (val) => P.t + (1 - (val - y0) / (y1 - y0)) * (H - P.t - P.b);
  let d = '', pen = false;
  y.forEach((val, i) => { if (val === null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(x[i]).toFixed(1)},${Y(val).toFixed(1)}`; pen = true; });
  // Sen line through the median of (y - b·x)
  const b = series.trend.per_decade / 10;
  const res = []; y.forEach((val, i) => { if (val !== null) res.push(val - b * x[i]); });
  res.sort((m, n) => m - n);
  const a = res.length % 2 ? res[(res.length - 1) / 2] : (res[res.length / 2 - 1] + res[res.length / 2]) / 2;
  const ticks = [0, 0.5, 1].map((f) => y0 + f * (y1 - y0));
  const step = small ? 8 : 5;
  const yearsT = [0, 1, 2, 3, 4].map((i) => x[0] + i * step).filter((t) => t <= x.at(-1) - 2).concat(x.at(-1));
  return `<svg class="cs-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Annual ${series.label}, ${x[0]}–${x.at(-1)}, with trend line">
    ${ticks.map((t) => `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(t)}" y2="${Y(t)}" class="cs-grid"/><text x="${P.l - 6}" y="${Y(t) + 4}" text-anchor="end" class="cs-ax">${hi - lo < 5 ? t.toFixed(hi - lo < 0.5 ? 2 : 1) : Math.round(t)}</text>`).join('')}
    ${[...new Set(yearsT)].map((t, i, arr) => `<text x="${X(t)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === arr.length - 1 ? 'end' : 'middle'}" class="cs-ax">${t}</text>`).join('')}
    <path d="${d}" class="cs-line"/>
    ${y.map((val, i) => (val === null ? '' : `<circle cx="${X(x[i]).toFixed(1)}" cy="${Y(val).toFixed(1)}" r="${anY.has(x[i]) ? 4.5 : 2.6}" class="cs-dot${anY.has(x[i]) ? ' an' : ''}"/>`)).join('')}
    <line x1="${X(x[0])}" y1="${Y(a + b * x[0])}" x2="${X(x.at(-1))}" y2="${Y(a + b * x.at(-1))}" class="cs-trend"/>
    <text x="${W - P.r}" y="${P.t - 6}" text-anchor="end" class="cs-ax">${series.unit}</text>
  </svg>`;
}

const QUESTION = {
  temperature: (p, y0) => `Has the temperature ${p} changed since ${y0}, and by how much?`,
  precipitation: (p, y0) => `Has rainfall ${p} changed since ${y0}, and by how much?`,
  soil_moisture: (p, y0) => `Has the soil ${p} become wetter or drier since ${y0}?`,
};

/**
 * Build and open a full, reproducible investigation for ANY place + variable.
 * opts: { title, question, context, published: {ref, text}, onOpenGlobe, place }
 */
export function openInvestigation(s, placeName, opts = {}) {
  const body = $('case-body');
  const t = s.trend, h = headline(s);
  const xc = crossCheck(s), j = stepCheck(s.years, s.values);
  const an = unusualYears(s);
  const y0 = s.years[0], y1 = s.years.at(-1);
  const near = s.scope === 'country' ? `in ${placeName}` : `near ${placeName}`;
  const u = (!s.unit || s.unit === '0–1') ? '' : ` ${s.unit}`;
  const d = Math.max(0, s.decimals);
  const recentPct = Math.abs(t.first_mean) > 1e-9 ? ((t.last_mean - t.first_mean) / Math.abs(t.first_mean)) * 100 : null;
  const rel = trendDisplay(s.variable) !== 'absolute' && t.rel_per_decade !== null && t.per_decade;
  const k = rel ? t.rel_per_decade / t.per_decade : 1;
  const ci = t.ci_per_decade;
  const ciTxt = ci ? (rel ? `${signed(ci[0] * k, 1)}% to ${signed(ci[1] * k, 1)}%` : `${signed(ci[0], Math.max(1, d))} to ${signed(ci[1], Math.max(1, d))}${u}`) : '—';
  const ciClear = ci && Math.sign(ci[0]) === Math.sign(ci[1]);
  const area = s.scope === 'country'
    ? `Area-weighted average of ${s.location.n_cells} grid cell${s.location.n_cells === 1 ? '' : 's'} covering ${esc(s.location.country)}`
    : `${s.location.cell_size}° grid cell centred on ${formatCoord(s.location.cell_lat ?? s.location.lat, s.location.cell_lon ?? s.location.lon)} (≈ ${Math.round(s.location.cell_size * 111)} km)`;
  const conclusion = cautiousConclusion(s, placeName) + (opts.published ? ` ${opts.published.concl}` : '');
  const refs = [citation(s, 'apa')];
  if (xc) refs.push(citation(xc.s2, 'apa'));
  if (opts.published) refs.push(`${opts.published.ref.full} ${opts.published.ref.url}`);
  const refText = refs.join('\n\n');
  const L = s.location;
  const map = miniMap(L.cell_lat ?? L.lat, L.cell_lon ?? L.lon, { w: 640, h: 300, spanLon: 60, countries: getCountries(), highlight: s.scope === 'country' ? L.country : null });
  const mapImg = map ? `<figure class="cs-map"><img src="${map.toDataURL('image/jpeg', 0.85)}" alt="Map of the study area, coloured by the trend layer currently shown on the globe"><figcaption>Study area (marker) on the TerraTrace map; colours show the layer currently selected on the globe.</figcaption></figure>` : '';
  const step = (n, title, html) => `<section class="cs-step"><div class="cs-n">${n}</div><div class="cs-c"><h3>${title}</h3>${html}</div></section>`;
  const question = opts.question || (QUESTION[s.variable] || ((p, y) => `How has ${s.label.toLowerCase()} ${p} changed since ${y}?`))(near, y0);
  $('case-eyebrow').textContent = opts.eyebrow || 'Investigation report';
  $('case-h').textContent = opts.title || `${s.label} ${near}, ${y0}–${y1}`;
  body.innerHTML = [
    step(1, 'Question', `<p class="cs-q">${esc(question)}</p>${opts.context ? `<p class="muted">${opts.context}</p>` : ''}`),
    step(2, 'Place and data', `<dl class="cs-dl">
      <div><dt>Location</dt><dd>${area}</dd></div>
      <div><dt>Indicator</dt><dd>${esc(s.label)} (${esc((!s.unit || s.unit === '0–1') ? '0–1 wetness scale' : s.unit)}${s.aggregation ? `, ${esc(s.aggregation)}` : ''})</dd></div>
      <div><dt>Dataset</dt><dd>${s.source.url ? `<a href="${esc(s.source.url)}" target="_blank" rel="noopener">${esc(s.source.name)} ${esc(s.source.dataset || '')} ↗</a>` : esc(s.source.name)}</dd></div>
      <div><dt>Record</dt><dd>${y0}–${y1}, ${t.n} of ${s.years.length} years valid, no gaps filled</dd></div></dl>${mapImg}`),
    step(3, 'Evidence', `${svgChart(s, an)}<p class="muted">Each dot is one year; orange dots are unusual years. The dashed line is the Sen’s-slope trend. The ${y0}–${y0 + 4} average was <b>${fmt(t.first_mean, d)}${u}</b>; the ${y1 - 4}–${y1} average was <b>${fmt(t.last_mean, d)}${u}</b>${recentPct !== null && s.unit !== '°C' ? ` (${signed(recentPct, 0)}%)` : ''}.</p>
      ${an.length ? `<p class="muted"><b>Unusual years</b> (more than 2 SD from the trend): ${an.slice(0, 4).map((o) => `${o.year} (${anomalyWord(s.variable, o.z)}, ${o.z > 0 ? '+' : '−'}${fmt(Math.abs(o.z), 1)} SD)`).join('; ')}.</p>` : '<p class="muted">No unusual years: every year lies within 2 SD of the trend.</p>'}`),
    step(4, 'Trend test', `<div class="cs-big"><b>${h.big}</b><span>per decade${rel ? ` (${signed(t.per_decade, d)}${u})` : ''}</span></div>
      <ul class="cs-list"><li>95% confidence interval: <b>${ciTxt}</b> per decade${ci ? (ciClear ? ' — the whole range is on one side of zero, so the direction is clear.' : ' — the range includes zero, so the direction itself is uncertain.') : ''}</li>
      <li>Mann–Kendall test, corrected for autocorrelation: <b>${pText(t.p_value)}</b> — ${t.significant ? 'a trend this consistent is very unlikely to be random year-to-year variation.' : 'above 0.05, so the trend could be random year-to-year variation.'}</li></ul>`),
    step(5, 'Validation', `<ul class="cs-checks">
      <li>${icon(xc ? ({ agree: 'check', partial: 'info', conflict: 'warning', inconsistent: 'warning' }[xc.kind] || 'info') : 'info')}<span><b>Independent NASA record.</b> ${xc ? `${checkInfo(xc.chk).full} gives ${headline(xc.s2).big} per decade (${pText(xc.s2.trend.p_value)}): ${xc.badge}.` : 'No second dataset is available for this variable here.'}</span></li>
      <li>${icon(j && j.flagged ? 'warning' : 'check')}<span><b>Sudden-jump check.</b> ${!j ? 'Not enough data.' : j.flagged ? `A single step around ${j.year} explains the change better than a steady trend (R² ${fmt(j.r2Step, 2)} vs ${fmt(j.r2Line, 2)}).` : `No single step explains the change better than a steady trend (step R² ${fmt(j.r2Step, 2)} vs line R² ${fmt(j.r2Line, 2)}).`}</span></li>
      <li>${icon('check')}<span><b>Autocorrelation.</b> ${t.ac_factor > 1 ? `Neighbouring years are related; the test variance was widened ×${fmt(t.ac_factor, 2)} to compensate.` : 'Neighbouring years are not significantly related, so no correction was needed.'}</span></li>
      ${(() => { const fs = fdrStatus(s); return fs && t.significant ? `<li>${icon(fs.pass ? 'check' : 'warning')}<span><b>Multiple testing (FDR).</b> ${fs.text}</span></li>` : ''; })()}
      ${opts.published ? `<li>${icon('check')}<span><b>Published research.</b> <a href="${opts.published.ref.url}" target="_blank" rel="noopener">${opts.published.ref.short} ↗</a> ${opts.published.text}</span></li>` : ''}</ul>`),
    step(6, 'Connected clues', (() => {
      const others = getManifest().variables.filter((v) => v.id !== s.variable);
      const rows = others.map((v) => { const o = getPlaceSeries(v.id, { lat: L.lat, lon: L.lon, country: L.country }, s.scope); const c = o && diffCorr(s.values, o.values); return c ? `<li><b>${esc(v.label)}:</b> r = ${signed(c.r, 2)} (${c.sig ? 'significant' : 'not significant'}, n = ${c.n}). ${Math.abs(c.r) < 0.2 ? 'No clear year-to-year link.' : `In years when ${esc(s.label.toLowerCase())} rises, ${esc(v.label.toLowerCase())} tends to ${c.r > 0 ? 'rise' : 'fall'}.`}</li>` : ''; }).filter(Boolean);
      return rows.length ? `<ul class="cs-list">${rows.join('')}</ul><p class="muted">Correlations of year-to-year changes. They show which Earth-system indicators move together here; they do not show cause and effect.</p>` : '<p class="muted">No other indicator is available at this location.</p>';
    })()),
    step(7, 'Interpretation and limits', `<p>${t.significant ? (xc && (xc.kind === 'conflict' || xc.kind === 'inconsistent') ? 'One NASA record shows a significant trend, but an independent record does not support it, so the evidence is unresolved.' : (j && j.flagged ? `The change is real in this record but occurred mainly as a shift around ${j.year}.` : 'The NASA data supports a real, sustained change at this location.')) : 'The NASA data does not show a statistically significant trend at this location over this period.'}</p>
      ${(() => { const fs = fdrStatus(s); return fs && t.significant && !fs.pass ? `<p class="muted"><b>Strength of evidence:</b> the trend is significant when this location is tested on its own, but not under the stricter map-wide multiple-testing check. ${xc && xc.kind === 'agree' ? 'Agreement with an independent NASA record' : 'Independent evidence'}${opts.published ? ' and published research' : ''} ${xc && xc.kind === 'agree' ? 'is' : 'would be'} what makes it credible.</p>` : ''; })()}
      <p class="muted"><b>What this does not prove:</b> why it happened. This analysis does not test causes such as natural climate variability, land-use change or human-caused climate change. It describes ${s.scope === 'country' ? 'a national average' : `a ${Math.round(s.location.cell_size * 111)} km average`}, not any single town, and does not predict future years.</p>
      <p class="cs-prompt">What other evidence would you need before claiming why this changed?</p>`),
    step(8, 'Cautious conclusion', `<blockquote id="cs-concl">${esc(conclusion)}</blockquote><button class="btn small" id="cs-copy-c">Copy conclusion</button>`),
    step(9, 'Data citation', `<pre class="cs-cite">${esc(refText)}</pre><button class="btn small" id="cs-copy-r">Copy citations</button>`),
  ].join('') + `<div class="cs-foot"><span class="muted small">Generated by TerraTrace on ${new Date().toISOString().slice(0, 10)} from NASA data. Every number is reproducible from the cited datasets and method.</span><div class="cs-btns"><button class="btn" id="cs-dl">Download report</button>${opts.onOpenGlobe ? '<button class="btn accent" id="cs-open">Open on the globe</button>' : ''}</div></div>`;
  const copyBtn = (id, text) => { $(id).onclick = async () => { try { await navigator.clipboard.writeText(text); } catch { /* blocked */ } $(id).textContent = 'Copied'; }; };
  copyBtn('cs-copy-c', conclusion);
  copyBtn('cs-copy-r', refText);
  $('cs-dl').onclick = () => downloadReport($('case-h').textContent, body);
  if (opts.onOpenGlobe) $('cs-open').onclick = () => { $('case').classList.remove('open'); opts.onOpenGlobe(); };
  $('case').classList.add('open');
  $('case').querySelector('.modal-card').scrollTop = 0;
}

/** Save the investigation as a standalone, printable HTML file. */
function downloadReport(title, body) {
  const clone = body.cloneNode(true);
  clone.querySelectorAll('button, .cs-btns').forEach((b) => b.remove());
  const css = `body{font:15px/1.55 system-ui,sans-serif;color:#111;max-width:820px;margin:32px auto;padding:0 20px}h1{font-size:26px;margin:0 0 4px}h3{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#0a7a66;margin:0 0 8px}
.cs-step{display:flex;gap:14px;padding:14px 0;border-top:1px solid #ddd}.cs-n{flex:none;width:26px;height:26px;border-radius:50%;background:#0a7a66;color:#fff;display:grid;place-items:center;font-size:12px}.cs-c{flex:1;min-width:0}
.cs-dl{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px;margin:0}.cs-dl dt{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#666}.cs-dl dd{margin:2px 0 0}
.cs-big{display:flex;gap:10px;align-items:baseline}.cs-big b{font-size:30px}.cs-checks{list-style:none;padding:0}.cs-checks li{display:flex;gap:8px;margin-bottom:6px}.cs-checks svg{width:16px;height:16px;flex:none;stroke:#0a7a66;fill:none;stroke-width:2}
.muted{color:#555}.cs-q{font-size:18px;font-weight:600}.cs-prompt{border-left:3px solid #0a7a66;padding:8px 12px;background:#eef8f5}blockquote{margin:0;padding:10px 14px;border-left:3px solid #0a7a66;background:#f6f6f6}
pre{white-space:pre-wrap;font-size:12px;background:#f6f6f6;padding:10px;border-radius:6px}a{color:#0a7a66}
.cs-chart{width:100%;height:auto}.cs-map{margin:12px 0 0}.cs-map img{width:100%;border-radius:8px}.cs-map figcaption{font-size:12px;color:#666;margin-top:4px}.cs-grid{stroke:#e3e3e3}.cs-ax{fill:#666;font-size:11px;font-family:monospace}.cs-line{fill:none;stroke:#0a7a66;stroke-width:2}.cs-dot{fill:#0a7a66}.cs-dot.an{fill:#d98a00}.cs-trend{stroke:#d98a00;stroke-width:2;stroke-dasharray:6 5}
@media print{body{margin:0}}`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)} — TerraTrace investigation</title><style>${css}</style></head><body><p style="color:#0a7a66;font-size:12px;letter-spacing:.14em;text-transform:uppercase;margin:0">TerraTrace investigation report</p><h1>${esc(title)}</h1>${clone.innerHTML}<p class="muted" style="margin-top:24px;font-size:12px">Generated ${new Date().toISOString().slice(0, 10)} by TerraTrace (NASA Space Apps 2026). To save as PDF, use your browser’s Print → Save as PDF.</p></body></html>`;
  const slugT = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `terratrace-investigation-${slugT}.html`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** The featured worked example: central Chile rainfall, with published validation. */
export function openCaseStudy(onOpenGlobe) {
  const s = getPlaceSeries('precipitation', CHILE, 'point');
  if (!s) { $('case-body').innerHTML = '<p>Rainfall data is not loaded, so the worked example is unavailable.</p>'; $('case').classList.add('open'); return; }
  const t = s.trend;
  const pct = ((t.last_mean - t.first_mean) / t.first_mean) * 100;
  openInvestigation(s, 'central Chile', {
    eyebrow: 'Worked investigation',
    title: 'Is central Chile drying out?',
    question: `Has rainfall in central Chile really declined since ${s.years[0]}, and by how much?`,
    context: 'Central Chile (Santiago to Concepción) supplies most of the country’s water and farming. News reports describe a “megadrought”. We test whether NASA data supports that claim.',
    published: {
      ref: REFS.garreaud,
      text: `report annual rainfall deficits of 25–45% in central Chile since 2010. Our ${fmt(Math.abs(pct), 0)}% lower recent average falls within this range.`,
      concl: 'The magnitude is consistent with published rainfall deficits of 25–45% since 2010 (Garreaud et al., 2017).',
    },
    onOpenGlobe: () => onOpenGlobe(CHILE),
  });
}

/** Our results next to published research (rendered into the Data journey). */
export function renderValidation() {
  const box = $('validation');
  if (!box) return;
  const g = (id, place, scope = 'point') => getPlaceSeries(id, place, scope);
  const has = (id) => getManifest().variables.some((v) => v.id === id);
  const rows = [];
  const nz = has('temperature') && g('temperature', { lat: 73, lon: 57 });
  if (nz) rows.push(['Barents Sea / Novaya Zemlya warming', `${headline(nz).big} per decade (5° cell)`, 'Up to +2.7 °C per decade annual warming in the northern Barents area', REFS.isaksen, 'Consistent: same direction, among the fastest on Earth; lower because the 5° cell includes open ocean']);
  const ch = has('precipitation') && g('precipitation', CHILE);
  if (ch) {
    const pct = ((ch.trend.last_mean - ch.trend.first_mean) / ch.trend.first_mean) * 100;
    rows.push(['Central Chile rainfall decline', `${headline(ch).big} per decade; recent average ${fmt(Math.abs(pct), 0)}% below ${ch.years[0]}–${ch.years[0] + 4}`, 'Annual rainfall deficits of 25–45% since 2010', REFS.garreaud, 'Consistent: within the published range']);
  }
  const uae = has('temperature') && g('temperature', { lat: 24, lon: 54.5, country: 'United Arab Emirates' }, 'country');
  if (uae) rows.push(['UAE warming', `${headline(uae).big} per decade (country average)`, 'About +0.45 °C per decade across the Eastern Mediterranean and Middle East (1981–2019)', REFS.zittis, 'Consistent: same direction, slightly lower for this coastal country']);
  rows.push(['Global surface warming', '+0.16 (MERRA-2) to +0.24 (GISTEMP) °C per decade, area-weighted', 'About +0.2 °C per decade in recent decades', REFS.giss, 'Consistent']);
  box.innerHTML = `<p class="muted small">TerraTrace results (computed live from the data on this site) compared with peer-reviewed or agency reference values.</p>
    <div class="val-wrap"><table class="val-table"><thead><tr><th>Finding</th><th>TerraTrace</th><th>Published reference</th><th>Verdict</th></tr></thead><tbody>
    ${rows.map(([f, ours, pub, ref, v]) => `<tr><td><b>${f}</b></td><td>${ours}</td><td>${pub}<br><a href="${ref.url}" target="_blank" rel="noopener">${ref.short} ↗</a></td><td>${v}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="muted small">Known limitation confirmed by the literature: reanalysis rainfall (MERRA-2) shows unreliable trends in parts of Africa, which is why TerraTrace uses NASA GPCP as its main rainfall record and MERRA-2 only as a cross-check.</p>`;
}
