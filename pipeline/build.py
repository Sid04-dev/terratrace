"""
build.py — turns raw NASA data into the JSON files the website reads.

    raw files  ──loader──▶  monthly tidy table  ──clean.py──▶  annual tidy table
               ──build──▶   data/processed/grid_<id>.json + manifest.json
               ──validate.py──▶  ✅ / ❌

Usage (run from the project folder):
    python pipeline/build.py --practice                 # no internet: fake monthly data, tests the whole pipeline
    python pipeline/build.py --only temperature --bbox 10 40 30 65 --limit 20   # small real test
    python pipeline/build.py                            # everything in config.py (slow — do it Friday!)

After it finishes, refresh the website: the DEMO DATA badge disappears and
your real data is on the globe.
"""
from __future__ import annotations

import argparse
import importlib
import json
import math
import sys
import zlib
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as cfg  # noqa: E402
from clean import clean_monthly  # noqa: E402
from landmask import land_fraction  # noqa: E402
from trend import analyse  # noqa: E402
from validate import validate_folder  # noqa: E402


def read_json(path):
    """Read JSON saved as UTF-8 (or by an older version of this script in the Windows default encoding)."""
    raw = path.read_bytes()
    try:
        return json.loads(raw.decode("utf-8"))
    except UnicodeDecodeError:
        return json.loads(raw.decode("cp1252"))


def grid_cells(step, bbox=None, land_only=False):
    cells = []
    lat = -90 + step / 2
    while lat < 90:
        lon = -180 + step / 2
        while lon < 180:
            ok = True
            if bbox:
                ok = bbox[0] <= lat <= bbox[1] and bbox[2] <= lon <= bbox[3]
            if ok and land_only:
                ok = land_fraction(lat, lon, step, cfg.LAND_MASK) >= 0.3
            if ok:
                cells.append((round(lat, 3), round(lon, 3)))
            lon += step
        lat += step
    return cells


def practice_loader(var, cells, _cfg):
    """Fake monthly data with gaps, fill values and outliers — to practise cleaning offline."""
    rng = np.random.default_rng(zlib.crc32(var["id"].encode()))
    rows = []
    for lat, lon in cells:
        lo, hi = var.get("valid_range", (0, 10))
        hi = min(hi, lo + 20)
        base = 28 - 38 * math.sin(math.radians(lat)) ** 2 if var["unit"] == "°C" else lo + (hi - lo) * 0.3
        trend = 0.03 if var["unit"] == "°C" else (hi - lo) * 0.003
        for y in range(cfg.START_YEAR, cfg.END_YEAR + 1):
            for m in range(1, 13):
                season = 6 * math.cos((m - 7) / 12 * 2 * math.pi) * (1 if lat >= 0 else -1) if var["unit"] == "°C" else 0
                v = base + season + trend * (y - cfg.START_YEAR) + rng.normal(0, 0.8 if var["unit"] == "°C" else (hi - lo) * 0.05)
                if var["unit"] != "°C":
                    v = max(0, v)
                r = rng.random()
                if r < 0.02:
                    v = -999          # NASA fill value
                elif r < 0.025:
                    v = 9999          # impossible outlier
                elif r < 0.04:
                    continue          # missing month
                rows.append((lat, lon, y, m, v))
    return pd.DataFrame(rows, columns=["lat", "lon", "year", "month", "value"])


