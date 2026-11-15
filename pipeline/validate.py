"""
validate.py — checks data/processed/ against docs/DATA_CONTRACT.md
(the same rules the website checks in js/data.js).

    python pipeline/validate.py

Run this BEFORE you tell the frontend person "data is ready".
"""
from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def validate_manifest(m):
    p = []
    if m.get("contract_version") != 1:
        p.append(f"⚠️  manifest.contract_version is {m.get('contract_version')}, expected 1")
    vs = m.get("variables")
    if not isinstance(vs, list) or not vs:
        p.append("❌ manifest.variables must be a non-empty list")
        return p
    for v in vs:
        for f in ("id", "label", "unit", "file", "source"):
            if f not in v:
                p.append(f"❌ variable {v.get('id', '?')} is missing '{f}'")
        if "id" in v and not re.fullmatch(r"[a-z0-9_]+", v["id"]):
            p.append(f"❌ variable id '{v['id']}' must be lowercase letters/numbers/underscores")
        if isinstance(v.get("source"), dict) and not v["source"].get("name"):
            p.append(f"⚠️  variable {v.get('id')}: source.name is empty (needed for citations)")
    return p


def validate_grid(g, v):
    p, tag = [], f"grid '{v['id']}'"
    years = g.get("years")
    if not isinstance(years, list) or len(years) < 6:
        p.append(f"❌ {tag}: 'years' must be a list of at least 6 years")
        years = years or []
    if any(years[i] != years[i - 1] + 1 for i in range(1, len(years))):
        p.append(f"❌ {tag}: years must be consecutive and ascending")
    if not isinstance(g.get("step"), (int, float)) or g["step"] <= 0:
        p.append(f"❌ {tag}: 'step' must be a positive number (grid size in degrees)")
    if g.get("unit") != v.get("unit"):
        p.append(f"⚠️  {tag}: unit '{g.get('unit')}' differs from manifest unit '{v.get('unit')}'")
    cells = g.get("cells")
    if not isinstance(cells, list) or not cells:
        p.append(f"❌ {tag}: 'cells' must be a non-empty list")
        return p
    bad_len = bad_coord = bad_val = fill = nulls = total = 0
    for c in cells:
        if not (-90 <= c.get("lat", 999) <= 90 and -180 <= c.get("lon", 999) <= 180):
            bad_coord += 1
        vals = c.get("values")
        if not isinstance(vals, list) or len(vals) != len(years):
            bad_len += 1
            continue
        for x in vals:
            total += 1
            if x is None:
                nulls += 1
            elif not isinstance(x, (int, float)) or isinstance(x, bool) or not math.isfinite(x):
                bad_val += 1
            elif x <= -999:
                fill += 1
    if bad_coord:
        p.append(f"❌ {tag}: {bad_coord} cells have lat/lon outside the valid range")
    if bad_len:
        p.append(f"❌ {tag}: {bad_len} cells have a 'values' list that doesn't match 'years' length")
    if bad_val:
        p.append(f"❌ {tag}: {bad_val} values are not numbers (use null for missing)")
    if fill:
        p.append(f"❌ {tag}: {fill} values look like NASA fill values (≤ -999). Replace them with null!")
    if total and nulls / total > 0.3:
        p.append(f"⚠️  {tag}: {round(nulls / total * 100)}% of values are missing")
    return p


def validate_folder(folder: Path) -> bool:
    mp = folder / "manifest.json"
    if not mp.exists():
        print(f"❌ {mp} not found")
        return False
    m = json.loads(mp.read_text(encoding="utf-8"))
    problems = validate_manifest(m)
    for v in m.get("variables", []):
        gp = folder / v.get("file", "")
        if not gp.exists():
            problems.append(f"❌ {gp.name} (variable '{v.get('id')}') not found")
            continue
        g = json.loads(gp.read_text(encoding="utf-8"))
        problems += validate_grid(g, v)
        size = gp.stat().st_size / 1e6
        if size > 15:
            problems.append(f"⚠️  {gp.name} is {size:.1f} MB — may load slowly; consider a bigger grid step")
    print("DATA CONTRACT CHECK")
    for x in problems or ["✅ All data passed the contract checks. Refresh the website!"]:
        print("  " + x)
    return not any(x.startswith("❌") for x in problems)


if __name__ == "__main__":
    folder = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "processed"
    sys.exit(0 if validate_folder(folder) else 1)
