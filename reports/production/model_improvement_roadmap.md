# NBA Prediction Model Improvement Roadmap

This document outlines the prioritized machine learning and feature engineering improvements for the NBA prediction models, addressing weaknesses identified in the Win Probability and Score Prediction models.

---

## Priority 1: High-Impact Changes (Improves Both Models)

### 1. Cross-Season Training Data Expansion
- **Expected Benefit**: Significantly increases training data size from ~879/1758 rows (currently restricted to 2025-26 season) to 10,000+ rows. Improves generalization, stabilizes feature importances, and prevents overfitting.
- **Required Data**: Historical team-level and player-level box scores for the past 5 to 10 NBA seasons.
- **Implementation Difficulty**: **Medium**. Requires alignment of historical player IDs and team stats across different schemas.
- **Leakage Risk**: **Low**. Standard time-series splitting (chronological splits) must be applied across multiple seasons.
- **Sequence**: Must be done **before** building a player minutes model to ensure base model coefficients are stable.

### 2. Advanced Team Form and Strength-of-Schedule (SoS) Adjustments
- **Expected Benefit**: Resolves issues where raw averages overvalue teams with easy schedules. Exponential moving averages (EMA) will weight recent games higher than older games.
- **Required Data**: Opponent strength metrics (e.g., net rating, Elo rating) and historical schedule details.
- **Implementation Difficulty**: **Medium**. Requires recalculating rolling aggregates recursively.
- **Leakage Risk**: **Low**. Rolling aggregates must be strictly causal (using only pre-game information).
- **Sequence**: Done **before** the player minutes model.

---

## Priority 2: Score-Specific Improvements (Improves Score Prediction Only)

### 3. Machine-Learned Player Minutes Allocation Model
- **Expected Benefit**: Replaces the basic recent-participation proxy (which checks if a player played in the last 3 games) with a dedicated model predicting exact minutes. Prevents major errors when core players return from injury or get rested.
- **Required Data**: Official pre-game injury reports (NBA API/injury scrapers), starting lineups, and player fatigue metrics.
- **Implementation Difficulty**: **High**. Modeling minutes requires a hierarchical multi-player optimization framework so team minutes sum to exactly 240 (or 265 in OT).
- **Leakage Risk**: **Medium**. Lineup shifts must be updated close to tip-off to avoid using post-game statistics.
- **Sequence**: This **is** the player minutes model.

### 4. Direct Score Target Transformation and Modeling
- **Expected Benefit**: Currently, derived margin and total points perform better than direct models due to RF/GB model limitations. Target transformation (e.g., Box-Cox or log-transform) and advanced hyperparameter tuning for XGBoost/LightGBM will improve direct margin/total prediction.
- **Required Data**: Existing feature set.
- **Implementation Difficulty**: **Low**. Only involves script modification.
- **Leakage Risk**: **None**.
- **Sequence**: Done **before** the player minutes model.

---

## Priority 3: Advanced Features (Prerequisite for Player Stat Prediction)

### 5. Travel, Fatigue, and Venue Context Features
- **Expected Benefit**: Adjusts prediction based on circadian rhythm disruption, rest day splits, altitude (e.g., playing in Denver/Utah), and travel miles in the last 7 days.
- **Required Data**: Team schedule coordinates, flight distances, local game times, and time zone changes.
- **Implementation Difficulty**: **Medium**. Simple geometry and timezone math.
- **Leakage Risk**: **None** (all schedule details are known in advance).
- **Sequence**: Done **after** the player minutes model.

### 6. Player Matchup and Defensive Rating Features
- **Expected Benefit**: Predicts individual offensive and defensive matchups (e.g., how a specific offensive star matches up against an elite defender). Essential for player-level stat forecasting.
- **Required Data**: Player-to-player tracking data, matchup frequency, and defensive matchup tracking metrics.
- **Implementation Difficulty**: **High**. Requires processing dense tracking data.
- **Leakage Risk**: **Low**.
- **Sequence**: Done **after** the player minutes model.

---

## Recommended Next Step

The single highest-priority next step is **Cross-Season Training Data Expansion** (Priority 1). Expanding the training dataset beyond the 2025-26 season will immediately reduce high variance, stabilize the Random Forest decision boundaries, and provide a much larger sample size to train the upcoming **Player Minutes Allocation Model** without overfitting.
