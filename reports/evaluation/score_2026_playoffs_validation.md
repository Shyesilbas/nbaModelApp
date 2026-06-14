# 2025-26 NBA Playoffs Generalization Validation

This report checks if the post-processing Ridge calibration generalizes to a completely unseen playoff season.
Validation dataset size: 81 games (home perspectives).

## Metrics Comparison

| Metric | V8 Baseline (No Correction) | V9 Ridge (Calibrated) | Delta (V9 - V8) |
| --- | --- | --- | --- |
| **Total MAE** | 14.6071 | 13.8066 | -0.8005 |
| **Total Bias** | 5.5721 | 0.3280 | -5.2442 |
| **Margin MAE** | 14.3698 | 14.3352 | -0.0346 |
| **Margin Bias** | 0.6027 | 1.5403 | 0.9376 |

## Conclusion
If Total Bias drops from ~4.8 down to near 0, the Ridge model successfully generalizes out-of-season and learns a stable calibration correction.