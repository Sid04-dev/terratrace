"""
clean.py — the cleaning rules. Every rule here should be written up in
docs/METHODOLOGY.md so judges can see your data is trustworthy.

Input  (from any loader in pipeline/sources/):  a MONTHLY tidy table
        columns: lat, lon, year, month, value
Output (to build.py):                           an ANNUAL tidy table
        columns: lat, lon, year, value        (value = NaN when missing)
"""
from __future__ import annotations

import calendar

import numpy as np
import pandas as pd

FILL_VALUES = [-999, -999.0, -9999, -99, -32768, 65535]  # common NASA "no data" codes


def report(df: pd.DataFrame, label: str) -> None:
    n = len(df)
    miss = int(df["value"].isna().sum()) if n else 0
    print(f"  [{label}] rows={n:,}  missing={miss:,} ({(miss / n * 100 if n else 0):.1f}%)")


def replace_fill_values(df: pd.DataFrame, extra=()) -> pd.DataFrame:
    """Rule 1: NASA fill values (e.g. -999) mean 'no data' → NaN. Never average them!"""
    df = df.copy()
    df.loc[df["value"].isin(list(FILL_VALUES) + list(extra)), "value"] = np.nan
    return df


def enforce_valid_range(df: pd.DataFrame, lo: float, hi: float) -> pd.DataFrame:
    """Rule 2: physically impossible values → NaN (and we print how many, so we can check them)."""
    df = df.copy()
    bad = (df["value"] < lo) | (df["value"] > hi)
    if bad.any():
        print(f"  ⚠ {int(bad.sum())} values outside [{lo}, {hi}] set to missing. Examples:")
        print(df[bad].head(5).to_string(index=False))
    df.loc[bad, "value"] = np.nan
    return df


def to_annual(df: pd.DataFrame, how: str, min_months: int) -> pd.DataFrame:
    """
    Rule 3: monthly → annual, but ONLY if the year has enough valid months.
      how = "mean"            e.g. temperature, NDVI
            "sum"             e.g. fire counts per month
            "sum_daily_rate"  value is a mm/day monthly average → mm/yr total
    """
    df = df.copy()
    if how == "sum_daily_rate":
        df["value"] = df["value"] * df.apply(lambda r: calendar.monthrange(int(r.year), int(r.month))[1], axis=1)
        how = "sum"
    is_monthly = df["month"].nunique() > 1
    g = df.groupby(["lat", "lon", "year"])["value"]
    valid = g.count()
    agg = g.mean() if how == "mean" else g.sum(min_count=1)
    if how == "sum" and is_monthly:
        # scale up partial years so a year with 10 valid months isn't unfairly low
        agg = agg * (12 / valid.replace(0, np.nan))
    agg[valid < min_months] = np.nan
    return agg.rename("value").reset_index()


def complete_years(df: pd.DataFrame, start: int, end: int) -> pd.DataFrame:
    """Rule 4: every cell gets every year (missing years become NaN), so arrays line up."""
    cells = df[["lat", "lon"]].drop_duplicates()
    years = pd.DataFrame({"year": range(start, end + 1)})
    full = cells.merge(years, how="cross")
    return full.merge(df, on=["lat", "lon", "year"], how="left")


def snap_to_grid(df: pd.DataFrame, step: float) -> pd.DataFrame:
    """Rule 5: move points to the centre of their grid cell, averaging points in the same cell."""
    df = df.copy()
    df["lat"] = (np.floor((df["lat"] + 90) / step) * step - 90 + step / 2).round(3)
    df["lon"] = (np.floor((df["lon"] + 180) / step) * step - 180 + step / 2).round(3)
    keys = ["lat", "lon", "year"] + (["month"] if "month" in df.columns else [])
    return df.groupby(keys, as_index=False)["value"].mean()


def clean_monthly(df: pd.DataFrame, var: dict, cfg) -> pd.DataFrame:
    """The full recipe. build.py calls this for every variable."""
    report(df, "raw")
    df = replace_fill_values(df)
    report(df, "after fill values")
    lo, hi = var.get("valid_range", (-np.inf, np.inf))
    df = enforce_valid_range(df, lo, hi)
    df = df[(df["year"] >= cfg.START_YEAR) & (df["year"] <= cfg.END_YEAR)]
    df = snap_to_grid(df, cfg.GRID_STEP)
    annual = to_annual(df, var.get("annual", "mean"), var.get("min_months", cfg.MIN_MONTHS_PER_YEAR))
    annual = complete_years(annual, cfg.START_YEAR, cfg.END_YEAR)
    report(annual, "annual")
    return annual
