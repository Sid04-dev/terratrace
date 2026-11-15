# data/raw — downloaded NASA files go here

- `power/` is created automatically by `pipeline/sources/nasa_power.py` (cached API responses).
- Put any other downloaded/converted datasets here as CSV with columns:
  `lat, lon, year, month, value`  (see `pipeline/sources/template_csv.py`).
- Never edit raw files by hand. All fixes happen in `pipeline/clean.py` so they're documented and repeatable.
- These files can be large, so they're ignored by git (`.gitignore`).
