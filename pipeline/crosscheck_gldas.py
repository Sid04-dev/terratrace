"""
crosscheck_gldas.py — an independent NASA soil-moisture record to check our soil-moisture trends.

Our soil-moisture layer is MERRA-2 root-zone wetness (NASA POWER GWETROOT).
NASA GLDAS-2.1 (Noah land model, monthly 1°) is a separate system: a different
land model, driven by NOAA GDAS weather analyses, GPCP satellite-gauge rainfall
and AGRMET radiation. This script puts GLDAS root-zone soil moisture on the SAME
5° grid so the website can say whether the two records agree.

    python pipeline/crosscheck_gldas.py

  1. asks NASA's catalogue (CMR) for the monthly GLDAS_NOAH10_M V2.1 files, 2001–2024
  2. downloads them into data/raw/gldas/ with your Earthdata login (once; re-runs reuse them)
  3. monthly RootMoist_inst (kg/m²) → annual mean (years with < 9 valid months = blank)
  4. 1° cells → our 5° cells (area-weighted by cos(latitude))
  5. writes data/processed/check_soil_moisture_gldas.json + a "checks" entry in manifest.json
  6. prints how often the two records agree

Needs:  pip install netCDF4 requests numpy     and the Earthdata account you used for GPCP
Login:  set them first:  $env:EARTHDATA_USER="you"; $env:EARTHDATA_PASS="..."
        (or it asks; the password is not shown or saved)
Re-run without downloading:  python pipeline/crosscheck_gldas.py --offline
"""
from __future__ import annotations

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
RAW = cfg.RAW_DIR / "gldas"
OUT = cfg.OUT_DIR / "check_soil_moisture_gldas.json"
VAR = "RootMoist_inst"
CHECK = {
    "id": "soil_moisture_check",
    "of": "soil_moisture",
    "label": "Root-zone soil moisture (GLDAS)",
    "unit": "kg/m²",
    "aggregation": "annual mean",
    "decimals": 1,
    "file": OUT.name,
    "short": "NASA GLDAS",
    "basis": "a separate land model driven by GPCP satellite-gauge rainfall and weather analyses",
    "source": {
        "name": "NASA GLDAS",
        "dataset": "Noah land model V2.1, monthly 1° (RootMoist_inst)",
        "publisher": "NASA GES DISC",
        "url": "https://disc.gsfc.nasa.gov/datasets/GLDAS_NOAH10_M_2.1/summary",
        "version": "2.1",
        "doi": "10.5067/LWTYSMP3VM5Z",
        "year": 2020,
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
    urls, page = [], 1
    while True:
        r = requests.get(CMR, params={
            "short_name": "GLDAS_NOAH10_M", "version": "2.1", "page_size": 500, "page_num": page,
            "temporal": f"{cfg.START_YEAR}-01-01T00:00:00Z,{cfg.END_YEAR}-12-31T23:59:59Z",
        }, timeout=60)
        r.raise_for_status()
        entries = r.json().get("feed", {}).get("entry", [])
        for e in entries:
            for link in e.get("links", []):
                h = link.get("href", "")
                if h.startswith("https") and h.endswith(".nc4") and "opendap" not in h:
                    urls.append(h)
                    break
        if len(entries) < 500:
            break
        page += 1
    if not urls:
        sys.exit("Could not find GLDAS_NOAH10_M V2.1 files in NASA's catalogue. Check your internet connection.")
    print(f"Found {len(urls)} monthly GLDAS-2.1 files for {cfg.START_YEAR}–{cfg.END_YEAR}")
    return sorted(set(urls))


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
    have = {p.name for p in RAW.glob("*.nc4") if p.stat().st_size > 10_000}
    urls = find_granules()
    todo = [u for u in urls if u.rsplit("/", 1)[-1] not in have]
    if not todo:
        print("All GLDAS files already downloaded.")
        return
    s = earthdata_session()
    total = 0
    for i, u in enumerate(todo, 1):
        name = u.rsplit("/", 1)[-1]
        for attempt in range(3):
            try:
                r = s.get(u, timeout=180)
                break
            except Exception as e:  # flaky connection: try again
                if attempt == 2:
                    sys.exit(f"{name}: download failed three times ({e}). Re-run the script; finished files are kept.")
        if r.status_code == 401:
            sys.exit("Earthdata login failed (401). Check your username/password, and that you approved "
                     "'NASA GESDISC DATA ARCHIVE' under Applications in your Earthdata profile.")
        r.raise_for_status()
        if r.content[:4] not in (b"\x89HDF", b"CDF\x01", b"CDF\x02"):
            sys.exit(f"{name}: NASA sent a web page instead of a data file. Usually this means the "
                     "'NASA GESDISC DATA ARCHIVE' application is not approved in your Earthdata profile.")
        (RAW / name).write_bytes(r.content)
        total += len(r.content)
        if i % 12 == 0 or i == len(todo):
            print(f"  downloaded {i}/{len(todo)}  ({total / 1e6:.0f} MB so far)")


# ---------------------------------------------------------------- process
def read_month(path: Path):
    from netCDF4 import Dataset
    ds = Dataset(path)
    lat = np.array(ds.variables["lat"][:], dtype=float)
    lon = np.array(ds.variables["lon"][:], dtype=float)
    v = np.ma.filled(ds.variables[VAR][:].astype(float), np.nan).squeeze()
    ds.close()
    v[(v < 0) | (v > 5000)] = np.nan                    # fill value (-9999) / impossible kg/m²
    if v.shape != (len(lat), len(lon)):
        v = v.T
    lon = np.where(lon > 180, lon - 360, lon)
    return lat, lon, v


def build():
    if "--offline" not in sys.argv:
        download()
    months = {}
    for f in sorted(RAW.glob("*.nc4")):
        m = re.search(r"\.A(\d{4})(\d{2})\.", f.name)
        if not m:
            continue
        y, mo = int(m.group(1)), int(m.group(2))
        if cfg.START_YEAR <= y <= cfg.END_YEAR:
            months[(y, mo)] = f
    if not months:
        sys.exit("No GLDAS files found in data/raw/gldas/.")
    print(f"Processing {len(months)} monthly files …")

    step = cfg.GRID_STEP
    yrs = list(range(cfg.START_YEAR, cfg.END_YEAR + 1))
    centres = [(round(-90 + step / 2 + i * step, 3), round(-180 + step / 2 + j * step, 3))
               for i in range(int(180 / step)) for j in range(int(360 / step))]
    monthly = {c: np.full((len(yrs), 12), np.nan) for c in centres}
    groups = None
    for (y, mo), f in sorted(months.items()):
        lat, lon, v = read_month(f)
        if groups is None:  # which 1° cells fall in which 5° cell (computed once)
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
            if ok.sum() * 3 >= sub.size:   # at least a third of the 5° cell is land with data
                monthly[c][y - yrs[0], mo - 1] = np.sum(sub[ok] * ww[ok]) / np.sum(ww[ok])

    cells = []
    for c in centres:
        vals = []
        for k in range(len(yrs)):
            row = monthly[c][k]
            ok = ~np.isnan(row)
            vals.append(None if ok.sum() < cfg.MIN_MONTHS_PER_YEAR else round(float(np.mean(row[ok])), 2))
        if any(x is not None for x in vals):
            cells.append({"lat": c[0], "lon": c[1], "values": vals})

    grid = {"variable": CHECK["id"], "unit": CHECK["unit"], "step": step, "years": yrs, "cells": cells}
    problems = validate_grid(grid, CHECK)
    for p in problems:
        print("  " + p)
    if any(p.startswith("❌") for p in problems):
        sys.exit("Stopped: the GLDAS grid failed the data contract.")
    OUT.write_text(json.dumps(grid, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {OUT.relative_to(cfg.ROOT)}: {len(cells)} cells, {yrs[0]}–{yrs[-1]}")

    mp = cfg.OUT_DIR / "manifest.json"
    if mp.exists():
        m = read_json(mp)
        m["checks"] = [c for c in m.get("checks", []) if c["id"] != CHECK["id"]] + [CHECK]
        mp.write_text(json.dumps(m, indent=2, ensure_ascii=False), encoding="utf-8")
        print("Added the GLDAS cross-check to manifest.json")

    tp = cfg.OUT_DIR / "grid_soil_moisture.json"
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
            print(f"\nCROSS-CHECK  (MERRA-2 significant soil-moisture trends: {n} cells)")
            print(f"  same direction in GLDAS:                {same / n:6.1%}")
            print(f"  same direction AND significant in both: {both / n:6.1%}")
            print(f"  significant in OPPOSITE directions:     {opposite / n:6.1%}")
    print("\nDone. Refresh the website (Ctrl+Shift+R).")


if __name__ == "__main__":
    build()
