"""
crosscheck_gistemp.py — a second, independent NASA temperature record.

Our temperature layer comes from MERRA-2 (a weather model guided by observations).
NASA GISTEMP v4 is built from ~6,300 weather stations plus ocean measurements.
This script puts GISTEMP on the SAME 5° grid so the website can say, for every
place, whether the two NASA datasets agree.

    python pipeline/crosscheck_gistemp.py

  1. downloads data/raw/gistemp1200_GHCNv4_ERSSTv5.nc.gz from NASA GISS (≈27 MB, no login)
     (already downloaded it yourself? put it in data/raw/ and the script uses it)
  2. monthly 2°×2° anomalies → annual means (years with < 9 valid months = blank)
  3. 2° cells → our 5° cells (area-weighted by cos(latitude))
  4. writes data/processed/check_temperature_gistemp.json and adds a "checks"
     entry to manifest.json (the website then shows a "second opinion" line)
  5. prints how often the two datasets agree

Needs:  pip install netCDF4
"""
from __future__ import annotations

import gzip
import json
import shutil
import sys
from pathlib import Path

import warnings

import numpy as np

warnings.filterwarnings("ignore", category=RuntimeWarning)

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as cfg  # noqa: E402
from trend import analyse  # noqa: E402
from validate import validate_grid  # noqa: E402

URL = "https://data.giss.nasa.gov/pub/gistemp/gistemp1200_GHCNv4_ERSSTv5.nc.gz"
RAW_GZ = cfg.RAW_DIR / "gistemp1200_GHCNv4_ERSSTv5.nc.gz"
RAW_NC = cfg.RAW_DIR / "gistemp1200_GHCNv4_ERSSTv5.nc"
OUT = cfg.OUT_DIR / "check_temperature_gistemp.json"
CHECK = {
    "id": "temperature_check",
    "of": "temperature",
    "label": "Surface temperature anomaly (GISTEMP v4)",
    "unit": "°C",
    "aggregation": "annual mean anomaly",
    "decimals": 2,
    "file": OUT.name,
    "basis": "weather stations and ocean measurements",
    "source": {
        "name": "NASA GISS",
        "dataset": "GISTEMP v4 (1200 km smoothing)",
        "publisher": "NASA Goddard Institute for Space Studies",
        "url": "https://data.giss.nasa.gov/gistemp/",
        "version": "v4",
        "doi": "",
        "year": 2026,
    },
}


def read_json(path: Path):
    raw = path.read_bytes()
    try:
        return json.loads(raw.decode("utf-8"))
    except UnicodeDecodeError:
        return json.loads(raw.decode("cp1252"))


