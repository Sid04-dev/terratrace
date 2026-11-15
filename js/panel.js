// =============================================================
//  panel.js — the side panel: chart, story, stats, exports
// =============================================================
import { styleFor } from './config.js';
import { icon } from './icons.js';
import { ramp } from './util.js';
import { getManifest, getPlaceSeries, worldPercentile, latestRank, trendDisplay } from './data.js';
import { crossCheck, checkInfo } from './crosscheck.js';
import { stepCheck } from './jump.js';
import { renderSci, renderPath, renderRelations, renderAnomalies } from './science.js';
import { scientificFactSheet } from './factsheet.js';
import { unusualYears } from './anomaly.js';
import { openInvestigation } from './casestudy.js';
import { headline, summary, evidenceLabel, researchQuestions } from './story.js';
import { toCSV, chartPNG, citation, methods, copy, factSheet, stripesPNG, areaText } from './exporter.js';
import { fmt, signed, el } from './util.js';
import { formatCoord } from './geo.js';
import { pinColor, miniMap, onPaint } from './globe.js';
import { getCountries } from './geo.js';

let chart = null;
let ctx = null; // { place, variable, pins, year, onVariable, onPin, onUnpin, onClose, onShare }

const $ = (id) => document.getElementById(id);

export function initPanel(handlers) {
  ctx = { ...handlers };
  onPaint(() => { if (document.body.classList.contains('panel-open')) renderMiniMap(); });
  $('panel-close').onclick = () => ctx.onClose();
  $('btn-csv').onclick = () => withSeries((s) => toCSV(s, title()));
  $('btn-png').onclick = () => withSeries((s) => chartPNG($('chart'), s, title()));
  $('btn-sheet').onclick = () => withSeries((s) => scientificFactSheet(s, title(), ctx.scope));
  $('btn-cite').onclick = () => withSeries((s) => copy(citation(s, $('cite-style').value), 'Citation copied'));
  $('btn-methods').onclick = () => withSeries((s) => copy(methods(s, title()), 'Methods paragraph copied'));
  $('btn-stripes').onclick = () => withSeries((s) => stripesPNG(s, title()));
  $('btn-share').onclick = () => ctx.onShare();
  $('btn-pin').onclick = () => ctx.onPin();
  // Investigate · Validate · Clues · Report: jump within the report
  const targets = { investigate: () => $('var-title'), validate: () => $('crosscheck').hidden ? document.querySelector('.path-wrap') : $('crosscheck'), clues: () => $('sec-clues'), report: () => $('sec-report') };
  document.querySelectorAll('[data-jump]').forEach((b) => (b.onclick = () => {
    const p = $('panel'), t = targets[b.dataset.jump]();
    if (!t) return;
    document.body.classList.remove('sheet-min');
    const head = p.querySelector('.panel-head').getBoundingClientRect().height;
    p.scrollTo({ top: Math.max(0, p.scrollTop + t.getBoundingClientRect().top - p.getBoundingClientRect().top - head - 54), behavior: 'smooth' });
  }));
  $('btn-invest').onclick = $('btn-invest2').onclick = () => withSeries((s) => openInvestigation(s, title()));
  $('cite-style').onchange = () => withSeries((s) => { $('cite-preview').textContent = citation(s, $('cite-style').value); });
}

const title = () => (ctx.scope === 'country' && ctx.place.country ? ctx.place.country : ctx.place.name);

function withSeries(fn) {
  const s = getPlaceSeries(ctx.variable, ctx.place, ctx.scope);
  if (s) fn(s);
}

