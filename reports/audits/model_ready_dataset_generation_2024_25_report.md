# 2024-25 Experimental Model-Ready Dataset Generation Report

This document summarizes the generation and validation of the experimental model-ready datasets for the 2024-25 season.

## 1. Commands Run

- `python3 scripts/train_win_probability_v2.py --season 2024-25 --dataset-only --output-scope experimental`
- `python3 scripts/prepare_score_model.py --season 2024-25 --dataset-only --output-scope experimental`
- `python3 scripts/audit/validate_model_ready_datasets_2024_25.py --season 2024-25`

## 2. Generated Files

- `data/experimental/team_win_model_ready_v2_2024_25.csv`
- `data/experimental/team_score_model_ready_v2_2024_25.csv`

## 3. Validation Summary

| Check | Status | Details |
|---|---|---|
| File Existence | - | - |
| Row Counts | - | - |
| Target Columns | - | - |
| Feature Columns | - | - |
| GAME_ID Coverage | - | - |
| Duplicate Keys | - | - |
| Date Range | - | - |
| Leakage Columns | - | - |
| Roster/Player Features | - | - |
| Missing Values | - | - |
| Feature Parity (vs 2025-26) | - | - |

## 4. Final Verdict

**PASS / FAIL**

**Readiness Score:** 0/100
