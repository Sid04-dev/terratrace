// =============================================================
//  exporter.js — "citation-ready" outputs for students
//    • CSV of the series   • PNG of the chart
//    • APA / Harvard / BibTeX citation of the NASA dataset
//    • a methods paragraph   • a printable one-page fact sheet
// =============================================================
import { stepCheck } from './jump.js';
import { CONFIG, styleFor } from './config.js';
import { download, slug, fmt, toast, ramp } from './util.js';
import { formatCoord } from './geo.js';
import { summary, evidenceLabel, headline } from './story.js';
import { crossCheck } from './crosscheck.js';

const today = () => new Date();
const accessed = () => today().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** Describes the area a series covers: one grid cell, or a whole country. */
export function areaText(series) {
  const L = series.location;
  if (series.scope === 'country') {
    return L.approx
      ? `nearest ${L.cell_size}° grid cell to the centre of ${L.country} (the country is smaller than one cell)`
      : `area-weighted mean of ${L.n_cells} ${L.cell_size}° grid cell${L.n_cells > 1 ? 's' : ''} within ${L.country}`;
  }
  return `${L.cell_size}° grid cell centred on ${formatCoord(L.cell_lat, L.cell_lon)}`;
}

export function toCSV(series, place) {
  const rows = [
    `# TerraTrace export — ${place}`,
    `# Location: ${formatCoord(series.location.lat, series.location.lon)} (${areaText(series)})`,
    `# Variable: ${series.label} (${series.unit_note || series.unit}), ${series.aggregation}`,
    `# Source: ${series.source.name} — ${series.source.dataset || ''} ${series.source.url || ''}`,
    series.is_demo ? '# WARNING: DEMO DATA — synthetic values, not for real use' : null,
    `# Trend (Sen's slope): ${fmt(series.trend.per_decade, 4)} ${series.unit_note || series.unit} per decade, Mann-Kendall p=${fmt(series.trend.p_value, 4)} (Hamed-Rao autocorrelation-corrected)`,
    'year,value',
    ...series.years.map((y, i) => `${y},${series.values[i] ?? ''}`),
  ].filter((r) => r !== null);
  download(`terratrace_${slug(place)}_${series.variable}.csv`, rows.join('\n'), 'text/csv');
}

export function chartPNG(canvas, series, place) {
  // add a white background + caption so the image is report-ready
  const pad = 56;
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height + pad;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(canvas, 0, 0);
  ctx.fillStyle = '#cfd8ff';
  ctx.font = `${Math.round(c.width / 48)}px system-ui, sans-serif`;
  ctx.fillText(`${series.label} — ${place}. Source: ${series.source.name}${series.is_demo ? ' (DEMO DATA)' : ''}. Made with TerraTrace.`, 16, canvas.height + pad * 0.62);
  c.toBlob((b) => download(`terratrace_${slug(place)}_${series.variable}.png`, b), 'image/png');
}

/** Citation of the underlying NASA dataset (what students should actually cite). */
export function citation(series, style = 'apa') {
  const s = series.source;
  if (series.is_demo) return 'DEMO DATA — not citable. Switch to real data before citing.';
  if (s.citation && style === 'apa') return s.citation; // data team can paste the official citation
  const year = s.year || today().getFullYear();
  const org = s.publisher || 'NASA';
  const title = `${s.name}${s.dataset ? ': ' + s.dataset : ''}${s.version ? ' (Version ' + s.version + ')' : ''}`;
  const link = s.doi ? `https://doi.org/${s.doi.replace(/^https?:\/\/doi.org\//, '')}` : s.url || '';
  if (style === 'harvard') return `${org} (${year}) ${title} [Data set]. Available at: ${link} (Accessed: ${accessed()}).`;
  if (style === 'bibtex') {
    return `@misc{${slug(s.name).replace(/-/g, '')}${year},\n  author = {{${org}}},\n  title = {${title}},\n  year = {${year}},\n  howpublished = {\\url{${link}}},\n  note = {Data set. Accessed ${accessed()} via TerraTrace}\n}`;
  }
  return `${org}. (${year}). ${title} [Data set]. ${link}`;
}

export function methods(series, place) {
  const t = series.trend;
  const y0 = series.years[0], y1 = series.years[series.years.length - 1];
  const agg = (series.aggregation || 'annual mean').toLowerCase();
  return `${cap(agg)} values of ${series.label.toLowerCase()} (${series.unit_note || series.unit}) for ${place} ` +
    `(${areaText(series)}) ` +
    `were obtained from ${series.source.name}${series.source.dataset ? ' (' + series.source.dataset + ')' : ''} for ${y0}–${y1}. ` +
    `${t.n} of ${series.years.length} years contained valid data. Trend significance was assessed with the non-parametric ` +
    `Mann–Kendall test (α = ${CONFIG.alpha}) with the Hamed–Rao (1998) correction for autocorrelation between years, and trend magnitude was estimated with Sen's slope ` +
    `(${fmt(t.per_decade, 3)} ${series.unit} per decade${t.ci_per_decade ? `, 95% confidence interval ${fmt(t.ci_per_decade[0], 3)} to ${fmt(t.ci_per_decade[1], 3)}` : ''}; ` +
    `p ${t.p_value < 0.001 ? '< 0.001' : '= ' + fmt(t.p_value, 3)}). Annual ${agg.replace(/^annual\s+/, '')}s were used, which removes the seasonal cycle before testing.` +
    crossCheckSentence(series) + jumpSentence(series);
}

