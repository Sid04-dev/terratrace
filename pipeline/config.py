"""
config.py — settings for the TerraTrace data pipeline.

DATA TEAM: this is where you describe each variable and where it comes from.
The frontend reads these descriptions from manifest.json, so whatever you write
here (label, unit, source, citation) is exactly what users and judges will see.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"          # downloaded files, never edited by hand
INTERIM_DIR = ROOT / "data" / "interim"  # cleaned "tidy" tables: lat, lon, year, value
OUT_DIR = ROOT / "data" / "processed"    # final JSON the website reads
LAND_MASK = ROOT / "assets" / "textures" / "earth-water.png"

START_YEAR = 2001
END_YEAR = 2024
GRID_STEP = 5.0          # degrees. 5 = ~550 km cells. Smaller = more detail but MANY more downloads.
ALPHA = 0.05             # significance level (must match js/config.js)
MIN_MONTHS_PER_YEAR = 9  # a year with fewer valid months becomes null (missing)

# Optional: limit downloads to a region while testing  (min_lat, max_lat, min_lon, max_lon)
# e.g. BBOX = (10, 40, 30, 65)  → Middle East only.  None = whole world.
BBOX = None

# ---------------------------------------------------------------------------
# VARIABLES
#   id          short name, lowercase (used in file names + URL)
#   source_type which loader in pipeline/sources/ produces the tidy table
#   land_only   skip ocean cells (faster downloads, and NDVI/fire only exist on land)
#   valid_range checked on the RAW values (before annual conversion) — outside = missing
#   source      shown in the app + used to build citations. Fill in DOI/version!
# ---------------------------------------------------------------------------
VARIABLES = [
    {
        "id": "temperature",
        "label": "Air temperature (2 m)",
        "unit": "°C",
        "aggregation": "annual mean",
        "decimals": 2,
        "source_type": "nasa_power",
        "power_parameter": "T2M",
        "annual": "mean",
        "land_only": False,
        "valid_range": (-90, 60),
        "source": {
            "name": "NASA POWER",
            "dataset": "T2M (MERRA-2)",
            "publisher": "NASA Langley Research Center",
            "url": "https://power.larc.nasa.gov/",
            "version": "",      # TODO(data): e.g. the POWER API version you used
            "doi": "",
            "year": 2026,
            # "citation": "Paste the official citation text here if the dataset gives one",
        },
    },
    {
        "id": "precipitation",
        "label": "Rainfall",
        "unit": "mm/yr",
        "aggregation": "annual total",
        "decimals": 0,
        "source_type": "nasa_power",
        "power_parameter": "PRECTOTCORR",   # mm/day (monthly mean) → converted to mm/yr
        "annual": "sum_daily_rate",
        "land_only": False,
        "valid_range": (0, 500),   # checked on RAW monthly mm/day values
        "source": {
            "name": "NASA POWER",
            "dataset": "PRECTOTCORR (MERRA-2)",
            "publisher": "NASA Langley Research Center",
            "url": "https://power.larc.nasa.gov/",
            "version": "", "doi": "", "year": 2026,
        },
    },
    {
        "id": "soil_moisture",
        "label": "Soil moisture (root zone)",
        "unit": "0–1",
        "aggregation": "annual mean",
        "decimals": 3,
        "trend_display": "absolute",
        "description": "How wet the top metre of soil is, from 0 (dry) to 1 (saturated).",
        "source_type": "nasa_power",
        "power_parameter": "GWETROOT",      # MERRA-2 root zone soil wetness, 0-100 cm, fraction 0-1
        "annual": "mean",
        "land_only": True,
        "valid_range": (0, 1),
        "source": {
            "name": "NASA POWER",
            "dataset": "GWETROOT root zone soil wetness (MERRA-2)",
            "publisher": "NASA Langley Research Center",
            "url": "https://power.larc.nasa.gov/",
            "version": "", "doi": "", "year": 2026,
        },
    },
    {
        "id": "vegetation",
        "label": "Vegetation greenness (NDVI)",
        "unit": "NDVI",
        "aggregation": "annual mean",
        "decimals": 3,
        "trend_display": "absolute",
        "source_type": "appeears",          # see pipeline/sources/appeears.py for the download steps
        "csv": "appeears_ndvi.csv",
        "layer": "ndvi",
        "annual": "mean",
        "land_only": True,
        "valid_range": (-0.2, 1.0),
        "source": {
            "name": "NASA MODIS (via AppEEARS)",
            "dataset": "MOD13A3 v061 monthly NDVI, 1 km (sampled at grid-cell centres)",
            "publisher": "NASA LP DAAC",
            "url": "https://lpdaac.usgs.gov/products/mod13a3v061/",
            "doi": "10.5067/MODIS/MOD13A3.061",
            "version": "061",
            "year": 2021,
        },
    },
    # ---- More dataset templates: ----
    # {
    #     "id": "vegetation", "label": "Vegetation greenness (NDVI)", "unit": "NDVI",
    #     "aggregation": "annual mean", "decimals": 3, "trend_display": "absolute", "source_type": "template_csv",
    #     "csv": "ndvi_monthly.csv", "annual": "mean", "land_only": True, "valid_range": (-0.2, 1.0),
    #     "source": {"name": "NASA MODIS", "dataset": "MOD13C2 v061", "publisher": "NASA LP DAAC",
    #                "url": "https://lpdaac.usgs.gov/products/mod13a3v061/", "doi": "10.5067/MODIS/MOD13A3.061", "year": 2021},
    # },
    # {
    #     "id": "fire", "label": "Active fire detections", "unit": "fires/yr",
    #     "aggregation": "annual count", "decimals": 0, "source_type": "template_csv",
    #     "csv": "firms_counts.csv", "annual": "sum", "land_only": True, "valid_range": (0, 1e7),
    #     "source": {"name": "NASA FIRMS", "dataset": "MODIS C6.1 Active Fire", "publisher": "NASA",
    #                "url": "https://firms.modaps.eosdis.nasa.gov/", "year": 2026},
    # },
]
