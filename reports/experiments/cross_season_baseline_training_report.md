# Cross-Season Baseline Training Report

> Generated: 2026-06-09 22:38:52

## Overview
- **Training Season**: 2024-25
- **Testing Season**: 2025-26
- **Split Protocol**: Strict season split — no random shuffling.
- **Scope**: Experimental only. No production artifacts modified.

## Dataset Summary

### WIN Dataset
- Train rows (2024-25): **2640**
- Test rows  (2025-26): **1758**
- Feature count: **80**

### SCORE Dataset
- Train rows (2024-25): **1320**
- Test rows  (2025-26): **879**
- Feature count: **80**

## Excluded Columns

### Metadata (excluded from all features)
```
GAME_DATE, GAME_ID, MATCHUP, OPPONENT_ABBREVIATION, SEASON, SEASON_TYPE, TEAM_ABBREVIATION, TEAM_ID, TEAM_NAME, source_dataset
```

### Score targets (excluded from SCORE features)
```
AWAY_PTS, HOME_PTS, POINT_DIFF, TOTAL_POINTS
```

### WIN target (excluded from WIN features)
```
WIN
```

## WIN Model Metrics (Strict Season Split)

| Model | Accuracy | Precision | Recall | F1 | ROC-AUC | Brier Score |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| logistic_regression | 0.6422 | 0.6420 | 0.6428 | 0.6424 | 0.7048 | 0.2190 |
| random_forest | 0.6206 | 0.6188 | 0.6280 | 0.6234 | 0.6730 | 0.2280 |
| gradient_boosting | 0.6172 | 0.6238 | 0.5904 | 0.6067 | 0.6584 | 0.2354 |

**Best WIN by ROC-AUC**: `logistic_regression` — ROC-AUC=0.7048
**Best WIN by Brier Score**: `logistic_regression` — Brier=0.2190

## SCORE Model Metrics — HOME_PTS

| Model | MAE | RMSE | R² |
| :--- | :---: | :---: | :---: |
| ridge | 10.4717 | 13.1317 | 0.0192 |
| random_forest | 10.3788 | 13.0262 | 0.0349 |
| gradient_boosting | 10.8224 | 13.5896 | -0.0504 |

## SCORE Model Metrics — AWAY_PTS

| Model | MAE | RMSE | R² |
| :--- | :---: | :---: | :---: |
| ridge | 10.2985 | 13.0162 | 0.0475 |
| random_forest | 10.2220 | 12.8719 | 0.0685 |
| gradient_boosting | 10.5026 | 13.1886 | 0.0221 |

## SCORE Derived Metrics (POINT_DIFF & TOTAL_POINTS)

| Derived Target | Model Combo | MAE | RMSE | R² |
| :--- | :--- | :---: | :---: | :---: |
| POINT_DIFF | derived(random_forest+random_forest) | 12.7421 | 16.1897 | 0.0856 |
| TOTAL_POINTS | derived(random_forest+random_forest) | 16.0895 | 20.2146 | 0.0288 |

**Best SCORE HOME_PTS by MAE**: `random_forest` — MAE=10.3788
**Best SCORE AWAY_PTS by MAE**: `random_forest` — MAE=10.2220

## Comparison Against Production Metrics

### WIN Model (Production Reference)
- Source: `win_model_v2_backtest_summary (game_level)`
- Production ROC-AUC (game-level): **0.6943854291152127**
- Production Brier Score (game-level): **0.22174943204073638**
- Production Accuracy (game-level): **0.6345475910693302**

- Best Experimental ROC-AUC: **0.7048** (`logistic_regression`)
- Best Experimental Brier: **0.2190** (`logistic_regression`)

### SCORE Model (Production Reference)
- Source: `score_model_v2_metadata.json`

| Target | Production MAE | Experimental Best MAE | Delta |
| :--- | :---: | :---: | :---: |
| HOME_PTS | 9.623 | 10.3788 | +0.755 |
| AWAY_PTS | 9.688 | 10.2220 | +0.534 |

## Final Verdict

| Component | Verdict |
| :--- | :--- |
| WIN Models | **PROMISING** |
| SCORE Models | **PROMISING** |
| Overall | **PROMISING** |

- Cross-season WIN models perform on par or better than production on ROC-AUC.
- Cross-season HOME_PTS MAE (10.379) is above production (9.623).

## Notes

- All models trained on this strict cross-season split.
- Performance is expected to be lower than within-season backtests due to distribution shift between seasons.
- Models have NOT been promoted to production.
- Next step: hyperparameter tuning and feature engineering if NEEDS_TUNING; further validation if PROMISING.

## Saved Artifacts

### Models
- Historical cross-season WIN baseline models
- Historical cross-season SCORE baseline models

### Reports
- This report file
- Historical training metrics snapshot
- Historical WIN feature column snapshot
- Historical SCORE feature column snapshot
