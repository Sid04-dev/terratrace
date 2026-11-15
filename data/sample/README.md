# data/sample — example files (NOT loaded by the app)

Tiny hand-made examples of the data contract, to read:
- `manifest.json` — table of contents
- `grid_temperature.json` — 3 cells × 8 years (note the `null` for a missing year)
- `series_example.json` — what the frontend builds for one clicked place

Check them: `python pipeline/validate.py data/sample`
