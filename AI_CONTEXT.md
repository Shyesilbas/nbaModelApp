# AI_CONTEXT.md — NBA Predictive Modeling Ground Truth Context

> **Target Audience:** AI Agents, Copilots, Automated CI/CD Pipelines, and Quantitative Developers.  
> **Purpose:** Canonical single-file ground-truth context for the entire repository. Dense, factual reference data.  
> **Documentation Network:** [README](README.md) | [Artifact Registry](ARTIFACT_REGISTRY.md) | [Project Status](PROJECT_STATUS.md) | [Kapsamlı Rapor](docs/reports/nba_models_comprehensive_report.md) | [Model Benchmarks](docs/reports/model_benchmarks.md)  
> **Active Production Release:** `v15`  
> **Active Production Models:** `models/production/*`  
> **Locked Active Season:** `2026-27` (Prospective monitoring strictly; never use for training or tuning)

---

## 1. System & Data Architecture

```yaml
system_architecture:
  runtime: Python 3.12, FastAPI backend, React 19 / TypeScript / Vite / Tailwind frontend
  data_roots:
    reference: "data/reference/ (player_metadata.csv, player_movement.csv)"
    seasons: "data/season=YYYY-YY/ (raw/, processed/, features/, analysis/)"
    training: "data/training/ (team_model_ready_{YYYY_YY}.csv, player_model_ready.csv)"
    frontend_store: "data/frontend_store/ (season_{YYYY_YY}.db, global.db)"
    predictions: "data/predictions/ (paper_ledger_2026_27.jsonl, shadow_predictions.jsonl)"
  historical_seasons_trained: ["2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]
  total_training_games: 14780
  holdout_games: 2944
  walk_forward_seasons: ["2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]
  total_unseen_wf_games: 6276
```

---

## 2. Production Models Specification

### A. WIN Probability Model (`models/production/win_model.pkl`)
- **Release:** `v13` (promoted in `v12`)
- **Algorithm:** Uncalibrated Logistic Regression (`Pipeline([SimpleImputer, StandardScaler, LogisticRegression(C=1.0)])`)
- **Feature Count:** 11 features (`models/production/win_features.json`)
- **Feature Set:**
  1. `IS_HOME` (home advantage)
  2. `IS_B2B` (own team back-to-back)
  3. `OPP_IS_B2B` (opponent back-to-back)
  4. `ABS_DIFF` (Hollinger Game Score availability delta)
  5. `MISSING_ROT_MINS_DIFF` (Opponent missing rotation minutes minus own missing rotation minutes)
  6. `ROT_CONTINUITY_DIFF` (Rotation continuity/chemistry differential)
  7. `ACTIVE_WT_GS_DIFF` (Active lineup minute-weighted Game Score differential)
  8. `ELO_DIFF` (Continuous pre-game Elo difference)
  9. `WINRATE_DIFF_LAST_10` (10-game win rate differential, negative coefficient for luck regression)
  10. `REST_DIFF` (Rest days differential)
  11. `CLEAN_NET_RTG_DIFF_LAST_10` (Net rating differential excluding garbage-time minutes)
- **5-Season Walk-Forward Performance (6,276 Unseen Games):**
  - **Brier Score:** `0.2098` (vs Elo baseline `0.2158`, vs v11 `0.2106`)
  - **Log-Loss:** `0.6065` (vs Elo baseline `0.6207`, vs v11 `0.6088`)
  - **ROC-AUC:** `0.7217` (vs Elo baseline `0.7029`)
  - **Accuracy:** `66.30%` (vs Elo baseline `65.47%`)
  - **Statistical Significance:** Paired bootstrap delta mean $\Delta\text{LL} = -0.0023$, $P(\text{cand} < \text{prod}) = 96.72\%$.

### B. SCORE Model (`models/production/score_model_*.pkl`)
- **Release:** `v13`
- **Sub-Models:**
  - `score_model_pace.pkl`: Ridge on `PACE_LAST_10` and `OPP_PACE_LAST_10`
  - `score_model_home_rtg.pkl`: Ridge on `OFF_RTG_LAST_10`, `OPP_DEF_RTG_LAST_10`, `ABS_DELTA`, `OPP_ABS_DELTA`
  - `score_model_away_rtg.pkl`: Ridge on `OFF_RTG_LAST_10`, `OPP_DEF_RTG_LAST_10`, `ABS_DELTA`, `OPP_ABS_DELTA` (away rows)
  - `score_model_margin.pkl`: Ridge on 11 features (`ELO_DIFF`, `CLEAN_NET_RTG_DIFF_LAST_10`, `WINRATE_DIFF_LAST_10`, `DAYS_REST`, `OPP_DAYS_REST`, `IS_B2B`, `OPP_IS_B2B`, `ABS_DIFF`, `MISSING_ROT_MINS_DIFF`, `ROT_CONTINUITY_DIFF`, `ACTIVE_WT_GS_DIFF`)
  - `score_model_ridge_total.pkl` & `ridge_margin.pkl`: Residual corrections
- **5-Season Walk-Forward Performance (6,276 Unseen Games):**
  - **Total MAE:** `14.85 pts` (vs last-10 baseline `14.95 pts`)
  - **Margin MAE:** `10.809 pts` (vs last-10 baseline `11.41 pts`, vs v12 `10.832 pts`, beats v12 in 4/5 seasons)
  - **Spread Winner Accuracy:** `66.67%` (vs v12 `66.51%`)
  - **Conformal 80% Coverage:** `80.5%`

### C. PLAYER Model (`models/production/player_model_*.pkl`)
- **Release:** `v15`
- **Sub-Models:** LightGBM per target (`pts`, `reb`, `ast`, with unified L1 median objectives)
- **Features:** 24 explicit features (`player_features.pkl`) including position groups, opponent allowances, and team rotation context (`MISSING_ROT_MINS`, `ROT_CONTINUITY`, `ACTIVE_WT_GS`).
- **5-Season Walk-Forward Performance (140,378 rows):**
  - **PTS MAE:** `4.460` (vs EMA-10 baseline `4.632`, vs v14 `4.461`)
  - **REB MAE:** `1.864` (vs EMA-10 baseline `1.927`, vs v14 `1.884`, won 100% of seasons)
  - **AST MAE:** `1.279` (vs EMA-10 baseline `1.332`, vs v14 `1.306`, won 100% of seasons)

---

## 3. Strict Development Protocols

1. **Zero Emoji:** Never use emojis in code, docstrings, commit messages, markdown artifacts, or user responses.
2. **Train-Serve Parity:** Every feature computed by `roster_absence.py` / `build_matchup_features.py` must bitwise match offline training feature generation.
3. **Locked Active Season:** `2026-27` is strictly prospective. Never train on it, tune on it, or backfill ledger predictions after tip-off.
4. **Single Source of Truth Order:**
   1. `ARTIFACT_REGISTRY.md`
   2. `PROJECT_STATUS.md`
   3. `docs/reports/models/*.md`
   4. `docs/reports/nba_models_comprehensive_report.md`
   5. `AI_CONTEXT.md`