def to_grid_json(annual: pd.DataFrame, var: dict) -> dict:
    years = list(range(cfg.START_YEAR, cfg.END_YEAR + 1))
    d = var.get("decimals", 2)
    cells = []
    for (lat, lon), grp in annual.groupby(["lat", "lon"]):
        s = grp.set_index("year")["value"].reindex(years)
        values = [None if (v is None or (isinstance(v, float) and math.isnan(v))) else round(float(v), d) for v in s]
        if all(v is None for v in values):
            continue
        cells.append({
            "lat": float(lat), "lon": float(lon), "values": values,
            "trend": analyse(years, values, cfg.ALPHA),
        })
    return {"variable": var["id"], "unit": var["unit"], "step": cfg.GRID_STEP, "years": years, "cells": cells}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help="comma-separated variable ids, e.g. temperature,precipitation")
    ap.add_argument("--bbox", nargs=4, type=float, metavar=("MIN_LAT", "MAX_LAT", "MIN_LON", "MAX_LON"))
    ap.add_argument("--step", type=float, help="grid size in degrees (default from config.py)")
    ap.add_argument("--limit", type=int, help="only the first N cells (quick tests)")
    ap.add_argument("--practice", action="store_true", help="use fake data (no internet needed)")
    a = ap.parse_args()

    if a.step:
        cfg.GRID_STEP = a.step
    bbox = a.bbox or cfg.BBOX
    wanted = set(a.only.split(",")) if a.only else None
    variables = [v for v in cfg.VARIABLES if not wanted or v["id"] in wanted]
    if not variables:
        sys.exit(f"No variables match --only {a.only}. Ids in config.py: {[v['id'] for v in cfg.VARIABLES]}")

    cfg.OUT_DIR.mkdir(parents=True, exist_ok=True)
    cfg.INTERIM_DIR.mkdir(parents=True, exist_ok=True)

    manifest_path = cfg.OUT_DIR / "manifest.json"
    manifest = read_json(manifest_path) if manifest_path.exists() else {"variables": []}
    keep = [v for v in manifest.get("variables", []) if v["id"] not in {x["id"] for x in variables}]

    built = []
    for var in variables:
        print(f"\n=== {var['id']} ({var['source_type']}) ===")
        cells = grid_cells(cfg.GRID_STEP, bbox, var.get("land_only", False))
        if a.limit:
            cells = cells[: a.limit]
        print(f"  {len(cells)} grid cells of {cfg.GRID_STEP}°")
        if a.practice:
            monthly = practice_loader(var, cells, cfg)
        else:
            loader = importlib.import_module(f"sources.{var['source_type']}")
            monthly = loader.load(var, cells, cfg)
        if monthly.empty:
            print("  ❌ loader returned no rows — skipped")
            continue
        annual = clean_monthly(monthly, var, cfg)
        annual.to_csv(cfg.INTERIM_DIR / f"{var['id']}_annual.csv", index=False)
        grid = to_grid_json(annual, var)
        if not grid["cells"]:
            print("  ❌ no grid cell had any valid data — skipped (land-only variable over sea? wrong valid_range?)")
            continue
        out = cfg.OUT_DIR / f"grid_{var['id']}.json"
        out.write_text(json.dumps(grid, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
        sig = sum(1 for c in grid["cells"] if c["trend"]["significant"])
        print(f"  ✅ wrote {out.relative_to(cfg.ROOT)}  ({len(grid['cells'])} cells, {sig} with significant trends)")
        entry = {k: var[k] for k in ("id", "label", "unit", "aggregation", "decimals", "trend_display", "description", "source") if k in var}
        entry["file"] = out.name
        built.append(entry)

    # re-read the manifest now, so a variable built by another run in the meantime isn't lost
    if manifest_path.exists():
        latest = read_json(manifest_path).get("variables", [])
        keep = [v for v in latest if v["id"] not in {x["id"] for x in built}]
    order = {v["id"]: i for i, v in enumerate(cfg.VARIABLES)}
    all_vars = sorted(keep + built, key=lambda v: order.get(v["id"], 99))
    manifest = {
        "contract_version": 1,
        "title": "TerraTrace dataset" + (" (PRACTICE — fake data)" if a.practice else ""),
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "is_demo": bool(a.practice),
        "years": [cfg.START_YEAR, cfg.END_YEAR],
        "variables": all_vars,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nWrote {manifest_path.relative_to(cfg.ROOT)} with {len(all_vars)} variable(s)\n")
    ok = validate_folder(cfg.OUT_DIR)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
