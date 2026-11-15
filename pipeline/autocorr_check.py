"""
autocorr_check.py — robustness check: does year-to-year autocorrelation inflate
our Mann-Kendall significance?  Re-tests every cell with the Hamed & Rao (1998)
modified Mann-Kendall test (variance corrected for autocorrelated ranks of the
Sen-detrended series) and reports how many significant trends survive.
"""
import json, math, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from trend import clean_pairs, mann_kendall, sens_slope, _norm_cdf

def hamed_rao(x, y, alpha=0.05):
    n = len(y)
    mk = mann_kendall(y)
    b = sens_slope(x, y)
    det = [v - b * xi for xi, v in zip(x, y)]
    order = sorted(range(n), key=lambda i: det[i])
    rank = [0.0] * n
    for r, i in enumerate(order): rank[i] = r + 1
    m = sum(rank) / n
    den = sum((r - m) ** 2 for r in rank)
    bound = 1.96 / math.sqrt(n)
    acc = 0.0
    for k in range(1, n - 2):
        rk = sum((rank[i] - m) * (rank[i + k] - m) for i in range(n - k)) / den
        if abs(rk) > bound:
            acc += (n - k) * (n - k - 1) * (n - k - 2) * rk
    factor = 1 + 2 / (n * (n - 1) * (n - 2)) * acc
    factor = max(factor, 1.0)            # conservative: never make the test easier
    var = mk["var"] * factor
    s = mk["S"]
    z = (s - 1) / math.sqrt(var) if s > 0 else (s + 1) / math.sqrt(var) if s < 0 else 0.0
    p = 2 * (1 - _norm_cdf(abs(z)))
    return mk["p"], p, factor

def run(path):
    g = json.load(open(path))
    sig = keep = inflated = 0; tot = 0
    for c in g["cells"]:
        x, y = clean_pairs(g["years"], c["values"])
        if len(y) < 10: continue
        tot += 1
        p0, p1, f = hamed_rao(x, y)
        if f > 1: inflated += 1
        if p0 < 0.05:
            sig += 1
            if p1 < 0.05: keep += 1
    return tot, sig, keep, inflated

if __name__ == "__main__":
    base = os.path.join(os.path.dirname(__file__), "..", "data", "processed")
    out = {}
    for f in sorted(os.listdir(base)):
        if f.endswith(".json") and (f.startswith("grid_") or f.startswith("check_")):
            tot, sig, keep, inf = run(os.path.join(base, f))
            out[f] = dict(cells=tot, significant=sig, still_significant=keep, autocorrelated=inf)
            print(f"{f:38s} cells {tot:5d}  sig {sig:4d}  survive {keep:4d} ({keep/max(sig,1)*100:5.1f}%)  autocorrelated cells {inf/tot*100:4.1f}%")
    json.dump(out, open(os.path.join(base, "autocorr_check.json"), "w"), indent=1)
