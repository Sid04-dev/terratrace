"""
crosscheck_gpcp.py — an independent NASA rainfall record to check our rainfall trends.

Our rainfall layer is MERRA-2 (NASA POWER PRECTOTCORR). In some regions it jumps
between years because the rain-gauge data behind it changed. NASA GPCP (Global
Precipitation Climatology Project, monthly 0.5°) combines satellites and rain
gauges and is built to be a consistent climate record. This script puts GPCP on
the SAME 5° grid so the website can say whether the two datasets agree.

    python pipeline/crosscheck_gpcp.py

  1. asks NASA's catalogue (CMR) for the monthly GPCP files for 2001–2024
  2. downloads them into data/raw/gpcp/ with your Earthdata login (once; re-runs reuse them)
  3. monthly mm/day → annual total mm/yr (years with < 9 valid months = blank)
  4. 0.5° cells → our 5° cells (area-weighted by cos(latitude))
  5. writes data/processed/check_precipitation_gpcp.json + a "checks" entry in manifest.json
  6. prints how often the two datasets agree

Needs:  pip install netCDF4      and an Earthdata account (the same one you used for AppEEARS)
Login:  it asks for your username and password (the password is not shown or saved).
        Or set them first:  $env:EARTHDATA_USER="you"; $env:EARTHDATA_PASS="..."
"""
from __future__ import annotations

import calendar
import getpass
import json
import os
import re
import sys
import warnings
from pathlib import Path

import numpy as np

warnings.filterwarnings("ignore", category=RuntimeWarning)
sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as cfg  # noqa: E402
from trend import analyse  # noqa: E402
from validate import validate_grid  # noqa: E402

