"""
trend.py — Mann-Kendall test + Sen's slope (identical maths to js/trend.js).

Why these two?
  * Mann-Kendall asks "is there a consistent upward/downward trend?" without
    assuming the data is normally distributed. Standard in climate science.
  * Sen's slope = the median of all pairwise slopes. One crazy year can't
    distort it the way it distorts a normal regression line.
Say this in the pitch — it is exactly what the "Validity" criterion rewards.
"""
from __future__ import annotations

import math
from collections import Counter


def clean_pairs(years, values):
    x, y = [], []
    for yr, v in zip(years, values):
        if v is not None and isinstance(v, (int, float)) and math.isfinite(v):
            x.append(yr)
            y.append(float(v))
    return x, y


def _norm_cdf(z: float) -> float:
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def mann_kendall(y):
    n = len(y)
    if n < 4:
        return {"S": 0, "z": 0.0, "p": 1.0, "var": 0.0}
    s = 0
    for i in range(n - 1):
        for j in range(i + 1, n):
            d = y[j] - y[i]
            s += (d > 0) - (d < 0)
    ties = sum(t * (t - 1) * (2 * t + 5) for t in Counter(y).values() if t > 1)
    var_s = (n * (n - 1) * (2 * n + 5) - ties) / 18
    if s > 0:
        z = (s - 1) / math.sqrt(var_s)
    elif s < 0:
        z = (s + 1) / math.sqrt(var_s)
    else:
        z = 0.0
    p = 2 * (1 - _norm_cdf(abs(z)))
    return {"S": s, "z": z, "p": p, "var": var_s}


def sens_slope(x, y):
    slopes = sorted(
        (y[j] - y[i]) / (x[j] - x[i])
        for i in range(len(x) - 1)
        for j in range(i + 1, len(x))
        if x[j] != x[i]
    )
    if not slopes:
        return 0.0
    m = len(slopes) // 2
    return slopes[m] if len(slopes) % 2 else (slopes[m - 1] + slopes[m]) / 2


def sens_ci(x, y, var_s, z=1.959964):
    """95% confidence interval for Sen's slope (Gilbert 1987). Same maths as js/trend.js."""
    s = sorted((y[j] - y[i]) / (x[j] - x[i]) for i in range(len(x) - 1) for j in range(i + 1, len(x)) if x[j] != x[i])
    n = len(s)
    if n < 2 or var_s <= 0:
        return None
    c = z * math.sqrt(var_s)
    m1, m2 = round((n - c) / 2), round((n + c) / 2)
    return s[min(n - 1, max(0, m1 - 1))], s[min(n - 1, max(0, m2))]


def hamed_rao_var(x, y, var_s, slope):
    """Autocorrelation correction (Hamed & Rao 1998). Same maths as js/trend.js.
    Ranks the Sen-detrended series, sums the significant rank autocorrelations
    and inflates Var(S) by n/n*. Never deflates (factor >= 1): conservative."""
    n = len(y)
    if n < 6 or var_s <= 0:
        return var_s, 1.0
    det = [v - slope * xi for xi, v in zip(x, y)]
    order = sorted(range(n), key=lambda i: det[i])
    rank = [0.0] * n
    for r, i in enumerate(order):
        rank[i] = r + 1.0
    m = sum(rank) / n
    den = sum((r - m) ** 2 for r in rank)
    bound = 1.96 / math.sqrt(n)
    acc = 0.0
    for k in range(1, n - 2):
        rk = sum((rank[i] - m) * (rank[i + k] - m) for i in range(n - k)) / den
        if abs(rk) > bound:
            acc += (n - k) * (n - k - 1) * (n - k - 2) * rk
    factor = max(1.0, 1 + 2 / (n * (n - 1) * (n - 2)) * acc)
    return var_s * factor, factor


def _p_from(s, var):
    if var <= 0 or s == 0:
        return 1.0
    z = (s - 1) / math.sqrt(var) if s > 0 else (s + 1) / math.sqrt(var)
    return 2 * (1 - _norm_cdf(abs(z)))


def analyse(years, values, alpha=0.05):
    """Returns the compact trend block stored in grid cells (optional in the contract)."""
    x, y = clean_pairs(years, values)
    if len(x) < 6:
        return {"per_decade": None, "p_value": None, "significant": False}
    slope = sens_slope(x, y)
    mk = mann_kendall(y)
    var, factor = hamed_rao_var(x, y, mk["var"], slope)
    p = _p_from(mk["S"], var)
    ci = sens_ci(x, y, var)
    return {
        "per_decade": round(slope * 10, 6),
        "ci_per_decade": [round(ci[0] * 10, 6), round(ci[1] * 10, 6)] if ci else None,
        "p_value": round(p, 6),
        "significant": p < alpha,
        "ac_factor": round(factor, 3),
    }


if __name__ == "__main__":
    # quick self-test:  python pipeline/trend.py
    yrs = list(range(2001, 2025))
    vals = [20 + 0.03 * (y - 2001) + (0.2 if y % 3 == 0 else -0.1) for y in yrs]
    vals[5] = None
    print(analyse(yrs, vals))