def download():
    if RAW_NC.exists() or RAW_GZ.exists():
        return
    import requests
    cfg.RAW_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {URL} …")
    with requests.get(URL, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(RAW_GZ, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    print(f"  saved {RAW_GZ.name} ({RAW_GZ.stat().st_size / 1e6:.1f} MB)")


def open_nc():
    from netCDF4 import Dataset, num2date
    if not RAW_NC.exists():
        with gzip.open(RAW_GZ, "rb") as fi, open(RAW_NC, "wb") as fo:
            shutil.copyfileobj(fi, fo)
    ds = Dataset(RAW_NC)
    name = "tempanomaly" if "tempanomaly" in ds.variables else next(
        k for k, v in ds.variables.items() if v.ndim == 3)
    lat = np.array(ds.variables["lat"][:], dtype=float)
    lon = np.array(ds.variables["lon"][:], dtype=float)
    lon = np.where(lon > 180, lon - 360, lon)
    t = ds.variables["time"]
    dates = num2date(t[:], t.units, getattr(t, "calendar", "standard"))
    years = np.array([d.year for d in dates])
    data = ds.variables[name][:]                      # masked array (time, lat, lon)
    data = np.ma.filled(data.astype(float), np.nan)
    data[np.abs(data) > 50] = np.nan                  # fill values / impossible anomalies
    return lat, lon, years, data


def build():
    download()
    lat, lon, years, data = open_nc()
    yrs = list(range(cfg.START_YEAR, cfg.END_YEAR + 1))

    # 1) annual means on the 2° grid
    annual = np.full((len(yrs), len(lat), len(lon)), np.nan)
    for i, y in enumerate(yrs):
        block = data[years == y]
        if not len(block):
            continue
        valid = np.sum(~np.isnan(block), axis=0)
        with np.errstate(invalid="ignore"):
            mean = np.nanmean(block, axis=0) if len(block) else np.nan
        annual[i] = np.where(valid >= cfg.MIN_MONTHS_PER_YEAR, mean, np.nan)

    # 2) 2° cells → 5° cells, weighted by area
    step = cfg.GRID_STEP
    w_lat = np.cos(np.radians(lat))
    cells = []
    c_lat = -90 + step / 2
    while c_lat < 90:
        li = np.where((lat >= c_lat - step / 2) & (lat < c_lat + step / 2))[0]
        c_lon = -180 + step / 2
        while c_lon < 180:
            lj = np.where((lon >= c_lon - step / 2) & (lon < c_lon + step / 2))[0]
            vals = []
            if len(li) and len(lj):
                sub = annual[:, li][:, :, lj]                       # (years, nlat, nlon)
                w = np.repeat(w_lat[li][:, None], len(lj), axis=1)
                for k in range(len(yrs)):
                    s = sub[k]
                    ok = ~np.isnan(s)
                    vals.append(round(float(np.sum(s[ok] * w[ok]) / np.sum(w[ok])), 3) if ok.sum() * 2 >= s.size else None)
            else:
                vals = [None] * len(yrs)
            if any(v is not None for v in vals):
                cells.append({"lat": round(c_lat, 3), "lon": round(c_lon, 3), "values": vals})
            c_lon += step
        c_lat += step

    grid = {"variable": CHECK["id"], "unit": CHECK["unit"], "step": step, "years": yrs, "cells": cells}
    problems = validate_grid(grid, CHECK)
    for p in problems:
        print("  " + p)
    if any(p.startswith("❌") for p in problems):
        sys.exit("Stopped: the GISTEMP grid failed the data contract.")
    cfg.OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(grid, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {OUT.relative_to(cfg.ROOT)}: {len(cells)} cells, {yrs[0]}–{yrs[-1]}")

    # 3) register it in the manifest (keeps everything else)
    mp = cfg.OUT_DIR / "manifest.json"
    if mp.exists():
        m = read_json(mp)
        m["checks"] = [c for c in m.get("checks", []) if c["id"] != CHECK["id"]] + [CHECK]
        mp.write_text(json.dumps(m, indent=2, ensure_ascii=False), encoding="utf-8")
        print("Added the GISTEMP cross-check to manifest.json")
    else:
        print("⚠ manifest.json not found: run build.py first, then this script again.")

    # 4) how often do the two NASA datasets agree?
    tp = cfg.OUT_DIR / "grid_temperature.json"
    if tp.exists():
        t = read_json(tp)
        chk = {(c["lat"], c["lon"]): c["values"] for c in cells}
        n = same = both = opposite = 0
        for c in t["cells"]:
            a = analyse(t["years"], c["values"])
            if not a["significant"] or (c["lat"], c["lon"]) not in chk:
                continue
            b = analyse(yrs, chk[(c["lat"], c["lon"])])
            if b["per_decade"] is None:
                continue
            n += 1
            s = np.sign(a["per_decade"]) == np.sign(b["per_decade"])
            same += s
            both += s and b["significant"]
            opposite += (not s) and b["significant"]
        if n:
            print(f"\nCROSS-CHECK  (MERRA-2 significant trends: {n} cells)")
            print(f"  same direction in GISTEMP:              {same / n:6.1%}")
            print(f"  same direction AND significant in both: {both / n:6.1%}")
            print(f"  significant in OPPOSITE directions:     {opposite / n:6.1%}")
    print("\nDone. Refresh the website (Ctrl+Shift+R).")


if __name__ == "__main__":
    build()