function jumpSentence(series) {
  if (!series.trend.significant) return '';
  const j = stepCheck(series.years, series.values);
  if (!j || !j.flagged) return ' A step-change check (single step versus straight line) found no sudden jump: the change is gradual.';
  return ` A step-change check found that most of the change occurred as a sudden shift around ${j.year} (step model R² = ${fmt(j.r2Step, 2)} versus linear R² = ${fmt(j.r2Line, 2)}), so it is better described as a shift than as a steady trend.`;
}

function crossCheckSentence(series) {
  const xc = crossCheck(series);
  if (!xc) return '';
  const b = xc.s2.trend;
  const same = Math.sign(b.per_decade) === Math.sign(series.trend.per_decade);
  return ` As an independent check, the same analysis of ${xc.chk.source.name} ${xc.chk.source.dataset}, built from ${xc.basis}, gives ${fmt(b.per_decade, 3)} ${xc.s2.unit} per decade (p ${b.p_value < 0.001 ? '< 0.001' : '= ' + fmt(b.p_value, 3)}), ${same ? 'the same direction' : 'the opposite direction'}${b.significant ? '' : ', not statistically significant'}.`;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export async function copy(text, what = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(`${what} to clipboard`); }
  catch { prompt('Copy this:', text); }
}

/** Printable one-page fact sheet (browser "Save as PDF"). */
export function factSheet(series, place, chartCanvas) {
  const h = headline(series);
  const ev = evidenceLabel(series.trend.p_value, series.years);
  const bg = document.createElement('canvas');
  bg.width = chartCanvas.width; bg.height = chartCanvas.height;
  const g = bg.getContext('2d');
  g.fillStyle = '#0b1020'; g.fillRect(0, 0, bg.width, bg.height); g.drawImage(chartCanvas, 0, 0);
  const img = bg.toDataURL('image/png');
  const box = document.getElementById('print-sheet');
  box.innerHTML = `
    <header><div class="ps-logo">◉ ${CONFIG.appName}</div><div>${accessed()}</div></header>
    ${series.is_demo ? '<div class="ps-warn">DEMO DATA — synthetic values for testing only</div>' : ''}
    <h1>${series.label}: ${place}</h1>
    <p class="ps-coord">${series.scope === 'country' ? 'Country average' : formatCoord(series.location.lat, series.location.lon)} · ${series.years[0]}–${series.years.at(-1)}</p>
    <div class="ps-stats">
      <div><b>${h.big}</b><span>${h.small}</span></div>
      <div><b>${ev.text}</b><span>Mann–Kendall p = ${fmt(series.trend.p_value, 3)}</span></div>
      <div><b>${fmt(series.trend.completeness * 100, 0)}%</b><span>years with valid data</span></div>
    </div>
    <img src="${img}" alt="chart">
    <h2>Summary</h2><p>${summary(series, place)}</p>
    <h2>Method</h2><p>${methods(series, place)}</p>
    <h2>Cite the data</h2><p class="ps-cite">${citation(series, 'apa')}</p>
    <footer>Generated with ${CONFIG.appName} — built for the NASA Space Apps Challenge 2026. Always check figures against the original dataset.</footer>`;
  document.body.classList.add('printing');
  setTimeout(() => { window.print(); document.body.classList.remove('printing'); }, 150);
}

/** Climate stripes image (after Ed Hawkins' #ShowYourStripes), ready for slides or social media. */
export function stripesPNG(series, place) {
  const W = 1600, H = 900, top = 0, barH = 760;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#0b1020'; g.fillRect(0, 0, W, H);
  const st = styleFor(series.variable);
  const valid = series.values.filter((v) => v !== null);
  const avg = valid.reduce((a, b) => a + b, 0) / (valid.length || 1);
  const m = Math.max(...valid.map((v) => Math.abs(v - avg))) || 1;
  const w = W / series.values.length;
  series.values.forEach((v, i) => {
    g.fillStyle = v === null ? '#333a55' : ramp(st.trendColors, 0.5 + (v - avg) / (2 * m));
    g.fillRect(Math.floor(i * w), top, Math.ceil(w) + 1, barH);
  });
  g.fillStyle = '#e8edff';
  g.font = 'bold 40px system-ui, sans-serif';
  g.fillText(`${place} · ${series.label} · ${series.years[0]}–${series.years.at(-1)}`, 32, barH + 62);
  g.font = '24px system-ui, sans-serif';
  g.fillStyle = '#8b97c7';
  g.fillText(`Data: ${series.source.name}${series.is_demo ? ' (DEMO DATA)' : ''} · Stripes concept: Ed Hawkins (#ShowYourStripes) · Made with ${CONFIG.appName}`, 32, barH + 106);
  c.toBlob((b) => download(`terratrace_stripes_${slug(place)}_${series.variable}.png`, b), 'image/png');
}
