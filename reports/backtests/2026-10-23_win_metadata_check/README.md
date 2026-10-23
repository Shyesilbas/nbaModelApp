# Walk-forward re-run with the 8-feature WIN model (2026-10-23)

The README walk-forward figures predated `ABS_DIFF` (7-feature WIN, margin model without availability). Re-run with the
current trainers: `python -m scripts.backtest.offline --out <dir> --test-seasons ...` (local data only, models trained on
earlier seasons only, production files untouched). 2025-26 is in this folder, 2023-24 and 2024-25 in
`../2026-10-23_win_metadata_check_prev/`.

| Season | WIN AUC | Brier | Log loss | Accuracy | Total MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| 2023-24 | 0.7350 | 0.2059 | 0.5980 | 66.6% | 14.69 | 10.96 |
| 2024-25 | 0.7388 | 0.2048 | 0.5952 | 68.2% | 14.89 | 10.82 |
| 2025-26 | 0.7485 | 0.2011 | 0.5866 | 68.9% | 15.29 | 11.25 |
| 3 seasons pooled (3,772 games) | 0.7408 | 0.2039 | 0.5933 | 67.9% | 14.96 | 11.03 |

Before (2026-10-20 review, no ABS_DIFF): 2025-26 Brier 0.2044, AUC 0.7396, margin MAE 11.45. PLAYER figures are unchanged.
`models/production/win_metadata.json` was not edited: its `holdout_metrics` (AUC 0.7534, Brier 0.2017 on 2,522 team rows)
are written by the trainer from its own locked 2025-26 holdout and are consistent with these numbers.
