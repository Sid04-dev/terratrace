# TerraTrace

**Find it. Prove it. Cite it.** A trend detective for planet Earth.

NASA Space Apps Challenge 2026 · *Be an Earth System Trend Detective* · Team **The Hotspot** (Abu Dhabi)

**Live site: https://terratrace.pages.dev** (free, no login, works on a phone)

**Team:** Sidharth Gopakumar, Arkha Biswas, Syed Mujeebuddin, Mohammed Fahad, Mehdi Azzedine Ouldbeziou

---

## What it does

Click any place on a 3D globe, search a city, or pick a one-click example. TerraTrace gives you that place's 2001–2024 trend for **air temperature, rainfall or root-zone soil moisture**, and then checks it the way a climate scientist would:

| Question | Method |
|---|---|
| Is there a real trend? | Mann–Kendall test with the **Hamed–Rao correction** for autocorrelation |
| How fast, and how sure? | **Sen's slope** with a **95% confidence interval** (Gilbert 1987) |
| Could it be one of many false alarms on the map? | **Benjamini–Hochberg false discovery rate**, per variable |
| Is the "trend" really one sudden jump? | **Step-change test** (one step vs a straight line) |
| Which single years were extreme? | **Unusual years**: detrended robust z-score, \|z\| ≥ 2 |
| Does a second NASA record agree? | **Cross-check** against an independent NASA dataset (below) |

Every result is written up with its limits, and one click exports a two-page scientific fact sheet (PDF), a nine-step investigation report, CSV data, and APA, Harvard and BibTeX citations.

### The cross-check: no trend is trusted on one record alone

| Layer | Main record | Second NASA record | Same direction | Significant in both |
|---|---|---|---|---|
| Temperature | NASA POWER T2M (MERRA-2 reanalysis) | NASA GISS GISTEMP v4 (stations) | 95% | 83% |
| Rainfall | NASA GPCP V3.3 (satellite + gauge) | NASA POWER PRECTOTCORR (MERRA-2) | 68% | 29% |
| Soil moisture | NASA POWER GWETROOT (MERRA-2) | NASA GLDAS-2.1 Noah | 59% | 33% |

Where the two records disagree, TerraTrace says so (*Cross-Dataset Divergence Note*) and keeps that place out of the rankings. Example: MERRA-2 shows the Central African Republic cooling at −0.88 °C/decade, GISTEMP shows warming at +0.29 °C/decade, and the step-change test finds the "cooling" is a single drop around 2007.

The rainfall and soil-moisture pairs share some precipitation inputs, so they are only partly independent. Temperature compares a model with station records.

### Headline findings (2001–2024, 5° grid)

- Between **37% (MERRA-2) and 54% (GISTEMP)** of Earth's surface warmed significantly.
- North of 66°N warmed about **2.5×** faster than 60°S–60°N, in both records.
- Central Chile: rainfall **−23.1% per decade** (95% CI −34% to −9%, p = 0.001), confirmed by MERRA-2. This is consistent with the 25–45% deficits reported by Garreaud et al. (2017). It does not pass the map-wide FDR test on its own, and the app says so.
- After FDR control, 528 of 909 significant temperature trends survive, 17 of 336 rainfall trends and 142 of 214 soil-moisture trends.

---

## Run it locally

The site is static (plain HTML and JavaScript ES modules, with no build step). Every library, texture and map is included, so it runs offline.

- **Windows:** double-click `start.bat`, then open http://localhost:8000
- **Mac/Linux:** `./start.sh`
- **Any system:** `python -m http.server 8000`

Opening `index.html` directly won't work, because browsers block data loading from `file://`.

### Controls

| Key | Action |
|---|---|
| click / drag / scroll | pick a place / rotate / zoom |
| `Ctrl K` or `/` | search places or coordinates (`25.8, 55.9`) |
| `M` | Trend view ↔ Timeline view |
| `Space` | play the timeline |
| `T` | guided tour |
| `H` | hotspots |
| `A` | Ask TerraTrace (a rule-based assistant that only quotes loaded data) |

Links remember the place and variable, for example `#v=temperature&lat=25.8&lon=55.9`.

---

## Rebuild the data

```bash
pip install -r pipeline/requirements.txt
python pipeline/build.py                 # NASA POWER (MERRA-2): temperature, rainfall, soil moisture
python pipeline/crosscheck_gpcp.py       # downloads NASA GPCP V3.3 rainfall
python pipeline/use_gpcp_rainfall.py     # makes GPCP the main rainfall layer, MERRA-2 the check
python pipeline/crosscheck_gistemp.py    # NASA GISTEMP v4 temperature check
python pipeline/crosscheck_gldas.py      # NASA GLDAS-2.1 soil-moisture check
python pipeline/autocorr_check.py        # Hamed–Rao autocorrelation check
python pipeline/jump_check.py            # step-change check
python pipeline/validate.py              # checks every output file against the data contract
```

The GPCP and GLDAS scripts download from NASA GES DISC and need a free [NASA Earthdata login](https://urs.earthdata.nasa.gov/). Set `EARTHDATA_USER` and `EARTHDATA_PASS` as environment variables, or the script asks (the password is hidden and never saved). Raw downloads (about 3 GB) go in `data/raw/` and are not stored in this repository.

The Python pipeline (`pipeline/trend.py`) and the browser (`js/trend.js`) run the same statistics; their p-values agree to within 1 × 10⁻⁶.

Full methods, cleaning rules and limitations: **[docs/METHODOLOGY.md](docs/METHODOLOGY.md)**. The data format: **[docs/DATA_CONTRACT.md](docs/DATA_CONTRACT.md)**.

---

## Project layout

```
index.html, css/, style.css   the app
js/                           globe, panel, statistics (trend, jump, anomaly, science),
                              cross-check, fact sheet, exports, assistant, glossary
data/processed/               the gridded NASA data the site reads (JSON)
data/sample/                  small example files showing the format
pipeline/                     Python: download → clean → annualise → test → validate
docs/                         methodology, data contract, comparison with other tools
vendor/, assets/              offline copies of libraries, fonts, textures, borders
```

---

## Data sources

- NASA POWER (MERRA-2): T2M, PRECTOTCORR, GWETROOT. NASA Langley Research Center. https://power.larc.nasa.gov/
- NASA GPCP V3.3 monthly 0.5°. NASA GES DISC. https://disc.gsfc.nasa.gov/datasets/GPCPMON_3.3/summary
- NASA GISTEMP v4 (1200 km smoothing). NASA Goddard Institute for Space Studies. https://data.giss.nasa.gov/gistemp/
- NASA GLDAS Noah Land Surface Model L4 monthly 1.0° V2.1. NASA GES DISC. doi:10.5067/LWTYSMP3VM5Z

TerraTrace is a student project for the NASA Space Apps Challenge. It is not affiliated with or endorsed by NASA.

## Built with

[globe.gl](https://github.com/vasturiano/globe.gl) and [three.js](https://threejs.org) (MIT), [Chart.js](https://www.chartjs.org) (MIT), [GSAP](https://gsap.com), [d3-geo](https://github.com/d3/d3-geo) and [topojson-client](https://github.com/topojson/topojson-client) (ISC), [world-atlas](https://github.com/topojson/world-atlas) / Natural Earth (public domain), and Earth textures from the three-globe examples (NASA Blue Marble imagery).

## License

MIT. See [LICENSE](LICENSE).
