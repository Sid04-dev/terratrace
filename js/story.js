// =============================================================
//  story.js — turns numbers into plain language
//  Everything here is generated from the data, never hard-coded,
//  so it is always honest about what the data shows.
// =============================================================
import { styleFor } from './config.js';
import { fmt, signed } from './util.js';
import { trendDisplay } from './data.js';

// Note: "not significant" never means "no change". It means this record is too
// short or too noisy to confirm the trend at the 95% level.
export function evidenceLabel(p, years) {
  const span = years && years.length ? ` (${years[0]}–${years[years.length - 1]})` : '';
  if (p === null) return { text: 'Not enough data', level: 'none' };
  if (p < 0.01) return { text: 'Very strong evidence of change', level: 'strong' };
  if (p < 0.05) return { text: 'Strong evidence of change', level: 'good' };
  if (p < 0.1) return { text: `Weak evidence, not yet significant${span}`, level: 'weak' };
  return { text: `Not statistically significant${span}`, level: 'none' };
}

export function headline(series) {
  const t = series.trend;
  const st = styleFor(series.variable);
  const d = series.decimals;
  if (t.per_decade === null) return { big: '—', small: 'not enough data' };
  if (trendDisplay(series.variable) === 'absolute') {
    const u = (!series.unit || series.unit === '0–1') ? '' : ` ${series.unit}`; // soil moisture is a unitless fraction
    return { big: `${signed(t.per_decade, Math.max(1, d))}${u}`, small: 'per decade' };
  }
  return { big: `${signed(t.rel_per_decade, 1)}%`, small: `per decade (${signed(t.per_decade, d)} ${series.unit})`, icon: st.icon };
}

/** One or two sentences a student could paste into a report (after checking!). */
export function summary(series, placeName) {
  const t = series.trend;
  const st = styleFor(series.variable);
  const y0 = series.years[0], y1 = series.years[series.years.length - 1];
  const d = series.decimals;
  if (t.per_decade === null) {
    return `There isn't enough valid data near ${placeName} to measure a trend in ${st.noun.toLowerCase()}.`;
  }
  const span = y1 - y0;
  const total = (t.per_decade / 10) * span;
  if (!t.significant) {
    const dirn = t.per_decade > 0 ? 'upward' : 'downward';
    const ci0 = t.ci_per_decade ? ` (95% confidence interval ${signed(t.ci_per_decade[0], Math.max(1, d))} to ${signed(t.ci_per_decade[1], Math.max(1, d))})` : '';
    return `${st.noun} near ${placeName} shows ${dirn === 'upward' ? 'an' : 'a'} ${dirn} trend of ${signed(t.per_decade, Math.max(1, d))} ${series.unit} per decade from ${y0} to ${y1}${ci0}, but over this ${span + 1}-year record it is not statistically significant: year-to-year swings are large compared with the trend (Mann–Kendall p = ${fmt(t.p_value, 2)}). This does not mean there has been no change. A longer record, such as a century of weather-station data, may show a clear trend.`;
  }
  const verb = t.direction === 'rising' ? st.rising : st.falling;
  const amount = trendDisplay(series.variable) === 'absolute'
    ? `${fmt(Math.abs(total), Math.max(1, d))} ${series.unit}`
    : t.first_mean
      ? `${fmt(Math.abs(total), d)} ${series.unit}, equal to ${fmt(Math.abs(total / t.first_mean) * 100, 0)}% of its ${y0}–${y0 + 4} average,`
      : `${fmt(Math.abs(total), d)} ${series.unit}`;
  const ci = t.ci_per_decade ? ` (95% confidence interval ${signed(t.ci_per_decade[0], Math.max(1, d))} to ${signed(t.ci_per_decade[1], Math.max(1, d))})` : '';
  return `${placeName} has ${verb} since ${y0}: about ${amount} along the trend line over ${span} years, or ${signed(t.per_decade, Math.max(1, d))} ${series.unit} per decade${ci}. ${evidenceLabel(t.p_value, series.years).text} (p ${t.p_value < 0.001 ? '< 0.001' : '= ' + fmt(t.p_value, 3)}).`;
}

const y0Of = (s) => s.years[0];
const y1Of = (s) => s.years[s.years.length - 1];

/** Suggested research questions — the "student mode" twist. */
export function researchQuestions(series, placeName) {
  const st = styleFor(series.variable);
  const noun = st.noun.toLowerCase();
  const t = series.trend;
  const qs = [];
  if (t.significant) {
    qs.push(`What human or natural factors could explain why ${noun} near ${placeName} is ${t.direction}?`);
    qs.push(`How might a ${t.direction === 'rising' ? 'continued rise' : 'continued fall'} in ${noun} affect people, farming or infrastructure in ${placeName} by 2050?`);
  } else {
    qs.push(`The ${y0Of(series)}–${y1Of(series)} trend in ${noun} near ${placeName} is not statistically significant. Do longer records (for example, local weather-station data) show a clearer trend?`);
    qs.push(`Which years were extreme outliers for ${noun} near ${placeName}, and what events happened then?`);
  }
  if (t.max) qs.push(`What happened in ${t.max.year}, the year with the highest ${noun} in this record?`);
  qs.push(`How does ${placeName} compare with another city you know? (Use "Compare" to overlay them.)`);
  return qs.slice(0, 3);
}