/** Flat locator map of the selected place, coloured like the globe. */
export function renderMiniMap() {
  const fig = $('minimap');
  if (!ctx || !ctx.place) return;
  const isCountry = ctx.scope === 'country' && ctx.place.country;
  const cv = miniMap(ctx.place.lat, ctx.place.lon, { w: 360, h: 170, spanLon: isCountry ? 40 : 50, countries: getCountries(), highlight: isCountry ? ctx.place.country : null });
  if (!cv) { fig.hidden = true; return; }
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', `Flat map around ${title()}, coloured by the current layer`);
  fig.querySelector('.mm-frame').replaceChildren(cv);
  const v = getManifest().variables.find((x) => x.id === ctx.variable);
  fig.querySelector('figcaption').textContent = `${v ? v.label : ''} · ${ctx.year ? `${ctx.year} vs early years` : 'trend 2001–2024'} · ±${isCountry ? 20 : 25}° around the ${isCountry ? 'country' : 'spot'}`;
  fig.hidden = false;
}

export function closePanel() { document.body.classList.remove('panel-open', 'sheet-min'); }

/** Render for a place + variable. state = { place, variable, pins, year } */
export function renderPanel(state) {
  Object.assign(ctx, state);
  const { place, variable } = state;
  document.body.classList.add('panel-open');
  if (ctx._lastPlace !== place) { $('panel').scrollTop = 0; ctx._lastPlace = place; }
  const isCountry = state.scope === 'country' && !!place.country;
  const name = title();
  $('place-name').textContent = name;
  $('place-sub').textContent = isCountry ? 'Whole-country average' : [place.sub, formatCoord(place.lat, place.lon)].filter(Boolean).join(' · ');
  // scope switch: this spot  |  whole country
  const sc = $('scope');
  sc.hidden = !place.country;
  if (place.country) {
    sc.replaceChildren(
      el('button', { class: isCountry ? '' : 'on', onclick: () => ctx.onScope('point') }, 'This spot'),
      el('button', { class: isCountry ? 'on' : '', onclick: () => ctx.onScope('country') }, `All of ${place.country}`));
  }

  renderFingerprint(place, variable);
  requestAnimationFrame(renderMiniMap);
  renderYearFocus();

  const series = getPlaceSeries(variable, place, state.scope);
  const body = $('panel-body');
  if (!series) {
    body.classList.add('empty');
    $('empty-msg').textContent = `No ${styleFor(variable).noun.toLowerCase()} data here — this variable only covers land (or this cell has no valid years). Try another variable or click on land.`;
    if (chart) { chart.destroy(); chart = null; }
    return;
  }
  body.classList.remove('empty');

  const st = styleFor(variable);
  const h = headline(series);
  const ev = evidenceLabel(series.trend.p_value, series.years);
  $('var-title').textContent = series.label;
  const vdef = getManifest().variables.find((x) => x.id === variable) || {};
  $('var-about').textContent = st.about || vdef.description || 'No description yet: add one in pipeline/config.py.';
  $('var-why').textContent = st.why ? `Why it matters: ${st.why}` : '';
  $('stat-big').textContent = h.big;
  $('stat-small').textContent = h.small;
  // 95% confidence interval for the rate of change
  if (series.trend.ci_per_decade) {
    const t = series.trend;
    const [lo, hi] = t.ci_per_decade;
    const dd = Math.max(1, series.decimals);
    const u = (!series.unit || series.unit === '0–1') ? '' : ` ${series.unit}`;
    const rel = trendDisplay(variable) !== 'absolute' && t.rel_per_decade !== null && t.per_decade;
    if (rel) {
      // headline is in %, so give the interval in % too (same scaling as the headline)
      const k = t.rel_per_decade / t.per_decade;
      $('stat-small').textContent = `per decade (${signed(t.per_decade, dd)}${u}) · 95% CI ${signed(lo * k, 1)}% to ${signed(hi * k, 1)}%`;
    } else {
      $('stat-small').textContent = `per decade · 95% CI ${signed(lo, dd)} to ${signed(hi, dd)}${u}`;
    }
  }
  const chip = $('evidence');
  chip.textContent = ev.text;
  chip.className = `chip ev-${ev.level}`;
  renderSci(series);
  renderCrossCheck(series);
  renderJump(series);
  $('summary').textContent = summary(series, name);
  renderPath(series, name);
  renderAnomalies(series);
  renderRelations(place, state.scope, variable, state.year);

  const t = series.trend;
  const d = series.decimals;
  const y = series.years;
  const pct = worldPercentile(variable, t);
  const rk = latestRank(series);
  const ord = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
  $('mini-stats').replaceChildren(
    stat(`${y[0]}–${y[Math.min(4, y.length - 1)]} avg`, `${fmt(t.first_mean, d)} ${series.unit}`),
    stat(`${y[Math.max(0, y.length - 5)]}–${y.at(-1)} avg`, `${fmt(t.last_mean, d)} ${series.unit}`),
    stat('Compared with the world', pct === null ? '—' : t.per_decade > 0
      ? `Rising faster than ${Math.min(99, Math.round(pct))}% of places`
      : `Falling faster than ${Math.min(99, Math.round(100 - pct))}% of places`),
    stat(`${rk ? rk.year : 'Latest year'} in this record`, !rk ? '—' : rk.rank === 1 ? `Record high (of ${rk.of} years)` : `${ord(rk.rank)} highest of ${rk.of} years`),
    stat('Highest year', t.max ? `${t.max.year}` : '—'),
    stat('Data coverage', `${fmt(t.completeness * 100, 0)}% of years`),
  );
  renderStripes(series);

  $('questions').replaceChildren(...researchQuestions(series, name).map((q) => el('li', {}, q)));
  $('cite-preview').textContent = citation(series, $('cite-style').value);
  $('cell-note').textContent = `Values are the ${areaText(series)} (one cell ≈ ${Math.round(series.location.cell_size * 111)} km across), not a single weather station. Source: ${series.source.name}${series.source.dataset ? ' · ' + series.source.dataset : ''}.${series.variable === 'precipitation' && /POWER|MERRA/i.test(series.source.name + series.source.dataset) ? ' Rainfall note: in some regions this record jumps suddenly between years because the rain-gauge data behind it changed. If the chart shows one big step, the trend is probably not real.' : ''}`;

  // compare chips
  $('pins').replaceChildren(...state.pins.map((p, i) =>
    el('span', { class: 'pin-chip', style: `--c:${pinColor(i)}` }, p.short || p.name,
      el('button', { 'aria-label': `Remove ${p.name}`, onclick: () => ctx.onUnpin(i) }, '×'))));
  $('btn-pin').disabled = state.pins.length >= 4 || state.pins.some((p) => p.lat === place.lat && p.lon === place.lon && (p.scope || 'point') === (state.scope || 'point'));

  drawChart(series, state);
}

