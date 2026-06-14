# 2025-26 NBA Playoffs Generalization Validation

This report checks if the post-processing Ridge calibration generalizes to a completely unseen playoff season.
Validation dataset size: 91 games (home perspectives).

## Metrics Comparison

| Metric | V8 Baseline (No Correction) | V9 Ridge (Calibrated) | Delta (V9 - V8) |
| --- | --- | --- | --- |
| **Total MAE** | 14.9901 | 13.8890 | -1.1011 |
| **Total Bias** | 6.8340 | 1.5975 | -5.2365 |
| **Margin MAE** | 13.6077 | 13.5969 | -0.0108 |
| **Margin Bias** | 0.4699 | 1.4036 | 0.9337 |

## Conclusion
If Total Bias drops from ~4.8 down to near 0, the Ridge model successfully generalizes out-of-season and learns a stable calibration correction.