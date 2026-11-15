// =============================================================
//  journey.js — "Data journey": how NASA data becomes a tested
//  trend on the globe. Every number is counted from the data that
//  is actually loaded, except the cleaning notes from the pipeline
//  log (CONFIG.pipelineNotes).
// =============================================================
import { CONFIG } from './config.js';
import { getManifest, getGrid, trendForCell, isDemo, getCheck, fdrInfo } from './data.js';
import { checkInfo } from './crosscheck.js';
import { fmt } from './util.js';

const n = (x) => fmt(x, 0);

function stats(v) {
  const g = getGrid(v.id);
  const years = g.years.length;
  let blank = 0, tested = 0, up = 0, down = 0;
  for (const c of g.cells) {
    blank += c.values.filter((x) => x === null).length;
    const t = trendForCell(v.id, c);
    if (t.per_decade === null) continue;
    tested++;
    if (t.significant) t.per_decade > 0 ? up++ : down++;
  }
  const req = CONFIG.pipelineStats?.requested?.[v.id] ?? g.cells.length;
  return { v, req, cells: g.cells.length, years, y0: g.years[0], y1: g.years.at(-1), step: g.step, monthly: req * years * 12, annual: g.cells.length * years, blank, tested, up, down };
}

function fdrLine() {
  return getManifest().variables.map((v) => { const f = fdrInfo(v.id); return f ? `${v.label.toLowerCase()} ${n(f.fdr)} of ${n(f.raw)} remain significant` : ''; }).filter(Boolean).join('; ');
}

export function renderJourney(box) {
  const vars = getManifest().variables;
  const S = vars.map(stats);
  const sum = (k) => S.reduce((a, s) => a + s[k], 0);
  const sources = [...new Set(vars.map((v) => `${v.source.name}${v.source.dataset ? ' · ' + v.source.dataset.replace(/\s*\(.*\)$/, '') : ''}`))];
  const s0 = S[0];
  const notes = Object.entries(CONFIG.pipelineNotes || {})
    .filter(([id]) => vars.some((v) => v.id === id))
    .map(([id, t]) => `<li><b>${vars.find((v) => v.id === id).label}:</b> ${t}</li>`).join('');

  const steps = [
    { k: 'Request', big: n(sum('req')), unit: 'grid-cell requests',
      p: `A global ${s0.step}° grid (${n(360 / s0.step * 180 / s0.step)} cells) sent to the NASA POWER API, one request per cell for each variable${(CONFIG.pipelineStats?.extra || []).length ? ', plus ' + CONFIG.pipelineStats.extra.join(' and ') : ''}.` },
    { k: 'Download', big: n(sum('monthly')), unit: 'monthly values',
      p: `Monthly data, ${s0.y0}–${s0.y1}. Every response is cached, so a re-run never downloads the same cell twice.` },
    { k: 'Clean', big: n((CONFIG.pipelineStats?.removedValues ?? 0) + sum('blank')), unit: 'bad values removed',
      p: `NASA fill values (−999) become “missing”, physically impossible values are removed, and any year with fewer than 9 valid months is left blank rather than guessed.`, extra: notes ? `<ul class="jr-notes">${notes}</ul>` : '' },
    { k: 'Annualise', big: n(sum('annual')), unit: 'annual values',
      p: 'Monthly values become annual means (or totals for rainfall). This removes the seasonal cycle, so summer and winter can’t fake a trend.' },
    { k: 'Test', big: n(sum('tested')), unit: 'trend tests',
      p: `Every cell gets a Mann–Kendall test (α = ${CONFIG.alpha}), Sen’s slope and a 95% confidence interval. The test is corrected for autocorrelation (Hamed–Rao 1998), so a run of similar years can’t make a trend look stronger than it is. ${n(sum('up') + sum('down'))} show a statistically significant change. Because testing thousands of places produces some false positives by chance, each variable is also checked with the Benjamini–Hochberg false-discovery-rate correction: ${fdrLine()}.` },
    { k: 'Validate', big: '100%', unit: 'files pass the data contract',
      p: 'Every file is checked against the data contract when the page loads, and the Python pipeline and this browser use identical statistics. Country values are area-weighted averages of the cells inside each border.' },
  ];

  // 07 — second, independent NASA datasets check the trends
  const checked = [];
  for (const v of vars) {
    const chk = getCheck(v.id);
    if (!chk || !getGrid(chk.id)) continue;
    const other = new Map(getGrid(chk.id).cells.map((c) => [`${c.lat},${c.lon}`, c]));
    let cnt = 0, same = 0, both = 0;
    for (const c of getGrid(v.id).cells) {
      const a = trendForCell(v.id, c);
      const o = other.get(`${c.lat},${c.lon}`);
      if (!a.significant || !o) continue;
      const b = trendForCell(chk.id, o);
      if (b.per_decade === null) continue;
      cnt++;
      if (Math.sign(a.per_decade) === Math.sign(b.per_decade)) { same++; if (b.significant) both++; }
    }
    if (cnt) checked.push({ v, chk, cnt, same: (same / cnt) * 100, both: (both / cnt) * 100 });
  }
  if (checked.length) {
    const all = checked.reduce((a, c) => a + c.cnt, 0);
    const avg = checked.reduce((a, c) => a + c.same * c.cnt, 0) / all;
    const lines = checked.map((c) => `${c.v.label.toLowerCase()} against ${checkInfo(c.chk).full} (built from ${checkInfo(c.chk).basis}): ${fmt(c.same, 0)}% point the same way, ${fmt(c.both, 0)}% are significant in both`).join('; ');
    steps.push({ k: 'Cross-check', big: `${fmt(avg, 0)}%`, unit: 'confirmed by a 2nd NASA dataset',
      p: `Every significant trend (${n(all)} cells) was re-tested on an independent NASA dataset. ${lines[0].toUpperCase() + lines.slice(1)}. Each report shows whether its trend is independently verified, and places where the datasets disagree are kept out of the rankings.` });
  }

  box.innerHTML = `
    <ol class="journey">
      ${steps.map((s, i) => `
        <li>
          <span class="jr-n">${String(i + 1).padStart(2, '0')}</span>
          <div class="jr-body">
            <div class="jr-head"><b>${s.k}</b><span class="jr-big">${s.big}</span><span class="jr-unit">${s.unit}</span></div>
            <p>${s.p}</p>${s.extra || ''}
          </div>
        </li>`).join('')}
    </ol>
    <table class="jr-table">
      <thead><tr><th>Variable</th><th>Cells</th><th>Years</th><th>Significant ▲</th><th>Significant ▼</th><th>Not significant</th></tr></thead>
      <tbody>${S.map((s) => `<tr><td>${s.v.label}</td><td>${n(s.cells)}</td><td>${s.y0}–${s.y1}</td><td class="up">${n(s.up)}</td><td class="down">${n(s.down)}</td><td>${n(s.tested - s.up - s.down)}</td></tr>`).join('')}</tbody>
    </table>
    ${isDemo() ? '<p class="jr-demo">These numbers describe the DEMO dataset.</p>' : ''}`;
}
