# 📜 Data Contract (version 1)

This is the agreement between the **data team** and the **frontend**.
If the files in `data/processed/` follow these rules, the website works. No frontend changes are needed.

Both `pipeline/validate.py` and the website (`js/data.js`) check these rules automatically.

---

## Why grids?

A student can click **anywhere**, so we can't prepare files for named cities only.
Instead we split the world into square **grid cells** (default 5° × 5°, about 550 km) and store one time series per cell.
A click is matched to the nearest cell.

---

## File 1: `data/processed/manifest.json`

The table of contents. One entry per variable.

```json
{
  "contract_version": 1,
  "title": "TerraTrace dataset",
  "generated": "2026-11-14T10:00:00+00:00",
  "is_demo": false,
  "years": [2001, 2024],
  "variables": [
    {
      "id": "temperature",
      "label": "Air temperature (2 m)",
      "unit": "°C",
      "aggregation": "annual mean",
      "decimals": 2,
      "file": "grid_temperature.json",
      "source": {
        "name": "NASA POWER",
        "dataset": "T2M (MERRA-2)",
        "publisher": "NASA Langley Research Center",
        "url": "https://power.larc.nasa.gov/",
        "version": "",
        "doi": "",
        "year": 2026,
        "citation": "(optional) official citation text, used as-is for APA"
      }
    }
  ]
}
```

| Field | Required | Rule |
|---|---|---|
| `contract_version` | ✅ | must be `1` |
| `is_demo` | | `true` shows the yellow DEMO badge. Set `false` for real data |
| `variables[].id` | ✅ | lowercase letters, numbers, `_` only. Known ids get nice icons/colours: `temperature`, `precipitation`, `vegetation`, `fire` |
| `variables[].label` | ✅ | human-readable name shown in the app |
| `variables[].unit` | ✅ | shown everywhere. `°C` trends are shown in absolute units; any other unit is shown as **% change per decade** |
| `variables[].file` | ✅ | the grid file name in the same folder |
| `variables[].source` | ✅ | used for citations. `name` must not be empty. Fill in `doi`/`version` if the dataset has them |
| `variables[].decimals` | | how many decimals to display (default 2) |
| `variables[].trend_display` | | force `"absolute"` or `"relative"` |

---

## File 2: `data/processed/grid_<id>.json`

```json
{
  "variable": "temperature",
  "unit": "°C",
  "step": 5,
  "years": [2001, 2002, 2003, "...", 2024],
  "cells": [
    { "lat": 27.5, "lon": 57.5, "values": [27.81, 27.95, null, "...", 28.39] },
    { "lat": 52.5, "lon": -2.5, "values": [10.12, 10.48, 10.21, "...", 10.58],
      "trend": { "per_decade": 0.31, "p_value": 0.02, "significant": true } }
  ]
}
```

| Rule | Why |
|---|---|
| `years` = consecutive, ascending, at least 6 | trend tests need a real time series |
| `step` = grid size in degrees | used to match clicks to cells |
| `lat`/`lon` = **centre** of the cell, `lat` −90…90, `lon` −180…180 | e.g. with step 5: 2.5, 7.5, 12.5… |
| `values.length == years.length` | one value per year, same order |
| missing = **`null`**, never `-999`, `0`, `NaN` or `""` | `-999` would be averaged as a real number and wreck the trend. The validator rejects anything ≤ −999 |
| cells with *all* nulls can be left out | e.g. ocean cells for a land-only variable. The app shows "no data here" |
| `trend` is optional | if missing, the website computes it (same maths as `pipeline/trend.py`) |

Values must be **annual** (one per year) and already **cleaned** (see `docs/METHODOLOGY.md`).

Size tip: keep each grid file under about 10 MB. A 5° world grid with 24 years is about 0.3 MB.

---

## What the frontend builds from it (for reference)

When a user clicks a place, `js/data.js → getSeries()` produces this object. `panel.js`, `story.js` and `exporter.js` only ever use this:

```json
{
  "location": { "lat": 25.79, "lon": 55.94, "cell_lat": 27.5, "cell_lon": 57.5, "cell_size": 5 },
  "variable": "temperature",
  "label": "Air temperature (2 m)",
  "unit": "°C",
  "source": { "name": "NASA POWER", "...": "..." },
  "years": [2001, "...", 2024],
  "values": [27.81, "...", 28.39],
  "trend": {
    "per_decade": 0.31, "rel_per_decade": 1.1, "p_value": 0.02, "significant": true,
    "direction": "rising", "completeness": 0.96, "n": 23,
    "first_mean": 27.9, "last_mean": 28.4,
    "max": { "year": 2023, "value": 28.9 }, "min": { "year": 2004, "value": 27.5 }
  },
  "is_demo": false
}
```

Full example files are in `data/sample/`.

---

## Changing the contract

Agree as a team first. Then update **all three places together**: this file, `js/data.js` (validateManifest / validateGrid) and `pipeline/validate.py`.
