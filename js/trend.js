// =============================================================
//  trend.js — the statistics behind every number TerraTrace shows
// -------------------------------------------------------------
//  We use the two standard tools climate scientists use for
//  "is this place really changing?":
//    • Mann-Kendall test  → is there a trend at all? (p-value)
//    • Sen's slope        → how fast? (robust to outliers)
//  plus an ordinary least-squares line just for drawing.
//
//  pipeline/trend.py implements EXACTLY the same maths in Python.
//  If you change one, change the other.
// =============================================================

/** Remove null / NaN pairs. Returns {x, y} of equal length. */
export function cleanPairs(years, values) {
  const x = [], y = [];
  for (let i = 0; i < years.length; i++) {
    const v = values[i];
    if (v !== null && v !== undefined && Number.isFinite(v)) {
      x.push(years[i]);
      y.push(v);
    }
  }
  return { x, y };
}

/** Standard normal CDF via an erf approximation (Abramowitz-Stegun 7.1.26). */
function normCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const a = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429];
  const erf = 1 - (((((a[4] * t + a[3]) * t) + a[2]) * t + a[1]) * t + a[0]) * t *
    Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/** Mann-Kendall trend test with tie correction. Returns {S, z, p}. */
export function mannKendall(y) {
  const n = y.length;
  if (n < 4) return { S: 0, z: 0, p: 1, varS: 0 };
  let S = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) S += Math.sign(y[j] - y[i]);
  }
  // tie correction
  const counts = new Map();
  for (const v of y) counts.set(v, (counts.get(v) || 0) + 1);
  let tieTerm = 0;
  for (const t of counts.values()) if (t > 1) tieTerm += t * (t - 1) * (2 * t + 5);
  const varS = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;
  let z = 0;
  if (S > 0) z = (S - 1) / Math.sqrt(varS);
  else if (S < 0) z = (S + 1) / Math.sqrt(varS);
  const p = 2 * (1 - normCdf(Math.abs(z)));
  return { S, z, p, varS };
}

function pairwiseSlopes(x, y) {
  const slopes = [];
  for (let i = 0; i < x.length - 1; i++) {
    for (let j = i + 1; j < x.length; j++) if (x[j] !== x[i]) slopes.push((y[j] - y[i]) / (x[j] - x[i]));
  }
  return slopes.sort((a, b) => a - b);
}

/**
 * 95% confidence interval for Sen's slope (Gilbert 1987, non-parametric).
 * C = 1.96·√Var(S); the bounds are the M1-th and (M2+1)-th ordered slopes,
 * with M1 = (N − C)/2 and M2 = (N + C)/2. Returns [low, high] per year.
 */
export function sensCI(x, y, varS, z = 1.959964) {
  const s = pairwiseSlopes(x, y), N = s.length;
  if (N < 2 || !(varS > 0)) return null;
  const C = z * Math.sqrt(varS);
  const m1 = Math.round((N - C) / 2), m2 = Math.round((N + C) / 2);
  return [s[Math.min(N - 1, Math.max(0, m1 - 1))], s[Math.min(N - 1, Math.max(0, m2))]];
}

/**
 * Autocorrelation correction (Hamed & Rao 1998), same maths as pipeline/trend.py.
 * If one year's value depends on the last, plain Mann-Kendall is too confident.
 * We rank the Sen-detrended series, add up the significant rank autocorrelations,
 * and widen Var(S) by n/n*. It never narrows it (factor ≥ 1), so it is conservative.
 */
export function hamedRaoVar(x, y, varS, slope) {
  const n = y.length;
  if (n < 6 || !(varS > 0)) return { varS, factor: 1 };
  const det = y.map((v, i) => v - slope * x[i]);
  const order = det.map((_, i) => i).sort((a, b) => det[a] - det[b]);
  const rank = new Array(n);
  order.forEach((i, r) => { rank[i] = r + 1; });
  const m = rank.reduce((a, b) => a + b, 0) / n;
  const den = rank.reduce((a, r) => a + (r - m) ** 2, 0);
  const bound = 1.96 / Math.sqrt(n);
  let acc = 0;
  for (let k = 1; k < n - 2; k++) {
    let num = 0;
    for (let i = 0; i < n - k; i++) num += (rank[i] - m) * (rank[i + k] - m);
    const rk = num / den;
    if (Math.abs(rk) > bound) acc += (n - k) * (n - k - 1) * (n - k - 2) * rk;
  }
  const factor = Math.max(1, 1 + (2 / (n * (n - 1) * (n - 2))) * acc);
  return { varS: varS * factor, factor };
}

