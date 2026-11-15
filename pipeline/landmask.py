"""landmask.py — is a grid cell land? Uses the same water texture as the website."""
from __future__ import annotations

from PIL import Image

_img = None


def _load(path):
    global _img
    if _img is None:
        _img = Image.open(path).convert("L")
    return _img


def land_fraction(lat, lon, step, path) -> float:
    img = _load(path)
    w, h = img.size
    land = 0
    for i in range(5):
        for j in range(5):
            la = lat - step / 2 + step * (i + 0.5) / 5
            lo = lon - step / 2 + step * (j + 0.5) / 5
            x = int((lo + 180) / 360 * w) % w
            y = min(h - 1, max(0, int((90 - la) / 180 * h)))
            land += img.getpixel((x, y)) < 160
    return land / 25