CMR = "https://cmr.earthdata.nasa.gov/search/granules.json"
RAW = cfg.RAW_DIR / "gpcp"
OUT = cfg.OUT_DIR / "check_precipitation_gpcp.json"
CHECK = {
    "id": "precipitation_check",
    "of": "precipitation",
    "label": "Precipitation (GPCP)",
    "unit": "mm/yr",
    "aggregation": "annual total",
    "decimals": 0,
    "file": OUT.name,
    "basis": "satellites and rain gauges",
    "source": {
        "name": "NASA GPCP",
        "dataset": "GPCPMON monthly 0.5° (satellite-gauge)",
        "publisher": "NASA GES DISC",
        "url": "https://disc.gsfc.nasa.gov/datasets/GPCPMON_3.3/summary",
        "version": "",
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


# ---------------------------------------------------------------- download
def find_granules():
    import requests
    for version in ("3.3", "3.2"):
        urls, page = [], 1
        while True:
            r = requests.get(CMR, params={
                "short_name": "GPCPMON", "version": version, "page_size": 500, "page_num": page,
                "temporal": f"{cfg.START_YEAR}-01-01T00:00:00Z,{cfg.END_YEAR}-12-31T23:59:59Z",
            }, timeout=60)
            r.raise_for_status()
            entries = r.json().get("feed", {}).get("entry", [])
            for e in entries:
                for link in e.get("links", []):
                    h = link.get("href", "")
                    if h.startswith("https") and re.search(r"\.nc4?$", h) and "opendap" not in h:
                        urls.append(h)
                        break
            if len(entries) < 500:
                break
            page += 1
        if urls:
            CHECK["source"]["version"] = version
            CHECK["source"]["dataset"] = f"GPCPMON V{version}, monthly 0.5° (satellite-gauge)"
            CHECK["source"]["url"] = f"https://disc.gsfc.nasa.gov/datasets/GPCPMON_{version}/summary"
            print(f"Found {len(urls)} monthly GPCP V{version} files for {cfg.START_YEAR}–{cfg.END_YEAR}")
            return sorted(set(urls))
    sys.exit("Could not find GPCPMON files in NASA's catalogue. Check your internet connection.")


def earthdata_session():
    import requests

    class S(requests.Session):
        AUTH_HOST = "urs.earthdata.nasa.gov"

        def rebuild_auth(self, prepared, response):  # keep the login only for NASA's login server
            if "Authorization" in prepared.headers:
                old = requests.utils.urlparse(response.request.url).hostname
                new = requests.utils.urlparse(prepared.url).hostname
                if old != new and old != self.AUTH_HOST and new != self.AUTH_HOST:
                    del prepared.headers["Authorization"]

    user = os.environ.get("EARTHDATA_USER") or input("Earthdata username: ").strip()
    pw = os.environ.get("EARTHDATA_PASS") or getpass.getpass("Earthdata password (hidden): ")
    s = S()
    s.auth = (user, pw)
    return s


def download():
    RAW.mkdir(parents=True, exist_ok=True)
    have = {p.name for p in RAW.glob("*.nc*")}
    urls = find_granules()
    todo = [u for u in urls if u.rsplit("/", 1)[-1] not in have]
    if not todo:
        print("All GPCP files already downloaded.")
        return
    s = earthdata_session()
    for i, u in enumerate(todo, 1):
        name = u.rsplit("/", 1)[-1]
        r = s.get(u, timeout=120)
        if r.status_code == 401:
            sys.exit("Earthdata login failed (401). Check your username/password, and that you approved "
                     "'NASA GESDISC DATA ARCHIVE' under Applications in your Earthdata profile.")
        r.raise_for_status()
        if r.content[:4] not in (b"\x89HDF", b"CDF\x01", b"CDF\x02"):
            sys.exit(f"{name}: NASA sent a web page instead of a data file. Usually this means the "
                     "'NASA GESDISC DATA ARCHIVE' application is not approved in your Earthdata profile.")
        (RAW / name).write_bytes(r.content)
        if i % 12 == 0 or i == len(todo):
            print(f"  downloaded {i}/{len(todo)}")


# ---------------------------------------------------------------- process
def read_month(path: Path):
    from netCDF4 import Dataset
    ds = Dataset(path)
    names = list(ds.variables)
    var = next((n for n in names if "sat_gauge" in n.lower()), None) or next(
        (n for n in names if "precip" in n.lower() and "error" not in n.lower() and ds.variables[n].ndim >= 2), None)
    if var is None:
        raise RuntimeError(f"{path.name}: no precipitation variable found ({names})")
    lat = np.array(ds.variables[next(n for n in names if n.lower() in ("lat", "latitude"))][:], dtype=float)
    lon = np.array(ds.variables[next(n for n in names if n.lower() in ("lon", "longitude"))][:], dtype=float)
    v = np.ma.filled(ds.variables[var][:].astype(float), np.nan).squeeze()
    ds.close()
    v[(v < 0) | (v > 500)] = np.nan                     # fill values / impossible mm/day
    if v.shape != (len(lat), len(lon)):
        v = v.T
    lon = np.where(lon > 180, lon - 360, lon)
    return lat, lon, v


def build():
    if '--offline' not in sys.argv:  # --offline: only process files already in data/raw/gpcp/
        download()
    files = sorted(RAW.glob("*.nc*"))
    months = {}
    for f in files:
        m = re.search(r"(19|20)(\d{2})(0[1-9]|1[0-2])", f.name)
        if not m:
            continue
        y, mo = int(m.group(1) + m.group(2)), int(m.group(3))
        if cfg.START_YEAR <= y <= cfg.END_YEAR:
            months[(y, mo)] = f
    if not months:
        sys.exit("No GPCP files found in data/raw/gpcp/.")
    print(f"Processing {len(months)} monthly files …")

    step = cfg.GRID_STEP
    yrs = list(range(cfg.START_YEAR, cfg.END_YEAR + 1))
    centres = [(round(-90 + step / 2 + i * step, 3), round(-180 + step / 2 + j * step, 3))
               for i in range(int(180 / step)) for j in range(int(360 / step))]
    monthly = {c: np.full((len(yrs), 12), np.nan) for c in centres}
    groups = None
    for (y, mo), f in sorted(months.items()):
        lat, lon, v = read_month(f)
        if groups is None:  # which fine cells fall in which 5° cell (computed once)
            w = np.cos(np.radians(lat))
            groups = []
            for c in centres:
                li = np.where((lat >= c[0] - step / 2) & (lat < c[0] + step / 2))[0]
                lj = np.where((lon >= c[1] - step / 2) & (lon < c[1] + step / 2))[0]
                groups.append((li, lj, np.repeat(w[li][:, None], len(lj), axis=1)))
        for c, (li, lj, ww) in zip(centres, groups):
            if not len(li) or not len(lj):
                continue
            sub = v[np.ix_(li, lj)]
            ok = ~np.isnan(sub)
            if ok.sum() * 2 >= sub.size:
                monthly[c][y - yrs[0], mo - 1] = np.sum(sub[ok] * ww[ok]) / np.sum(ww[ok])

    cells = []
    for c in centres:
        vals = []
        for k, y in enumerate(yrs):
            rates = monthly[c][k]
            days = np.array([calendar.monthrange(y, m)[1] for m in range(1, 13)])
            ok = ~np.isnan(rates)
            if ok.sum() < cfg.MIN_MONTHS_PER_YEAR:
                vals.append(None)
            else:  # mm/day × days, scaled up for the odd missing month (same rule as clean.py)
                vals.append(round(float(np.sum(rates[ok] * days[ok]) * 12 / ok.sum()), 1))
        if any(x is not None for x in vals):
            cells.append({"lat": c[0], "lon": c[1], "values": vals})

    grid = {"variable": CHECK["id"], "unit": CHECK["unit"], "step": step, "years": yrs, "cells": cells}
    problems = validate_grid(grid, CHECK)
    for p in problems:
        print("  " + p)
    if any(p.startswith("❌") for p in problems):
        sys.exit("Stopped: the GPCP grid failed the data contract.")
    OUT.write_text(json.dumps(grid, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {OUT.relative_to(cfg.ROOT)}: {len(cells)} cells, {yrs[0]}–{yrs[-1]}")

    mp = cfg.OUT_DIR / "manifest.json"
    if mp.exists():
        m = read_json(mp)
        m["checks"] = [c for c in m.get("checks", []) if c["id"] != CHECK["id"]] + [CHECK]
        mp.write_text(json.dumps(m, indent=2, ensure_ascii=False), encoding="utf-8")
        print("Added the GPCP cross-check to manifest.json")

    tp = cfg.OUT_DIR / "grid_precipitation.json"
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
            print(f"\nCROSS-CHECK  (MERRA-2 significant rainfall trends: {n} cells)")
            print(f"  same direction in GPCP:                 {same / n:6.1%}")
            print(f"  same direction AND significant in both: {both / n:6.1%}")
            print(f"  significant in OPPOSITE directions:     {opposite / n:6.1%}")
    print("\nDone. Refresh the website (Ctrl+Shift+R).")


if __name__ == "__main__":
    build()
