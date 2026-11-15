"""
appeears.py — load an AppEEARS *point sample* result (e.g. MOD13C2 NDVI).

How to get the file (about 10 minutes of clicking, then AppEEARS emails you):
  1. https://appeears.earthdatacloud.nasa.gov  → sign in with your Earthdata Login
  2. Extract → Point Sample → Start a new request
  3. Upload  data/raw/appeears_points.csv  (made for you: one point per 5° land grid cell)
  4. Dates: 01-01-2001 to 12-31-2024
  5. Product: MOD13A3.061 (Terra Vegetation Indices, 1000m, Monthly)
     Layer:   _1_km_monthly_NDVI   (only this one)
     Note: AppEEARS doesn't offer the 0.05° MOD13C2, so each value is the 1 km
     pixel at the grid-cell centre, not a cell average. Say so in METHODOLOGY.md.
  6. Submit. When the email arrives, download the *results* CSV
     (the big one, NOT the QA-lookup / metadata files) and save it as
     data/raw/appeears_ndvi.csv
  7. python pipeline/build.py --only vegetation

This loader looks for the date column and the column whose name contains the
layer name, so small format differences between AppEEARS versions don't matter.
"""
from __future__ import annotations

import pandas as pd


def load(var: dict, cells, cfg) -> pd.DataFrame:
    path = cfg.RAW_DIR / var["csv"]
    if not path.exists():
        raise FileNotFoundError(f"{path} not found — follow the steps at the top of pipeline/sources/appeears.py")
    df = pd.read_csv(path)
    cols = {c.lower(): c for c in df.columns}
    lat = cols.get("latitude") or cols.get("lat")
    lon = cols.get("longitude") or cols.get("lon")
    date = cols.get("date")
    layer = var.get("layer", "ndvi").lower()
    vcol = next((c for c in df.columns if layer in c.lower() and "qa" not in c.lower() and "pixel" not in c.lower()), None)
    if not (lat and lon and date and vcol):
        raise ValueError(f"Couldn't find latitude/longitude/date/{layer} columns in {path.name}. Columns are: {list(df.columns)}")
    out = pd.DataFrame({
        "lat": pd.to_numeric(df[lat], errors="coerce"),
        "lon": pd.to_numeric(df[lon], errors="coerce"),
        "value": pd.to_numeric(df[vcol], errors="coerce"),
    })
    d = pd.to_datetime(df[date], errors="coerce")
    out["year"], out["month"] = d.dt.year, d.dt.month
    out = out.dropna(subset=["lat", "lon", "year", "month"])
    # AppEEARS normally applies the scale factor already (NDVI between -1 and 1).
    # If values look like raw integers (e.g. 8500), scale them.
    if out["value"].abs().max() > 2:
        out["value"] = out["value"] * float(var.get("scale_factor", 0.0001))
    out[["year", "month"]] = out[["year", "month"]].astype(int)
    print(f"  AppEEARS: {len(out):,} rows from column '{vcol}'")
    return out[["lat", "lon", "year", "month", "value"]]
