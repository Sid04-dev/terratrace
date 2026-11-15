"""
nasa_power.py — download monthly point data from the NASA POWER API.

  • Free, no login, JSON.          Docs: https://power.larc.nasa.gov/docs/services/api/
  • One request per grid cell, so we CACHE every response in data/raw/power/
    (re-running never downloads the same cell twice).
  • Be polite: small pause between requests. A 5° land-only world grid is
    roughly 800 requests — start it Friday night, not Sunday morning!

TODO(data): open one cached JSON file in data/raw/power/ and confirm the
structure matches what parse() expects (properties → parameter → NAME → "YYYYMM").
If NASA changed the format, fix parse() — nothing else needs to change.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import pandas as pd
import requests

BASE = "https://power.larc.nasa.gov/api/temporal/monthly/point"


def fetch_point(lat, lon, parameter, start, end, cache_dir: Path, community="AG", retries=3):
    cache_dir.mkdir(parents=True, exist_ok=True)
    f = cache_dir / f"{parameter}_{lat:.3f}_{lon:.3f}_{start}_{end}.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    params = {
        "parameters": parameter, "community": community,
        "latitude": round(lat, 3), "longitude": round(lon, 3),
        "start": start, "end": end, "format": "JSON",
    }
    for attempt in range(retries):
        try:
            r = requests.get(BASE, params=params, timeout=60)
            if r.status_code == 429:  # rate limited → wait and retry
                time.sleep(10 * (attempt + 1))
                continue
            r.raise_for_status()
            data = r.json()
            f.write_text(json.dumps(data), encoding="utf-8")
            time.sleep(0.4)
            return data
        except requests.RequestException as e:
            print(f"    retry {attempt + 1}/{retries} for {lat},{lon}: {e}")
            time.sleep(3 * (attempt + 1))
    return None


def parse(data, parameter, lat, lon):
    """POWER JSON → rows of (lat, lon, year, month, value). Month 13 = annual summary → skipped."""
    rows = []
    if not data:
        return rows
    series = data.get("properties", {}).get("parameter", {}).get(parameter, {})
    for k, v in series.items():
        if len(k) != 6:
            continue
        year, month = int(k[:4]), int(k[4:])
        if 1 <= month <= 12:
            rows.append((lat, lon, year, month, v))
    return rows


def load(var: dict, cells, cfg) -> pd.DataFrame:
    """cells = list of (lat, lon) grid centres to download."""
    param = var["power_parameter"]
    cache = cfg.RAW_DIR / "power"
    rows = []
    for i, (lat, lon) in enumerate(cells, 1):
        if i % 25 == 0 or i == 1:
            print(f"  POWER {param}: {i}/{len(cells)} cells")
        data = fetch_point(lat, lon, param, cfg.START_YEAR, cfg.END_YEAR, cache)
        rows += parse(data, param, lat, lon)
    return pd.DataFrame(rows, columns=["lat", "lon", "year", "month", "value"])
