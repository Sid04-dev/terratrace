// =============================================================
//  anomaly.js — unusual years at a place.
//  A year is "unusual" when it sits more than 2 robust standard
//  deviations away from what the long-term trend predicts for that
//  year. Using the trend as the baseline means a warming place does
//  not flag every recent year just for being warm: only years that
//  are extreme even for their time are flagged.
//  Robust SD = 1.4826 × median absolute deviation (one wild year
//  cannot inflate it).
// =============================================================
import { cleanPairs } from './trend.js';

export const ANOMALY_Z = 2;

function median(a) {
  const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Returns [{ year, value, expected, z, record }] sorted by |z|, strongest first. */
export function unusualYears(series) {
  const { x, y } = cleanPairs(series.years, series.values);
  if (y.length < 10 || series.trend.per_decade === null) return [];
  const b = series.trend.per_decade / 10;
  const a = median(y.map((v, i) => v - b * x[i]));
  const res = y.map((v, i) => v - (a + b * x[i]));
  const mad = median(res.map((r) => Math.abs(r - median(res))));
  const sd = 1.4826 * mad || Math.sqrt(res.reduce((s, r) => s + r * r, 0) / res.length);
  if (!(sd > 0)) return [];
  const hi = Math.max(...y), lo = Math.min(...y);
  return res
    .map((r, i) => ({ year: x[i], value: y[i], expected: a + b * x[i], z: r / sd, record: y[i] === hi ? 'highest' : y[i] === lo ? 'lowest' : null }))
    .filter((o) => Math.abs(o.z) >= ANOMALY_Z)
    .sort((p, q) => Math.abs(q.z) - Math.abs(p.z));
}

/** Plain words for an unusual year, by variable. */
export function anomalyWord(variable, z) {
  const up = z > 0;
  if (variable === 'temperature') return up ? 'unusually warm' : 'unusually cool';
  if (variable === 'precipitation') return up ? 'unusually wet' : 'unusually dry';
  if (variable === 'soil_moisture') return up ? 'unusually moist soil' : 'unusually dry soil';
  return up ? 'unusually high' : 'unusually low';
}

/** Detrended robust z-score for every year of one series (null where no data). */
export function zScores(years, values, perDecade) {
  const { x, y } = cleanPairs(years, values);
  if (y.length < 10 || perDecade === null || perDecade === undefined) return null;
  const b = perDecade / 10;
  const a = median(y.map((v, i) => v - b * x[i]));
  const res = y.map((v, i) => v - (a + b * x[i]));
  const m = median(res);
  const sd = 1.4826 * median(res.map((r) => Math.abs(r - m))) || Math.sqrt(res.reduce((s, r) => s + r * r, 0) / res.length);
  if (!(sd > 0)) return null;
  const out = years.map(() => null);
  x.forEach((yr, i) => { out[years.indexOf(yr)] = res[i] / sd; });
  return out;
}
