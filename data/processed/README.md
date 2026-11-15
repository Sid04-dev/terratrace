# data/processed — what the website reads

`python pipeline/build.py` writes here:
- `manifest.json`
- `grid_<variable>.json` (one per variable)

Format: see `docs/DATA_CONTRACT.md`. Check with `python pipeline/validate.py`.

**This folder is empty right now**, so the website shows DEMO DATA.
Once valid files are here, refresh the page and real data appears.
