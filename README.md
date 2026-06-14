#  NBA Predictor: Production ML Pipeline & Inference Service

An end-to-end, leakage-free NBA prediction engine that forecasts game outcomes, final scores, and individual player stats (Points, Rebounds, Assists) with production-grade calibration.

---

## ⚡ The Quick Specs (Why this is interesting)

* **Calibrated Win Probability (V9)**: Predicts matchup winners using a feature-sanitized Logistic Regression model.
  * **ROC-AUC**: `0.7421` (Chronological Holdout)
  * **Brier Score**: `0.2049` (Highly Calibrated Isotonic Scaling)
* **Score Component XGBoost + Ridge (V9)**: Estimates game pace, offensive ratings, and margins. Uses a secondary Ridge regression layer on prediction residuals to cut playoff bias, dropping **Total Points MAE down to `14.75`**.
* **Player Performance LGBM + Ridge (V9)**: Forecasts PTS, REB, and AST. Uses short-term Usage Rate (USG_PCT) trends and dynamic matchup weaknesses to achieve **`0.50` $R^2$ on PTS** and **`0.46` $R^2$ on AST**.

---

## 🛠️ Tech Stack & Key Layers

1. **Python ML Service (`ml-service/`)**: Fast HTTP serving via FastAPI, hosting production joblib estimators and wrapping inference calls.
2. **Feature Engineering Pipeline (`src/features/`)**: Multi-level rolling team form, rest days advantage, geographic Haversine distance, travel fatigue, and position-allowed defensive aggregates.
3. **Dynamic Stint-Based RosterSnapshots (`scripts/ingest/`)**: Reconstructs trade and roster event timelines dynamically from player game logs, ensuring **zero data leakage** at inference time.
4. **Interactive Dashboard (`frontend/`)**: React + TypeScript client served instantly via Vite, powered by cache-warmed frontend data.

---

## 🚀 Dev Quick Start

### 1. Activating Environment & Audit
Ensure your dependencies are correct and paths are valid:
```bash
source .venv/bin/activate
PYTHONPATH=. python3 scripts/audit/validate_project_structure.py
```

### 2. Launching Services
Run the boot script to start the FastAPI ML Service (Port 8001) and Vite Frontend (Port 5173):
```bash
./scripts/start_all.sh
```

### 3. CLI Matchup Prediction (Debugging Tool)
Predict any upcoming game directly from the terminal:
```bash
PYTHONPATH=. python3 scripts/predict_matchup.py --home LAL --away BOS --prediction-date 2026-06-15
```

---

## 📖 Essential Documentation Maps

- **Onboarding a New Season**: Check [docs/season_onboarding_guide.md](file:///Users/serhat/agProjects/nbaModelApp/docs/season_onboarding_guide.md) for step-by-step commands to ingestion, core players mapping, and bootstrapping.
- **Model Evolution & Details**: Review [reports/production/v8_vs_v9_model_comparisons.md](file:///Users/serhat/agProjects/nbaModelApp/reports/production/v8_vs_v9_model_comparisons.md) to inspect why and how we reached our current production metrics.
- **Project Directory Index**: A map of active data, models, and reports is maintained under [reports/README.md](file:///Users/serhat/agProjects/nbaModelApp/reports/README.md).
