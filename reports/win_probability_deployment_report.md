# Win Probability Deployment Report

Summary
- Selected baseline: Logistic Regression (calibrated).

Why Logistic Regression
- Competitive ROC-AUC (CV 0.711, Test 0.727) with simpler, interpretable, low-latency predictions.
- Lower complexity reduces maintenance and risk for first deployable baseline compared to Random Forest which showed slightly worse test ROC-AUC and higher Brier.

Why calibration
- Raw classifier scores are often miscalibrated; calibration (sigmoid or isotonic) adjusts predicted probabilities to better reflect observed frequencies.
- Brier Score is used as primary selection metric because it measures both calibration and refinement.

Trustworthiness of probabilities
- Calibration improves reliability; selection was based primarily on Brier Score then ROC-AUC.
- If calibration set is small (isotonic needs more data), sigmoid is safer; isotonic can provide better fit given enough calibration data.

Current limitations
- Model uses season 2025-26 data only (no historical seasons) as requested; limits generalization to distribution shifts.
- Features derived at team level only; no player-level effects yet.
- Calibration relies on held-out calibration set; drift in future games will reduce calibration quality.
- Some input preprocessing (imputation/scaling) is embedded in the saved pipeline; feature ordering must match feature_columns.json.

Next improvements
- Periodically re-fit and recalibrate model with recent games (retraining schedule).
- Add online calibration monitoring: reliability diagrams, expected calibration error over time.
- Consider temperature scaling or Platt scaling alternatives, and evaluate isotonic calibration with larger calibration sets.
- Add feature validation and automated tests for the inference pipeline.

Files produced
- models/win_probability_model.pkl
- models/feature_columns.json
- models/model_metadata.json
- scripts/predict_win_probability.py
- scripts/prepare_win_probability_model.py

Usage
1. Run training and calibration:
   python scripts/prepare_win_probability_model.py
2. Predict for a single prepared feature row:
   python scripts/predict_win_probability.py --input-json path/to/row.json

Notes
- The inference script expects a JSON mapping containing all features listed in models/feature_columns.json. It fails clearly when features are missing.
- No new features, player models, or historical seasons were added per decision.