function renderStripes(series) {
  const st = styleFor(series.variable);
  const valid = series.values.filter((v) => v !== null);
  const avg = valid.reduce((a, b) => a + b, 0) / (valid.length || 1);
  const m = Math.max(...valid.map((v) => Math.abs(v - avg))) || 1;
  $('stripes').replaceChildren(...series.values.map((v, i) => el('span', {
    style: `background:${v === null ? '#333a55' : ramp(st.trendColors, 0.5 + (v - avg) / (2 * m))}`,
    title: `${series.years[i]}: ${v === null ? 'no data' : fmt(v, series.decimals) + ' ' + series.unit}`,
  })));
  $('stripes-y0').textContent = series.years[0];
  $('stripes-y1').textContent = series.years.at(-1);
}

function stat(label, value) {
  return el('div', { class: 'mini' }, el('span', {}, label), el('b', {}, value));
}

/** "Fake trend" detector: warn when the change is one sudden jump, not a steady trend. */
function renderJump(series) {
  const box = $('jumpcheck');
  const t = series.trend;
  const j = t.significant ? stepCheck(series.years, series.values) : null;
  if (!j || !j.flagged) { box.hidden = true; return; }
  const d = series.decimals;
  const u = (!series.unit || series.unit === '0–1') ? '' : ` ${series.unit}`;
  box.hidden = false;
  box.className = 'reveal xc xc-jump';
  box.innerHTML = `${icon('warning')}<div class="xc-body">
    <span class="xc-top"><b class="xc-badge">Step-Change Note</b><abbr class="term xc-term" data-term="step" tabindex="0">what is this?</abbr></span>
    <span class="xc-v">This series is better described by a single shift around ${j.year} (mean ${fmt(j.before, d)}${u} before; ${fmt(j.after, d)}${u} after) than by gradual change. The shift may reflect a genuine environmental event or a change in the underlying data inputs, so the per-decade rate above should be interpreted as an average across this discontinuity.</span>
    <details class="xc-d"><summary>Method</summary>
      <span>A single-step model is compared with a linear model. The step model explains <b>${Math.round(j.r2Step * 100)}%</b> of the interannual variance, against <b>${Math.round(j.r2Line * 100)}%</b> for the linear model. A note is issued when the step model improves R² by more than 0.20 and reaches R² ≥ 0.60; this applies to approximately 1–7% of significant trends globally.</span>
    </details></div>`;
}

