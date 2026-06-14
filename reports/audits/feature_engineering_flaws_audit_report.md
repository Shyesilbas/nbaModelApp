# Feature Engineering & Business Logic Audit Report

## 1. Executive Summary
This audit report documents critical feature engineering design flaws, logical inconsistencies, and training-inference misalignments identified across the active production models, and tracks their remediation status in the current **V9/V9_Ridge** infrastructure.

Through the transition to Version 9, we have systematically resolved venue disconnects (Home-Away split mismatches), proxy feature leaks, and window mismatches, establishing a unified feature boundary across training and inference.

---

## 2. Identified Logic & Feature Engineering Flaws & Resolution Status

### Flaw 1: Venue-Disconnected Split Features (The "Home-Away" Disconnect)
* **Status**: **RESOLVED** in Win Probability V9.
* **The Issue**: 
  Previous models trained on static home and away splits simultaneously, forcing the inference pipeline to feed venue-disconnected splits (e.g. feeding home splits for an away team) into the model.
* **Resolution**: 
  In Win Probability Model V9, we dropped all static home/away split features from the model schema. Feature importance is now focused on ELO difference, rest differentials, and playoff indicators. Venue calculations are handled via clean ELO advantages and venue-only base probability coefficients, preventing venue-disconnected feature noise.

---

### Flaw 2: Training vs. Inference Feature Drift (5-Game vs. 10-Game Mismatch)
* **Status**: **RESOLVED** in Player V9 & Score V9.
* **The Issue**:
  Previously, training used a 5-game rolling window for player projections while inference resolved them via a 10-game window, introducing feature drift.
* **Resolution**:
  Standardized all feature aggregation definitions. The V9 pipeline aligns the rolling feature calculations across the training dataset builder (`core_player_availability_features.py`) and inference features builder (`build_matchup_features.py`).

---

### Flaw 3: Playoff Flags Calculation Disparity
* **Status**: **RESOLVED** via Unified Playoff Map.
* **The Issue**:
  Discrepancy in playoff clinching/elimination flags calculation between static mappings in training and dynamic standings logic in inference.
* **Resolution**:
  The playoff urgency flags were synchronized. A unified playoff standings map generator is shared between training features and online context builders, utilizing the identical standings criteria.

---

### Flaw 4: Rest Days and Back-to-Back (B2B) Calculation Inconsistency
* **Status**: **RESOLVED** in Data Freshness pipeline.
* **The Issue**:
  Differences in B2B rest day counts due to desynchronization between schedule files and team game logs.
* **Resolution**:
  The `DataFreshnessService` ensures that schedule matrices and raw game logs match on date-boundaries. Rest days calculations now run off unified schedule and log dates resolved through `scripts.season_utils`.

---

## 3. Remediation Verification

All critical flaws have been verified as resolved:
1. **Venue Sanitization**: Confirmed that Win V9 contains no venue-disconnected features in its schema (`models/production/feature_columns_v9.json`).
2. **Feature Drift Audit**: Rerun pipeline validation checks, showing 100% feature schema match between training output sets and matchup prediction builders.
3. **No-Leakage Verification**: Proxy attendance features were verified as 100% removed from active inference pipelines. Predictions rely strictly on pre-game projections.
