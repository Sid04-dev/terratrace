// =============================================================
//  crosscheck.js — "independently verified": the same trend measured
//  by a second NASA dataset (GISTEMP for temperature, GPCP for
//  rainfall). Loaded only if the pipeline/crosscheck_*.py scripts ran.
//
//  Students always use ONE number (the big one). The second dataset
//  only says whether that number can be trusted.
// =============================================================
import { getCheck, getPlaceSeries } from './data.js';
import { headline } from './story.js';

const fmtP = (p) => (p < 0.01 ? p.toFixed(3) : p.toFixed(2));

const BASIS = { temperature: 'weather stations and ocean measurements', precipitation: 'satellites and rain gauges' };
const SHORT = { temperature: 'NASA GISTEMP', precipitation: 'NASA GPCP' };

/** Display name + what the check dataset is built from. */
export function checkInfo(chk) {
  return {
    name: chk.short || SHORT[chk.of] || chk.source.name,
    full: `${chk.source.name} ${chk.source.dataset.replace(/\s*\(.*\)$/, '')}`,
    basis: chk.basis || BASIS[chk.of] || 'independent measurements',
  };
}

/** Returns { kind, badge, advice, s2, chk, basis } or null when no cross-check is available. */
export function crossCheck(series) {
  const chk = getCheck(series.variable);
  if (!chk) return null;
  const L = series.location;
  const place = { lat: L.lat, lon: L.lon, country: L.country };
  const s2 = getPlaceSeries(chk.id, place, series.scope === 'country' ? 'country' : 'point');
  if (!s2 || s2.trend.per_decade === null || series.trend.per_decade === null) return null;
  const a = series.trend, b = s2.trend;
  const same = Math.sign(a.per_decade) === Math.sign(b.per_decade);
  const { full, basis } = checkInfo(chk);
  const dir = (t) => (t.per_decade > 0 ? 'increase' : 'decrease');
  const pv = (t) => (t.p_value < 0.001 ? 'p < 0.001' : `p = ${fmtP(t.p_value)}`);
  const v1 = headline(series).big, v2 = headline(s2).big;
  const y0 = series.years[0], y1 = series.years[series.years.length - 1];
  let kind, badge, advice;
  if (a.significant && b.significant && same) {
    kind = 'agree'; badge = 'Independent Verification';
    advice = `The independent record ${full} (${basis}) shows a consistent, statistically significant ${dir(b)} of ${v2} per decade (${pv(b)}). Both records support the trend reported above (${v1} per decade).`;
  } else if (a.significant && same) {
    kind = 'partial'; badge = 'Partial Corroboration';
    advice = `${full} (${basis}) indicates change in the same direction (${v2} per decade) that does not reach statistical significance at α = 0.05 (${pv(b)}). The reported trend is supported in direction, but its magnitude carries additional uncertainty.`;
  } else if (a.significant && b.significant) {
    kind = 'conflict'; badge = 'Cross-Dataset Divergence Note';
    advice = `The independent record ${full} (${basis}) shows a statistically significant trend in the opposite direction (${v2} per decade, ${pv(b)}) at this location. Two independent NASA records therefore diverge significantly; owing to differences in the inputs and methods behind the two records, the trend reported above should be treated as unresolved.`;
  } else if (a.significant) {
    kind = 'inconsistent'; badge = 'Cross-Dataset Inconsistency Note';
    advice = `The independent record ${full} (${basis}) indicates change in the opposite direction (${v2} per decade) that is not statistically significant (${pv(b)}). The trend reported above is therefore not supported by the independent record, although it is not significantly contradicted; it should be interpreted with caution.`;
  } else if (b.significant) {
    kind = 'unconfirmed'; badge = 'Mixed Evidence';
    advice = same
      ? `Both records indicate ${dir(b) === "increase" ? "an" : "a"} ${dir(b)}, but only ${full} (${basis}) reaches statistical significance (${v2} per decade, ${pv(b)}); the primary record above does not (${pv(a)}). The strength of evidence at this location is therefore inconclusive.`
      : `${full} (${basis}) shows a statistically significant ${dir(b)} of ${v2} per decade (${pv(b)}), whereas the primary record above shows a non-significant change in the opposite direction (${pv(a)}). The direction of change at this location is therefore uncertain.`;
  } else {
    kind = 'neutral'; badge = 'No Significant Trend in Either Record';
    advice = `Neither the primary record nor ${full} shows a statistically significant trend over ${y0}–${y1}. This indicates insufficient evidence of change over the record, not evidence of no change.`;
  }
  return { kind, badge, advice, s2, chk, basis };
}
