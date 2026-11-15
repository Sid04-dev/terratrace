# Methodology

How TerraTrace turns NASA data into a tested, cross-checked trend for any place on Earth.

## 1. Datasets

| Role | Variable | Dataset | Provider | Native resolution | Access |
|---|---|---|---|---|---|
| Main | Air temperature (2 m) | NASA POWER `T2M` (MERRA-2 reanalysis) | NASA LaRC | 0.5° × 0.625° | POWER API, monthly, cell centre |
| Main | Rainfall | NASA GPCP V3.3 monthly (satellite + gauge) | NASA GES DISC | 0.5° | 288 monthly files |
| Main | Root-zone soil moisture | NASA POWER `GWETROOT` (MERRA-2, 0–1 wetness) | NASA LaRC | 0.5° × 0.625° | POWER API, monthly, cell centre |
| Check | Temperature | NASA GISS GISTEMP v4, 1200 km smoothing (stations + ocean) | NASA GISS | 2° | one netCDF file |
| Check | Rainfall | NASA POWER `PRECTOTCORR` (MERRA-2) | NASA LaRC | 0.5° × 0.625° | POWER API |
| Check | Soil moisture | NASA GLDAS-2.1 Noah, `RootMoist_inst` (doi:10.5067/LWTYSMP3VM5Z) | NASA GES DISC | 1° | 288 monthly files |

Period: 2001–2024, monthly. Analysis grid: 5° × 5° (about 550 km at the equator).

## 2. Processing

1. **Requests.** 6,162 grid-cell requests to NASA POWER, plus 576 GES DISC files (GPCP and GLDAS) and the GISTEMP file, giving 1,774,656 monthly values.
2. **Fill values to missing.** NASA no-data codes (−999 and similar) become missing before any averaging.
3. **Valid ranges.** Values outside physical limits become missing: temperature −90 to 60 °C, rainfall 0 to 500 mm/day, soil wetness 0 to 1. In total 91,008 values were removed. Almost all came from 316 soil-moisture cells over ice sheets and coasts, which returned only fill values and were dropped, leaving 662 land cells.
4. **Gridding.** NASA POWER is sampled at each 5° cell centre. Gridded products (GPCP, GLDAS, GISTEMP) are averaged into each 5° cell with area weights of cos(latitude).
5. **Monthly to annual.** Temperature and soil moisture use the annual mean. Rainfall uses mm/day × days in the month, summed to mm/yr. A year with fewer than 9 valid months is missing. Annualising removes the seasonal cycle.
6. **No gap filling.** Missing years stay missing; nothing is interpolated.

## 3. Trend statistics

- **Mann–Kendall test** (two-sided, tie-corrected), α = 0.05.
- **Hamed–Rao (1998) correction.** The variance of S is corrected for autocorrelation in the ranks of the Sen-detrended series. The correction never makes a result *more* significant (variance factor ≥ 1). Between 92% and 98% of significant trends survive it.
- **Sen's slope** (median of all pairwise slopes), reported per decade, with a **95% confidence interval** using the non-parametric method of Gilbert (1987).
- **False discovery rate.** Testing thousands of cells at α = 0.05 would give about 130 false alarms per variable by chance. Each report says whether the trend also passes the Benjamini–Hochberg FDR threshold for its variable (q = 0.05). Survivors: temperature 528 of 909 significant cells, rainfall 17 of 336, soil moisture 142 of 214.
- **Step-change test.** A single step (at least 5 years each side) is compared with a straight line. A trend is flagged as a possible sudden jump when the step adds more than 0.20 to R² and reaches R² ≥ 0.60. This flags 1–7% of significant trends.
- **Unusual years.** Residuals from the Sen trend are scaled by a robust spread (1.4826 × MAD); |z| ≥ 2 marks an unusual year.
- **Connected clues.** Relations between variables use the correlation of year-to-year differences, which avoids spurious correlation from shared trends.
- Cells with fewer than 6 valid years are reported as "not enough data".
- **Same code in two places.** `pipeline/trend.py` and `js/trend.js` were compared on every cell; their p-values agree to within 1 × 10⁻⁶.

### Country averages
A country value is the cos(latitude)-weighted mean of the cells whose centres fall inside its Natural Earth 1:110m border. A year needs at least half of those cells to be valid. Countries smaller than one cell use the nearest cell, and the app says so.

## 4. Cross-validation

Every trend is re-tested on the second NASA record for the same variable and given one verdict:

| Verdict | Meaning |
|---|---|
| Independent Verification | Both records significant, same direction |
| Partial Corroboration | Main record significant; second record same direction but not significant |
| Cross-Dataset Divergence Note | Both records significant, opposite directions |
| Cross-Dataset Inconsistency Note | Main record significant; second record opposite direction, not significant |
| Mixed Evidence | Only the second record is significant |
| No Significant Trend in Either Record | Neither record is significant (insufficient evidence, not evidence of no change) |

Places with a Divergence or Inconsistency note are excluded from the hotspot rankings.

Agreement rates across all cells:

| Pair | Same direction | Significant in both |
|---|---|---|
| Temperature: MERRA-2 vs GISTEMP | 95% | 83% |
| Rainfall: GPCP vs MERRA-2 | 68% | 29% |
| Soil moisture: MERRA-2 vs GLDAS | 59% | 33% |

### Comparison with published research

| Place | TerraTrace (2001–2024) | Published reference | Consistent? |
|---|---|---|---|
| Central Chile, rainfall | −23.1% per decade; 2020–24 average 35% below 2001–05 | 25–45% rainfall deficits in the Central Chile megadrought (Garreaud et al., 2017) | Yes |
| Arctic, temperature | North of 66°N warming about 2.5× faster than 60°S–60°N | Arctic warming 2–4× the global rate (e.g. Rantanen et al., 2022) | Yes |
| Global land, temperature | Warming dominant in both records | NASA GISS global temperature analysis | Yes |

## 5. Limitations

- Values represent ~550 km cells, not single weather stations. POWER values are sampled at the cell centre.
- MERRA-2 and GLDAS are models constrained by observations, not raw measurements.
- The rainfall and soil-moisture pairs share some precipitation inputs, so they are only partly independent. The temperature pair (model vs stations) is the most independent.
- 24 years is short for climate. Natural cycles such as El Niño can create or hide trends.
- A significant trend does not explain its cause. The app suggests research questions; it does not attribute causes.

## 6. Reproducibility

See "Rebuild the data" in the [README](../README.md). Every output file is checked by `pipeline/validate.py` against [DATA_CONTRACT.md](DATA_CONTRACT.md), and the website runs the same checks when it loads.

## References

- Garreaud, R. D., et al. (2017). The 2010–2015 megadrought in central Chile. *Hydrology and Earth System Sciences*, 21, 6307–6327.
- Gilbert, R. O. (1987). *Statistical Methods for Environmental Pollution Monitoring*. Van Nostrand Reinhold.
- Hamed, K. H., & Rao, A. R. (1998). A modified Mann–Kendall trend test for autocorrelated data. *Journal of Hydrology*, 204, 182–196.
- Benjamini, Y., & Hochberg, Y. (1995). Controlling the false discovery rate. *Journal of the Royal Statistical Society B*, 57, 289–300.
- Rantanen, M., et al. (2022). The Arctic has warmed nearly four times faster than the globe since 1979. *Communications Earth & Environment*, 3, 168.
