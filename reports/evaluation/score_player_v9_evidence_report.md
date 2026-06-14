# SCORE/PLAYER V9 Evidence Report

This report summarizes non-leaky chronological holdout evidence for the active V9 post-processing layers.

## Score V9 Ridge

- Split date: `2025-04-06`
- Best strategy: `ridge_regression`
- Total MAE delta: `-0.0985`
- Margin MAE delta: `-0.0056`
- Home MAE delta: `-0.0216`
- Away MAE delta: `-0.0494`
- Playoff total bias: `4.8014` -> `-0.6743`
- Playoff margin bias: `-0.9929` -> `-0.0782`

## Player V9 Ridge

- Split date: `2026-02-07`
- Test rows: `11080`
| Target | Raw MAE | Ridge MAE | MAE Delta | Raw Bias | Ridge Bias |
| --- | --- | --- | --- | --- | --- |
| `pts` | 4.5542 | 4.5476 | -0.0066 | -0.1912 | -0.2270 |
| `reb` | 1.9391 | 1.9194 | -0.0197 | -0.0133 | -0.0278 |
| `ast` | 1.3709 | 1.3665 | -0.0045 | -0.0461 | -0.0579 |

## Decision

- Score: keep V9 Ridge for total and playoff bias correction; margin bias needs monitoring.
- Player: keep V9 Ridge because overall MAE gains are small but consistent, and segment bias improves.

## Files

- JSON: `reports/evaluation/score_player_v9_evidence_metrics.json`
- Score metadata updated: `models/production/score_model_v9_metadata.json`
- Player metadata updated: `models/production/player_v9_metadata.json`