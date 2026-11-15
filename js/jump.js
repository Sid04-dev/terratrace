// =============================================================
//  jump.js — "fake trend" detector: is this trend really one sudden jump?
// -------------------------------------------------------------
//  A steady trend fits a straight line. A jump (a drought that starts,
//  or a change in satellites or model inputs) fits a step better.
//  We compare the two fits (R²). If the step explains clearly more
//  (+0.20) and fits well (≥ 0.60), we warn the student.
//  Same rule as pipeline/jump_check.py.
// =============================================================
import { cleanPairs } from './trend.js';

export const JUMP_RULE = { gain: 0.2, fit: 0.6, minSeg: 5 };

export function stepCheck(years, values) {
  const { x, y } = cleanPairs(years, values);
  const n = y.length, { minSeg } = JUMP_RULE;
  if (n < 2 * minSeg) return null;
  const my = y.reduce((a, b) => a + b, 0) / n;
  const tss = y.reduce((a, v) => a + (v - my) ** 2, 0) || 1e-12;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const b = sxx ? sxy / sxx : 0, a = my - b * mx;
  const rssLine = y.reduce((s, v, i) => s + (v - (a + b * x[i])) ** 2, 0);
  let best = Infinity, k = -1, mA = 0, mB = 0;
  for (let j = minSeg; j <= n - minSeg; j++) {
    const A = y.slice(0, j), B = y.slice(j);
    const ma = A.reduce((s, v) => s + v, 0) / A.length, mb = B.reduce((s, v) => s + v, 0) / B.length;
    const r = A.reduce((s, v) => s + (v - ma) ** 2, 0) + B.reduce((s, v) => s + (v - mb) ** 2, 0);
    if (r < best) { best = r; k = j; mA = ma; mB = mb; }
  }
  const r2Line = 1 - rssLine / tss, r2Step = 1 - best / tss;
  return {
    flagged: r2Step - r2Line > JUMP_RULE.gain && r2Step >= JUMP_RULE.fit,
    year: x[k], before: mA, after: mB, r2Line, r2Step,
  };
}