function renderCrossCheck(series) {
  const box = $('crosscheck');
  const r = crossCheck(series);
  if (!r) { box.hidden = true; return; }
  const ic = { agree: 'check', partial: 'info', conflict: 'warning', inconsistent: 'warning', unconfirmed: 'info', neutral: 'info' }[r.kind];
  const t = r.s2.trend;
  box.hidden = false;
  box.className = `reveal xc xc-${r.kind}`;
  if (r.kind === 'conflict') {
    // a significant result in one record only is not 'very strong evidence' overall
    const chip = $('evidence');
    chip.textContent = 'Significant in this record only';
    chip.className = 'chip ev-disputed';
  }
  box.innerHTML = `${icon(ic)}<div class="xc-body">
    <span class="xc-top"><b class="xc-badge">${r.badge}</b><abbr class="term xc-term" data-term="xval" tabindex="0">what is this?</abbr></span>
    <span class="xc-v">${r.advice}</span>
    <details class="xc-d"><summary>Method</summary>
      <span>The identical procedure (autocorrelation-corrected Mann–Kendall test and Sen’s slope) was applied to a second, independent NASA dataset, <b>${checkInfo(r.chk).full}</b>, derived from ${r.basis}.
      At this location it yields <b>${headline(r.s2).big}</b> per decade (p ${t.p_value < 0.001 ? '&lt; 0.001' : '= ' + fmt(t.p_value, 3)}).</span>
    </details></div>`;
}

const FP_NAME = { temperature: 'Temperature', precipitation: 'Rainfall', soil_moisture: 'Soil moisture', ndvi: 'Vegetation' };

/** One mini card per variable: the place's "climate fingerprint". */
function renderFingerprint(place, active) {
  const cards = getManifest().variables.map((v) => {
    const s = getPlaceSeries(v.id, place, ctx.scope);
    const st = styleFor(v.id);
    let arrow = '·', cls = 'flat', val = 'no data';
    if (s && s.trend.per_decade !== null) {
      const t = s.trend;
      arrow = !t.significant ? '→' : t.direction === 'rising' ? '↑' : '↓';
      cls = !t.significant ? 'flat' : t.direction;
      if (st.goodWhen) cls += t.direction === st.goodWhen ? ' good' : t.significant ? ' bad' : '';
      val = headline(s).big;
    }
    const b = el('button', {
      class: `fp ${v.id === active ? 'active' : ''} ${cls}`,
      title: v.label,
      onclick: () => ctx.onVariable(v.id),
    }, el('span', { class: 'fp-top' }, el('span', { class: 'fp-ic' }), el('span', { class: 'fp-name' }, FP_NAME[v.id] || v.label.split(' (')[0])), el('span', { class: 'fp-val' }, val), el('span', { class: 'fp-ar' }, arrow));
    b.querySelector('.fp-ic').innerHTML = icon(v.id);
    return b;
  });
  $('fingerprint').replaceChildren(...cards);
}

