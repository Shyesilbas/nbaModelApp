# Reporting and Validation Guide

This document describes the unified reporting, validation, and model comparison CLI tool available in the workspace.

## Overview

The reporting CLI (`scripts/generate_report.py`) provides a single interface to:
1. Audit season raw data freshness and file completeness.
2. Inspect active production model structures and metadata.
3. Dynamically evaluate and test models against a specified season.
4. Compare performance metrics of different model versions side-by-side.

---

## 1. Season Data Freshness Audits

To check if all raw and processed files exist for a specific season, run:

```bash
PYTHONPATH=. python3 scripts/generate_report.py --season YYYY-YY
```

### Key Checks Performed:
- Existence and size of `team_games.csv`, `player_games.csv`, and `schedule.csv`.
- Benzersiz (unique) game counts and date ranges in raw files.
- Existence and row counts of V2/V3 datasets and the score model ready dataset.

---

## 2. Model Structure Summaries

To inspect active model configurations, feature counts, and validation baselines for a specific model version, run:

```bash
PYTHONPATH=. python3 scripts/generate_report.py --model {v8, v9}
```

### Key Information Displayed:
- Version strings and training timestamps.
- Regression coefficients (e.g., Ridge total/margin coefficients for SCORE v9).
- Feature lists expected by the model.
- Base validation metrics from model metadata.

---

## 3. Dynamic Model Evaluation on a Season

To test a model version against the actual outcomes of any season, run:

```bash
PYTHONPATH=. python3 scripts/generate_report.py --season YYYY-YY --model {v8, v9}
```

### Process:
1. Loads the season's V3 team dataset.
2. If win projection features are missing (such as ELO difference and player projection averages), it automatically loads the model-ready player statistics and active player models to compute them dynamically.
3. Runs predictions and calculates:
   - **Win Probability**: Accuracy, ROC-AUC, Brier score.
   - **Score Component**: Total points MAE/Bias and margin MAE/Bias.
4. Saves a Markdown evaluation report to `reports/evaluation/season_{season}_model_{model}_evaluation_report.md`.

---

## 4. Side-by-Side Model Comparisons

To compare the performance of two model versions on a target season, run:

```bash
PYTHONPATH=. python3 scripts/generate_report.py --compare-models v8 v9 --season YYYY-YY
```

### Output:
Generates a side-by-side performance breakdown table comparing Accuracy, ROC-AUC, Brier Score, and MAE/Bias metrics for both models, along with the delta difference. Saves the report to `reports/evaluation/compare_{model1}_vs_{model2}_season_{season}.md`.

---

## 5. Daily Schedule Matchups Predictor

To predict win probabilities and scores for all games scheduled on a given date in a season, run:

```bash
PYTHONPATH=. python3 scripts/predict_daily_schedule.py --date YYYY-MM-DD --season YYYY-YY --model {v8, v9}
```

### Key Features:
- Filters games for the target date from `schedule_combined.csv`.
- Dynamically constructs rolling feature states for both teams.
- Runs the active Win model and SCORE component models (with Ridge regression corrections if V9).
- Outputs a cleanly formatted ASCII table to the console.
- Automatically saves a detailed markdown forecast to `reports/predictions/schedule_{date}_model_{model}.md`.

---

## 6. Safe Model Retraining and Promotion Pipeline

To retrain all predictive models (Player, Score, and Win Probability) in sequence and compare their performance against the current production models, run:

```bash
PYTHONPATH=. python3 scripts/retrain_pipeline.py --season YYYY-YY [--dry-run]
```

### Key Workflow:
1. **Retraining**: Automatically invokes the trainer classes (`PlayerModelTrainer`, `ScoreModelTrainer`, and `WinModelTrainer`) and saves outputs to `models/experimental/`.
2. **Evaluation**: Evaluates the candidate challenger models vs active production models on the specified validation season.
3. **Secure Promotion**: If not running with `--dry-run`, prompts for interactive confirmation `[y/N]` to promote models by copying files from `models/experimental/` to `models/production/`.

---

## 7. Data Drift and Feature Leakage Detector

To analyze feature distribution shifts across seasons and check for data leakage in model-ready datasets, run:

```bash
PYTHONPATH=. python3 scripts/detect_drift_and_leakage.py --reference-season YYYY-YY --target-season YYYY-YY [--threshold 0.95]
```

### Key Analysis:
- **Feature Leakage Check**: Flags zero-variance columns, high missingness rate, or pre-game features showing a correlation greater than the specified threshold (default `0.95`) with `WIN`.
- **Distribution Drift Scan**: Runs a Kolmogorov-Smirnov (KS) test to evaluate whether feature values have shifted significantly between the reference and target seasons.
- **Audit Logging**: Prints a summary to the console and outputs a markdown audit log to `reports/audits/drift_and_leakage_{reference}_vs_{target}.md`.
