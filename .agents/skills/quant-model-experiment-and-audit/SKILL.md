---
name: quant-model-experiment-and-audit
description: >-
  Use this skill whenever designing, running, auditing, or documenting machine learning
  experiments, feature ablations, calibration checks, walk-forward backtests, or model
  promotions in sports prediction repositories. Enforces zero-leakage protocols, locked
  season boundaries, baseline skill gates, train-serve parity, and documentation sync.
---

# Quant Model Experiment, Audit & Promotion Workflow

Follow this workflow whenever evaluating new features, tuning model hyperparameters, auditing model behavior, or updating model reports.

## 1. Pre-Flight & Production Safety
1. **Read Registry & Status First:** Check [`docs/artifact_registry.md`](../../../docs/artifact_registry.md) and [`docs/project_status.md`](../../../docs/project_status.md) before touching code or data.
2. **Never Overwrite Production Silently:** Never overwrite `models/production/` or `config/production_artifacts.yaml` during experiments. Write experimental outputs to `models/experimental/`, `data/experimental/`, or `reports/backtests/YYYY-MM-DD_<topic>/`.
3. **Zero Emoji & Deterministic Seeds:** Zero emojis in code, comments, docstrings, or reports. Seed all stochastic steps (splits, bootstrap, model init, CV) and record seeds in experiment headers.

## 2. Strict Zero-Leakage & Validation Protocol
1. **Pre-Game Boundaries (`shift(1)`):** Rolling, EWMA, form, usage, opponent allowance, and Elo features must strictly use games completed prior to tip-off (`shift(1)` on chronologically sorted logs). Post-game stats must never enter feature columns.
2. **Out-of-Fold Calibrators & Shrinkage:** Fit all post-processing calibrators, residual corrections, and early-season prior weights strictly inside training folds or expanding walk-forward splits—never on holdout or evaluation seasons. Label in-sample metrics explicitly.
3. **Locked Season Rule (`2026-27`):** The active season is strictly for prospective monitoring. Never use it for feature selection, hyperparameter tuning, or deployment decisions.
4. **Expanding-Window Walk-Forward:** Evaluate candidates across multiple unseen historical seasons where each test season is predicted by models fit strictly on earlier seasons.

## 3. Hypothesis-Driven Diagnosis & Baseline Skill Gates
1. **Diagnose Before Algorithm Hopping:** Test distribution assumptions, variances, and collinearity (`check_feature_matrix`) before switching model families. Measure feature utility via permutation importance (`permutation_contribution`), SHAP, or multi-season ablation—never raw collinear regression weights alone.
2. **Mandatory Baseline Skill Gates:**
   - **WIN Probability:** Pure Elo + Home advantage.
   - **SCORE (Total / Margin):** Last-10 / EMA-10 actual points or prior-season team means.
   - **PLAYER Props (PTS/REB/AST):** EMA-10 per-game averages.
   - **Gate Criterion:** Pass only if beating the baseline on proper scoring rules (Log-Loss, Brier, MAE, RMSE) across the majority of unseen outer seasons.
3. **Statistical Rigor & Power Analysis:** Compute 10,000-iteration date-block bootstrap 95% CIs (`paired_block_bootstrap`) on metric deltas. When the CI spans zero ($p \ge 0.05$), document noise margins and compute required sample size $N_{\text{req}} = (Z_{\alpha/2} + Z_\beta)^2 \sigma^2 / \Delta^2$ ($Z_{\alpha/2}=1.96$, $Z_\beta=0.8416$). Apply Bonferroni or Benjamini-Hochberg FDR when testing $k > 1$ segments or markets.
4. **Honest Rejection ("No Gain — Not Adopted"):** Reject experiments that fail skill gates or add complexity for negligible gain (e.g., `< 0.01` MAE or `< 0.0005` Log-Loss). Keep the simpler model and record the negative result in `reports/backtests/`.

## 4. Train-Serve Parity & Cross-Market Coherence
1. **Train-Serve Skew Audit:** Verify that `src/api/services/`, `src/inference/`, and CLI predictors call the exact same feature builders (`build_features`, `build_absence_deltas`, `add_player_matchup_features`, early-season blends) as offline training.
2. **Coherent Predictions:** Winner calls come from the dedicated WIN model (`WinPredictor`). Team-level score projections and player projections remain reconciled via `team_reconciliation`.

## 5. Documentation & Registry Sync Chain
Whenever a model changes, an audit concludes, or a backtest finalizes, read metrics directly from generated JSONs and update in order:
1. Create or update `reports/backtests/YYYY-MM-DD_<topic>/README.md` (with script in `code/`) or `docs/reports/models/<model>.md`.
2. Register new active datasets, reports, or promoted artifacts in `docs/artifact_registry.md`.
3. Log completed milestones and status in `docs/project_status.md`.
4. Refresh generated reports & blocks via `PYTHONPATH=. python3 scripts/refresh_reports.py`.
5. Run `./scripts/verify.sh` and `PYTHONPATH=. python3 scripts/audit/validate_project_structure.py`.
