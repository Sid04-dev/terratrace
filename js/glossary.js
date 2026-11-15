// =============================================================
//  glossary.js — plain-language tooltips for scientific terms.
//  Any element with data-term="key" shows a short explanation on
//  hover, keyboard focus or tap. Scientific names are kept.
// =============================================================
export const TERMS = {
  sen: ['Sen’s slope', 'The typical change per decade: the median of the slopes between every pair of years. One unusual year cannot pull it off course.'],
  ci: ['95% confidence interval', 'The range in which the true rate of change most plausibly lies. If the range includes zero, even the direction of change is uncertain.'],
  p: ['p-value', 'How likely a trend at least this consistent would be if nothing were really changing. Below 0.05 is called statistically significant.'],
  mk: ['Mann–Kendall test', 'Compares every pair of years and counts how often the later year is higher. It tests whether there is a consistent trend without assuming a bell curve.'],
  hr: ['Hamed–Rao correction', 'Adjusts the Mann–Kendall test when one year’s value depends on the year before (autocorrelation), so related years cannot make a trend look stronger than it is.'],
  fdr: ['False discovery rate (FDR)', 'Testing thousands of places at once produces some “significant” results by chance. The Benjamini–Hochberg FDR correction sets a stricter threshold for map-wide claims.'],
  xval: ['Cross-dataset validation', 'The same test is run on a second, independent NASA record. Agreement increases confidence; disagreement means the result should be treated with caution.'],
  anomaly: ['Unusual year (anomaly)', 'A year more than 2 standard deviations from what the long-term trend predicts. It is a single event, not a trend.'],
  step: ['Step change', 'When most of the change happens in one jump rather than gradually. It can be a real event or a change in how the data were produced.'],
  r: ['Correlation (r)', 'From −1 to +1: how closely two indicators rise and fall together from year to year. It does not show that one causes the other.'],
};

let tip = null, current = null;

function show(el) {
  const def = TERMS[el.dataset.term];
  if (!def) return;
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'term-tip';
    tip.setAttribute('role', 'tooltip');
    document.body.append(tip);
  }
  tip.innerHTML = `<b>${def[0]}</b><span>${def[1]}</span>`;
  tip.hidden = false;
  current = el;
  const r = el.getBoundingClientRect(), w = Math.min(280, window.innerWidth - 24);
  tip.style.width = `${w}px`;
  let left = Math.min(window.innerWidth - w - 12, Math.max(12, r.left + r.width / 2 - w / 2));
  tip.style.left = `${left}px`;
  const below = r.bottom + 8, h = tip.offsetHeight;
  tip.style.top = `${below + h > window.innerHeight - 8 ? r.top - h - 8 : below}px`;
}
function hide() { if (tip) tip.hidden = true; current = null; }

export function initGlossary() {
  document.addEventListener('mouseover', (e) => { const t = e.target.closest('[data-term]'); if (t) show(t); else if (current) hide(); });
  document.addEventListener('focusin', (e) => { const t = e.target.closest('[data-term]'); if (t) show(t); });
  document.addEventListener('focusout', hide);
  document.addEventListener('click', (e) => { const t = e.target.closest('[data-term]'); if (t) { e.preventDefault(); if (current === t) hide(); else show(t); } else hide(); });
  document.addEventListener('scroll', hide, true);
}

/** Inline term with a dotted underline. */
export const term = (key, label) => `<abbr class="term" data-term="${key}" tabindex="0">${label}</abbr>`;