const yearLine = {
  id: 'yearLine',
  afterDatasetsDraw(c, _a, opts) {
    if (opts.year == null) return;
    const x = c.scales.x.getPixelForValue(String(opts.year));
    if (!Number.isFinite(x)) return;
    const { top, bottom } = c.chartArea;
    const g = c.ctx;
    g.save(); g.strokeStyle = 'rgba(255,181,71,.9)'; g.setLineDash([4, 4]);
    g.beginPath(); g.moveTo(x, top); g.lineTo(x, bottom); g.stroke(); g.restore();
  },
};

function drawChart(series, state) {
  const labels = series.years.map(String);
  const anomalous = new Set(unusualYears(series).map((o) => series.years.indexOf(o.year)));
  const t = series.trend;
  const datasets = [{
    label: title(),
    data: series.values,
    borderColor: '#00e0b8',
    backgroundColor: 'rgba(0,224,184,.12)',
    fill: true,
    tension: 0.25,
    pointRadius: (c) => (anomalous.has(c.dataIndex) ? 5.5 : 2.5),
    pointBackgroundColor: (c) => (anomalous.has(c.dataIndex) ? '#ffb547' : '#00e0b8'),
    pointBorderColor: (c) => (anomalous.has(c.dataIndex) ? '#ffb547' : '#00e0b8'),
    spanGaps: false,
    order: 1,
  }];
  if (t.per_decade !== null) {
    // Sen's-slope trend line (the same estimate as the headline), through the median point
    const xs = [], ys = [];
    series.years.forEach((yr, i) => { if (series.values[i] !== null) { xs.push(yr); ys.push(series.values[i]); } });
    const b = t.per_decade / 10;
    const med = (a) => { const q = [...a].sort((m, n) => m - n), k = Math.floor(q.length / 2); return q.length % 2 ? q[k] : (q[k - 1] + q[k]) / 2; };
    const a = med(ys.map((v, i) => v - b * xs[i]));
    const xm = med(xs), ym = a + b * xm;
    datasets.push({
      label: 'Trend (Sen’s slope)',
      data: series.years.map((yr) => a + b * yr),
      borderColor: t.significant ? '#ffb547' : 'rgba(255,255,255,.35)',
      borderDash: [6, 5], borderWidth: 2, pointRadius: 0, fill: false, order: 0,
    });
    // 95% confidence band: every trend line whose slope lies inside the CI, pivoting on the median point
    if (t.ci_per_decade) {
      const [lo, hi] = t.ci_per_decade.map((v) => v / 10);
      const edge = (yr, which) => { const p = ym + lo * (yr - xm), q = ym + hi * (yr - xm); return which === 'up' ? Math.max(p, q) : Math.min(p, q); };
      const band = t.significant ? 'rgba(255,181,71,0.16)' : 'rgba(255,255,255,0.08)';
      datasets.push({ label: '95% CI (lower)', data: series.years.map((yr) => edge(yr, 'lo')), borderColor: 'transparent', pointRadius: 0, fill: false, order: 3, ciBand: true });
      datasets.push({ label: '95% CI of trend', data: series.years.map((yr) => edge(yr, 'up')), borderColor: 'transparent', backgroundColor: band, pointRadius: 0, fill: '-1', order: 3, ciBand: true });
    }
  }
  state.pins.forEach((p, i) => {
    if (p.lat === state.place.lat && p.lon === state.place.lon && (p.scope || 'point') === (state.scope || 'point')) return;
    const s = getPlaceSeries(series.variable, p, p.scope);
    if (!s) return;
    datasets.push({ label: p.short || p.name, data: s.values, borderColor: pinColor(i), pointRadius: 0, borderWidth: 2, fill: false, tension: 0.25, order: 2 });
  });

  const options = {
    responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: datasets.filter((d) => !d.ciBand).length > 2, labels: { color: '#cfd8ff', boxWidth: 12, filter: (it, data) => !data.datasets[it.datasetIndex].ciBand } },
      tooltip: { filter: (c) => !c.dataset.ciBand, callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y === null ? 'no data' : fmt(c.parsed.y, series.decimals)} ${series.unit}` } },
      yearLine: { year: state.year },
    },
    scales: {
      x: { ticks: { color: '#8b97c7', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,.05)' } },
      y: { ticks: { color: '#8b97c7' }, grid: { color: 'rgba(255,255,255,.07)' }, title: { display: true, text: series.unit_note || series.unit, color: '#8b97c7' } },
    },
  };
  window.Chart.defaults.font.family = "'JetBrains Mono', ui-monospace, monospace";
  window.Chart.defaults.font.size = 10.5;
  if (chart) chart.destroy();
  chart = new window.Chart($('chart'), { type: 'line', data: { labels, datasets }, options, plugins: [yearLine] });
}

export function updateYearMarker(year) {
  if (ctx) ctx.year = year;
  renderYearFocus();
  if (document.body.classList.contains('panel-open')) { renderMiniMap(); if (ctx.place) renderRelations(ctx.place, ctx.scope, ctx.variable, year); }
  if (!chart) return;
  chart.options.plugins.yearLine.year = year;
  chart.update('none');
}

/** Timeline mode: a live card for the selected year at this place. */
function renderYearFocus() {
  const box = $('yearfocus');
  if (!box) return;
  const year = ctx && ctx.year;
  const s = year && ctx.place ? getPlaceSeries(ctx.variable, ctx.place, ctx.scope) : null;
  if (!s) { box.hidden = true; return; }
  const i = s.years.indexOf(year);
  const v = i >= 0 ? s.values[i] : null;
  const u = (!s.unit || s.unit === '0–1') ? '' : ` ${s.unit}`;
  const d = Math.max(0, s.decimals);
  if (v === null) {
    box.innerHTML = `<b class="yf-year">${year}</b><span class="yf-val">no data</span>`;
  } else {
    const base = s.trend.first_mean;
    const diff = v - base;
    const valid = s.values.map((x, k) => ({ x, y: s.years[k] })).filter((o) => o.x !== null).sort((a, b) => b.x - a.x);
    const rank = valid.findIndex((o) => o.y === year) + 1;
    const ord = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
    const an = unusualYears(s).find((o) => o.year === year);
    const hiWord = s.variable === 'temperature' ? 'warmest' : s.variable === 'precipitation' ? 'wettest' : 'highest';
    const loWord = s.variable === 'temperature' ? 'coolest' : s.variable === 'precipitation' ? 'driest' : 'lowest';
    const rankTxt = rank <= valid.length / 2 ? `${ord(rank)} ${hiWord} of ${valid.length}` : `${ord(valid.length - rank + 1)} ${loWord} of ${valid.length}`;
    box.innerHTML = `<b class="yf-year">${year}</b>
      <span class="yf-val">${fmt(v, d)}${u}</span>
      <span class="yf-diff ${diff >= 0 ? 'up' : 'down'}">${signed(diff, d)}${u} vs ${s.years[0]}–${s.years[Math.min(4, s.years.length - 1)]} average</span>
      <span class="yf-rank">${rankTxt}${an ? ` · <em>unusual year (${an.z > 0 ? '+' : '−'}${fmt(Math.abs(an.z), 1)} SD)</em>` : ''}</span>`;
  }
  box.hidden = false;
  box.classList.remove('yf-flash'); void box.offsetWidth; box.classList.add('yf-flash');
}

export { signed };
