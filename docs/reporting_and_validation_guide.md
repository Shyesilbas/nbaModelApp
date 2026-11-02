# Reporting, Auditing and Validation Guide

This document describes the validation suites, reporting CLIs, and drift detection tools used to audit data integrity and model performance across seasons.

---

## 1. Season Data Freshness Audits

To audit file completeness, row counts, and date spans for a specific NBA season:
```bash
PYTHONPATH=. python3 scripts/generate_report.py --season YYYY-YY
```

### Checks Performed:
- Existence and size of `team_games.csv`, `player_games.csv`, and `schedule.csv`.
- Unique game ID counts, null checks, and date range validity.
- Row counts and feature completeness for `team_model_ready_{YYYY_YY}.csv` and `player_model_ready.csv`.

---

## 2. Model Structure Summaries

To inspect active model architectures, feature contracts, and empirical benchmark parameters:
```bash
PYTHONPATH=. python3 scripts/generate_report.py --model-info [--model-dir models/production]
```

### Information Inspected:
- Model family (WIN `logistic_regression`, SCORE `ridge`, PLAYER LightGBM).
- Feature contracts from `config/features/` (e.g. `win.yaml`, `score.yaml`, `player.yaml`).
- Calibration parameters (SCORE Ridge residual coefficients for Total/Margin; WIN and PLAYER have none).
- Base holdout metrics recorded in `models/production/win_metadata.json`.

---

## 3. Dynamic Model Evaluation on a Season

To test a model artifact dynamically against the completed outcomes of any target season:
```bash
PYTHONPATH=. python3 scripts/generate_report.py --season YYYY-YY --evaluate [--model-dir models/production]
```

### Execution Flow:
1. Loads the season's V3 team dataset from CSV.
2. Injects rolling feature states (Continuous Elo, Dean Oliver Four Factors, schedule fatigue).
3. If win projection aggregates are required, calculates player projection averages dynamically.
4. Generates performance evaluation reports saved to `reports/evaluation/season_{season}_model_{release}_evaluation_report.md`:
   - **Win Probability**: Accuracy, ROC-AUC, Brier score, Log-Loss.
   - **Score Component**: Total points MAE/Bias and Margin MAE/Bias.

---

## 4. Side-by-Side Model Comparisons (Champion vs Challenger)

To compare two model directories on a specific season, e.g. production against the holdout copies that never saw 2025-26:
```bash
PYTHONPATH=. python3 scripts/generate_report.py --compare-models models/production models/experimental/holdout_eval --season 2025-26
```

### Output:
Generates a side-by-side comparative markdown table detailing accuracy deltas, Brier score reductions, calibration curves, and score errors, saved to `reports/evaluation/compare_{model1}_vs_{model2}_season_{season}.md`.

---

## 5. Daily Schedule Matchups Predictor CLI

To predict game outcomes, win probabilities, and projected scores for an entire scheduled date:
```bash
PYTHONPATH=. python3 scripts/predict_daily_schedule.py --date YYYY-MM-DD --season YYYY-YY
```

### Features:
- Filters games for the target date from `schedule_combined.csv`.
- Automatically queries rolling team features, rest days, and roster availability.
- Evaluates the active Win model (logistic regression) and Score models (Ridge).
- Outputs a formatted ASCII table to the console and exports a markdown forecast to `reports/predictions/schedule_{date}_model_{model}.md` (local only, not tracked in git).

---

## 6. Structural & Path Refactor Audits

Run these commands after any path refactoring or pipeline update:
```bash
PYTHONPATH=. python3 scripts/audit/validate_project_structure.py
PYTHONPATH=. python3 scripts/audit/validate_season_path_refactor.py
```
- Validates the single source of truth in `src/core/data_paths.py`.
- Checks production artifact manifests and verifies season-scoped path isolation.

---

## 7. Data Drift and Feature Leakage Detection

To detect distribution drift or lookahead leakage between seasons:
```bash
PYTHONPATH=. python3 scripts/detect_drift_and_leakage.py --reference-season 2024-25 --target-season 2025-26 [--threshold 0.95]
```

### Analysis:
- **Feature Leakage Check**: Identifies pre-game features exhibiting Pearson correlation $> 0.95$ with target `WIN`.
- **Distribution Drift Scan**: Executes Kolmogorov-Smirnov (KS) tests to detect feature distribution shifts.
- **Audit Logging**: Outputs an audit ledger to `reports/audits/drift_and_leakage_{reference}_vs_{target}.md`.

---

## Generated Performance Reports

Two reports carry every headline metric in the docs; rebuild them instead of editing numbers by hand (`reports/README.md` lists every report and its writer).

```bash
PYTHONPATH=. python3 scripts/walk_forward_benchmark.py
PYTHONPATH=. python3 scripts/paper_ledger_report.py --season 2026-27
```

- **Walk-forward** (`reports/evaluation/multi_season_walk_forward_backtest.md`): five expanding-window seasons against pure Elo, last-10 points and EMA-10, with a date-block bootstrap interval for each model-minus-baseline difference and the number of seasons won. Its header names the model versions measured; `tests/test_docs_consistency.py` fails when they differ from `config/production_artifacts.yaml`, so rerun it after every retrain.
- **Paper ledger** (`reports/evaluation/paper_ledger_<season>.md`): the frozen pre-tip predictions of the locked season, split by model version and origin (live vs backfill), compared with pure Elo and last-10 baselines computed from earlier games only, with calibration bands and a weekly trend. `scripts/ops/morning.py` rebuilds it after publishing.
