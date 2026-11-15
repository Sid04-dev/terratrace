"""
jump_check.py — "fake trend" detector. Same rule as js/jump.js:
compare a straight line with the best single step (each side >= 5 years).
A significant trend is flagged as a sudden jump when the step explains
clearly more of the variation (R2 gain > 0.20) and fits well (R2 >= 0.60).
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from trend import clean_pairs, analyse

GAIN, FIT, MINSEG = 0.2, 0.6, 5

def step_check(years, values):
    x, y = clean_pairs(years, values); n = len(y)
    if n < 2 * MINSEG: return None
    my = sum(y) / n; tss = sum((v - my) ** 2 for v in y) or 1e-12
    mx = sum(x) / n; sxx = sum((xi - mx) ** 2 for xi in x)
    b = sum((xi - mx) * (v - my) for xi, v in zip(x, y)) / sxx if sxx else 0; a = my - b * mx
    rl = sum((v - (a + b * xi)) ** 2 for xi, v in zip(x, y))
    best, k = float("inf"), -1
    for j in range(MINSEG, n - MINSEG + 1):
        A, B = y[:j], y[j:]; ma, mb = sum(A) / len(A), sum(B) / len(B)
        r = sum((v - ma) ** 2 for v in A) + sum((v - mb) ** 2 for v in B)
        if r < best: best, k = r, j
    r2l, r2s = 1 - rl / tss, 1 - best / tss
    return dict(flagged=(r2s - r2l > GAIN and r2s >= FIT), year=x[k], r2_line=r2l, r2_step=r2s)

if __name__ == "__main__":
    base = os.path.join(os.path.dirname(__file__), "..", "data", "processed")
    for f in sorted(os.listdir(base)):
        if not (f.startswith("grid_") or f.startswith("check_")) or not f.endswith(".json"): continue
        g = json.load(open(os.path.join(base, f))); sig = fl = 0
        for c in g["cells"]:
            if not analyse(g["years"], c["values"])["significant"]: continue
            sig += 1
            r = step_check(g["years"], c["values"])
            fl += bool(r and r["flagged"])
        print(f"{f:34s} significant {sig:5d}  sudden-jump flags {fl:4d} ({fl / max(sig, 1) * 100:.1f}%)")