function pFrom(S, varS) {
  if (!(varS > 0) || S === 0) return 1;
  const z = S > 0 ? (S - 1) / Math.sqrt(varS) : (S + 1) / Math.sqrt(varS);
  return 2 * (1 - normCdf(Math.abs(z)));
}

/** Sen's slope: median of all pairwise slopes (units per year). */
export function sensSlope(x, y) {
  const slopes = [];
  for (let i = 0; i < x.length - 1; i++) {
    for (let j = i + 1; j < x.length; j++) {
      if (x[j] !== x[i]) slopes.push((y[j] - y[i]) / (x[j] - x[i]));
    }
  }
  if (!slopes.length) return 0;
  slopes.sort((a, b) => a - b);
  const m = Math.floor(slopes.length / 2);
  return slopes.length % 2 ? slopes[m] : (slopes[m - 1] + slopes[m]) / 2;
}

/** Ordinary least squares — used only to draw the trend line. */
export function ols(x, y) {
  const n = x.length;
  if (n < 2) return { slope: 0, intercept: y[0] ?? 0 };
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (x[i] - mx) * (y[i] - my); den += (x[i] - mx) ** 2; }
  const slope = den ? num / den : 0;
  return { slope, intercept: my - slope * mx };
}

const mean = (a) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;

/**
 * Full trend analysis for one place + one variable.
 * Output matches the "trend" block of the data contract (docs/DATA_CONTRACT.md).
 */
export function analyse(years, values, { alpha = 0.05, window = 5 } = {}) {
  const { x, y } = cleanPairs(years, values);
  const completeness = years.length ? x.length / years.length : 0;
  if (x.length < 6) {
    return {
      per_decade: null, ci_per_decade: null, rel_per_decade: null, pct_change: null, p_value: null, significant: false,
      direction: 'unknown', completeness, n: x.length,
      first_mean: null, last_mean: null, max: null, min: null, line: null,
    };
  }
  const sen = sensSlope(x, y);
  const mk = mannKendall(y);
  const line = ols(x, y);
  const w = Math.min(window, Math.floor(x.length / 2));
  const firstMean = mean(y.slice(0, w));
  const lastMean = mean(y.slice(-w));
  const pct = Math.abs(firstMean) > 1e-9 ? ((lastMean - firstMean) / Math.abs(firstMean)) * 100 : null;
  let maxI = 0, minI = 0;
  y.forEach((v, i) => { if (v > y[maxI]) maxI = i; if (v < y[minI]) minI = i; });
  const hr = hamedRaoVar(x, y, mk.varS, sen);
  const p = pFrom(mk.S, hr.varS);
  const significant = p < alpha;
  const avg = mean(y);
  const ci = sensCI(x, y, hr.varS);
  return {
    per_decade: sen * 10,
    ci_per_decade: ci ? [ci[0] * 10, ci[1] * 10] : null, // 95% confidence interval
    rel_per_decade: Math.abs(avg) > 1e-9 ? (sen * 10 / Math.abs(avg)) * 100 : null, // % of the average, per decade
    pct_change: pct,
    p_value: p,
    p_value_classic: mk.p, // plain Mann-Kendall, before the autocorrelation correction
    ac_factor: hr.factor, // > 1 means neighbouring years were related and we widened the test
    significant,
    direction: !significant ? 'stable' : sen > 0 ? 'rising' : 'falling',
    completeness,
    n: x.length,
    first_mean: firstMean,
    last_mean: lastMean,
    max: { year: x[maxI], value: y[maxI] },
    min: { year: x[minI], value: y[minI] },
    line, // {slope, intercept} for drawing
  };
}
