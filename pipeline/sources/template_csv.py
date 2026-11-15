"""
template_csv.py — load ANY dataset you've already turned into a CSV.

Use this for the challenge's own datasets (MODIS NDVI, FIRMS fires, NISAR, ...).
However you download them (Earthdata Search, AppEEARS, Giovanni, FIRMS archive),
export / convert to a CSV in data/raw/ with these columns:

    lat, lon, year, month, value

  • one row per location per month
    (yearly-only data? use month = 1 and add  "min_months": 1  to that variable in config.py)
  • lat/lon in decimal degrees (south / west are negative)
  • value in the unit you wrote in config.py
  • leave the cell EMPTY when there is no data (don't write 0!)

Then set  "source_type": "template_csv", "csv": "your_file.csv"  in config.py.
"""
from __future__ import annotations

import pandas as pd

REQUIRED = ["lat", "lon", "year", "month", "value"]


def load(var: dict, cells, cfg) -> pd.DataFrame:
    path = cfg.RAW_DIR / var["csv"]
    if not path.exists():
        raise FileNotFoundError(f"{path} not found. Put your CSV in data/raw/ (see template_csv.py)")
    df = pd.read_csv(path)
    df.columns = [c.strip().lower() for c in df.columns]
    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        raise ValueError(f"{path.name} is missing columns {missing}. Needs: {REQUIRED}")
    df = df[REQUIRED].copy()
    for c in REQUIRED:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna(subset=["lat", "lon", "year", "month"])
    df[["year", "month"]] = df[["year", "month"]].astype(int)
    return df
