# Inference Domain

Loads promoted production artifacts and executes calibrated WIN probability predictions, SCORE projections with conformal intervals, team-reconciled PLAYER projections, and SHAP explanations.

> [!NOTE]
> **Related Documentation & Runbooks:**
> - **Architecture Deep Dives:** [`docs/early_season_transitions.md`](../../docs/early_season_transitions.md) · [`docs/nba_prediction_integration.md`](../../docs/nba_prediction_integration.md) · [`reports/production/model_performance_and_architecture_report.md`](../../reports/production/model_performance_and_architecture_report.md)
> - **Key Entry Points:** [`win_predictor.py`](win_predictor.py) · [`score_predictor.py`](score_predictor.py) · [`player_predictor.py`](player_predictor.py) · [`win_blend.py`](win_blend.py) · [`team_reconciliation.py`](team_reconciliation.py) · [`shap_explainer.py`](shap_explainer.py)

## Business Rules & Invariants
- **Artifact Resolution:** `WinPredictor`, `ScorePredictor`, and `PlayerPredictor` resolve `.pkl` and metadata paths via `resolve_artifact_path`, allowing `NBA_MODEL_DIR` overrides for holdout replay tests without altering production configs.
- **Early-Season Elo Blend (`WinPredictor` / `win_blend.py`):** During the first 6 games of a season, `blend_win_probability` blends model output with `elo_home_probability` using linearly decaying `EARLY_SEASON_ELO_BLEND_WEIGHT` (up to `0.40`).
- **Playoff Conformal Intervals (`ScorePredictor`):** `interval_offsets_80` selects regular-season 80% conformal prediction offsets by default and overrides with `prediction_interval_offsets_80pct_playoff` when `is_playoff` is true.
- **Team-Score Player Reconciliation (`team_reconciliation.py`):** Individual `PlayerPredictor` outputs condition on playing and sum ~20% above predicted team points; `team_reconciliation` scales player projections down (never up) via `reconciliation_factors` proportional to `(1 - play_probability) * proj_pts`, where `PLAY_PROBABILITY_BY_MINUTES` provides empirical attendance curves when injury reports are absent.
- **Linear & Tree Explanations:** `ShapExplainer` (`linear_contributions`) delivers exact additive feature attributions for linear WIN/SCORE pipelines alongside LightGBM attributions.
- **Shadow WIN Candidates (`win_shadow.py`):** `shadow_home_win_probabilities` scores the models listed in `SHADOW_MODELS` (under `models/experimental/`) on the production feature row with the same early-season Elo blend; the result is only written to the paper ledger, never served.
- **Change rule:** Never alter blending windows or reconciliation formulas in `src/inference/` without verifying parity against `scripts/backtest/live.py` and `scripts/walk_forward_benchmark.py`.
