# V4 Player Prediction Dataset Validation Report

## Summary
The V4 player dataset successfully incorporates rolling Usage Rate (USG_PCT) features to capture roster and rotation changes.

## Validation Checks
- **V3 Row Count**: 56183
- **V4 Row Count**: 56183
- **Row Count Match**: PASS
- **New Usage Rate Features**: PASS
- **Null Rate Check**: FAIL
- **Leakage Check**: PASS

## New Features List
- `USG_PCT_LAST_3`
- `USG_PCT_LAST_10`
- `USG_PCT_EMA_5`
- `USG_PCT_EMA_10`
- `USG_PCT_STD_LAST_10`
- `USG_PCT_TREND`