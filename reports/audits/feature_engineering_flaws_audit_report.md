# Feature Engineering & Business Logic Audit Report

## 1. Executive Summary
This audit report documents critical feature engineering design flaws, logical inconsistencies, and training-inference misalignments identified across the active production models (Win Probability, Score Prediction, and Player Prediction V6/V5). 

A key finding is that the model's explanations (XAI) occasionally display logically counter-intuitive metrics (e.g., using a team's **Home Splits** to predict a game they are playing **Away**). While mathematically consistent with the trained model inputs, this represents a conceptual design flaw in the model's feature set and leads to training-inference mismatches.

---

## 2. Identified Logic & Feature Engineering Flaws

### Flaw 1: Venue-Disconnected Split Features (The "Home-Away" Disconnect)
* **Status**: Critical Design Flaw (Active in Win & Score Models)
* **Affected Features**: 
  - `HOME_PTS_ALLOWED_LAST_5` / `AWAY_PTS_ALLOWED_LAST_5`
  - `OPP_HOME_PTS_ALLOWED_LAST_5` / `OPP_AWAY_PTS_ALLOWED_LAST_5`
  - `HOME_WINRATE_LAST_5` / `OPP_HOME_WINRATE_LAST_5`
* **The Issue**: 
  The models are trained using both home and away split columns for both teams as static features. In any given matchup (e.g., SAS vs. NYK @ SAS):
  - SAS is the **Home** team. The venue-relevant split is their **Home Form**.
  - NYK is the **Away** team. The venue-relevant split is their **Away Form**.
  
  However, because the model requires all feature columns to be present, the inference pipeline passes NYK's *Home Splits* (`OPP_HOME_PTS_ALLOWED_LAST_5`) and SAS's *Away Splits* (`AWAY_PTS_ALLOWED_LAST_5`) into the model. If the model finds the home split more statistically significant, it uses it to make the prediction, producing XAI explanations like:
  > *Home Splits Defense: New York Knicks (NYK) allowed an average of 102.4 points at home in their last 5 home games, favoring New York Knicks.*
  
  This is conceptually flawed because the Knicks are playing **Away** in this matchup; their home defensive split has no physical relevance to their performance in San Antonio.
* **Root Cause**: The feature set uses static columns for home/away splits instead of dynamically selected, venue-specific splits (e.g., `TEAM_CURRENT_VENUE_PTS_ALLOWED_LAST_5` and `OPP_CURRENT_VENUE_PTS_ALLOWED_LAST_5`).

---

### Flaw 2: Training vs. Inference Feature Drift (5-Game vs. 10-Game Mismatch)
* **Status**: Critical Mismatch (Active in Player Roster Features)
* **Affected Features**: 
  - `TEAM_CORE_TOP3_PTS_LAST_5_SUM` / `OPP_CORE_TOP3_PTS_LAST_5_SUM`
  - `TEAM_CORE_TOP3_AST_LAST_5_SUM` / `OPP_CORE_TOP3_AST_LAST_5_SUM`
  - `TEAM_CORE_TOP3_REB_LAST_5_SUM` / `OPP_CORE_TOP3_REB_LAST_5_SUM`
* **The Issue**:
  During **training** (defined in [core_player_availability_features.py](file:///Users/serhat/agProjects/nbaModelApp/src/features/core_player_availability_features.py#L49)), the roster-level features are calculated by aggregating the players' **5-game rolling averages** (`PTS_LAST_5` etc.) shifted by 1 game.
  
  During **inference** (defined in [build_matchup_features.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/build_matchup_features.py#L827-L844)), these are mapped to rolling averages computed over the last **10 games** (`tail(10).mean()`).
  
  This creates a concept drift and feature mismatch where the inference pipeline feeds a 10-game windowed average into a model that expects a 5-game windowed average.
* **Root Cause**: Desynchronized logic between the training dataset builder and the online feature construction scripts.

---

### Flaw 3: Playoff Flags Calculation Disparity
* **Status**: Medium Risk (Active in Playoff Context Features)
* **Affected Features**:
  - `IS_ELIMINATION_GAME` / `CAN_CLINCH_SERIES`
* **The Issue**:
  During training, the playoff urgency flags are mapped from a precomputed file mapping via `load_playoff_context_map()`.
  During inference, the script counts the head-to-head playoff wins on the fly by querying `game_results.csv` and sorting. If there are missing or delayed boxscores for any game in the series, the calculated series wins will be incorrect, resulting in wrong playoff urgency flags for the prediction.
* **Root Cause**: Lack of a single source of truth for series standings during inference.

---

### Flaw 4: Rest Days and Back-to-Back (B2B) Calculation Inconsistency
* **Status**: Low-Medium Risk
* **Affected Features**:
  - `DAYS_REST` / `IS_B2B`
* **The Issue**:
  In training, rest days are computed by sorting the historical logs chronologically and taking the difference between consecutive game dates.
  In inference, the script checks the `schedule_combined.csv` file first to compute rest days. If the schedule file is incomplete, or if there is an ingestion gap, it falls back to the team's last available game date. This difference in logic can cause discrepancies when schedule files are bootstrapped differently from game logs.

---

## 3. Recommended Remediation Plan

To permanently fix these issues and align the models with actual business logic, the following steps are recommended:

1. **Refactor Feature Schema to be Venue-Specific**:
   Instead of using 4 static splits (Home/Away for both teams), refactor the features to use venue-specific columns:
   - `TEAM_VENUE_PTS_ALLOWED_LAST_5` (resolves to Home split for the home team, Away split for the away team).
   - `OPP_VENUE_PTS_ALLOWED_LAST_5` (resolves to Away split for the away team, Home split for the home team).
   This requires updating [team_features.py](file:///Users/serhat/agProjects/nbaModelApp/src/features/team_features.py) and retraining the models.

2. **Unify Training and Inference Aggregation Windows**:
   Standardize all rolling averages (whether 5-game or 10-game) across training (`core_player_availability_features.py`) and inference (`build_matchup_features.py`).

3. **Create a Unified Feature Store / Feature Pipeline**:
   The primary reason for these mismatches is that feature computation is duplicated in `src/` (for training) and `scripts/` (for inference). Merging them into a single, shared feature pipeline will guarantee that inference features always match training features.
