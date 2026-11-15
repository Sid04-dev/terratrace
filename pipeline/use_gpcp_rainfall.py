"""
use_gpcp_rainfall.py — make NASA GPCP the MAIN rainfall layer, keep MERRA-2 as the check.

Why: MERRA-2 rainfall (NASA POWER PRECTOTCORR) jumps suddenly in some regions when the
rain-gauge data behind it changes (e.g. a cell over Cambodia goes from ~500 to ~2,600 mm/yr
in 2016). GPCP is NASA's rainfall record built for climate studies (satellites + gauges)
and stays steady there. Run AFTER crosscheck_gpcp.py:

    python pipeline/crosscheck_gpcp.py      # downloads GPCP, writes check_precipitation_gpcp.json
    python pipeline/use_gpcp_rainfall.py    # swaps the roles (safe to run more than once)

Result:
    grid_precipitation.json          ← GPCP (main layer)
    check_precipitation_merra2.json  ← MERRA-2 (independent check)
NOTE: running build.py for "precipitation" again would put MERRA-2 back as the main layer;
just run this script again afterwards.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as cfg  # noqa: E402
from validate import validate_folder  # noqa: E402

P = cfg.OUT_DIR


def rd(p: Path):
    raw = p.read_bytes()
    try:
        return json.loads(raw.decode("utf-8"))
    except UnicodeDecodeError:
        return json.loads(raw.decode("cp1252"))


def wr(p: Path, obj, pretty=False):
    p.write_text(json.dumps(obj, indent=2 if pretty else None, separators=None if pretty else (",", ":"),
                            ensure_ascii=False), encoding="utf-8")


def main():
    m = rd(P / "manifest.json")
    var = next((v for v in m["variables"] if v["id"] == "precipitation"), None)
    if var is None:
        sys.exit("No precipitation variable in manifest.json — run build.py first.")
    if "GPCP" in var["source"]["name"]:
        print("GPCP is already the main rainfall layer. Nothing to do.")
        return
    gpcp_check = next((c for c in m.get("checks", []) if c["id"] == "precipitation_check"), None)
    gp = P / "check_precipitation_gpcp.json"
    if not gpcp_check or not gp.exists():
        sys.exit("Run crosscheck_gpcp.py first (check_precipitation_gpcp.json not found).")

    merra = rd(P / var["file"])
    gpcp = rd(gp)

    # 1) MERRA-2 grid → the check file
    merra["variable"] = "precipitation_check"
    wr(P / "check_precipitation_merra2.json", merra)
    # 2) GPCP grid → the main file
    gpcp["variable"] = "precipitation"
    wr(P / "grid_precipitation.json", gpcp)
    gp.unlink()

    # 3) manifest: swap sources
    merra_source = var["source"]
    var["source"] = gpcp_check["source"]
    var["file"] = "grid_precipitation.json"
    var["description"] = "Rain and snow per year, from NASA GPCP (satellites combined with rain gauges)."
    m["checks"] = [c for c in m["checks"] if c["id"] != "precipitation_check"] + [{
        "id": "precipitation_check", "of": "precipitation", "label": "Rainfall (MERRA-2)",
        "unit": var["unit"], "aggregation": var.get("aggregation", "annual total"), "decimals": var.get("decimals", 0),
        "file": "check_precipitation_merra2.json",
        "short": "NASA MERRA-2", "basis": "a weather model guided by observations",
        "source": merra_source,
    }]
    wr(P / "manifest.json", m, pretty=True)
    print("GPCP is now the main rainfall layer; MERRA-2 rainfall is the independent check.")
    validate_folder(P)


if __name__ == "__main__":
    main()
