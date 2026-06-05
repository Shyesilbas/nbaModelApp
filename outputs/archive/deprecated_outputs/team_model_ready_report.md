# NBA Team Model-Ready Dataset Summary Report

This report summarizes the structure and distributions of the final supervised learning dataset constructed for team-level game outcome prediction.

---

## 1. Dataset Dimensions & Paths
- **CSV Output File**: `data/processed/team_model_ready_2025_26.csv`
- **Parquet Output File**: `data/processed/team_model_ready_2025_26.parquet`
- **Final Shape**: **2,592 rows, 16 columns**
- **Original Feature-Engineered Row Count**: 2,622 rows
- **Dropped Row Count**: **30 rows**
  - *Note: This represents exactly 1 game per NBA team (30 teams total). These are the first games of the season for each team, which do not have preceding scheduling or performance history, resulting in NaN values for days of rest and rolling statistics.*

---

## 2. Columns & Role Specification

### Target Variable
- **`WIN`**: Binary label (1 if the team won the game, 0 if they lost).

### Pre-Game Features (Allowed)
These features represent information that is known *before* tip-off. All in-game box score metrics (such as points, rebounds, assists, and percentages) have been excluded to prevent data leakage.

| Column Name | Data Type | Description |
| :--- | :--- | :--- |
| **`OPPONENT_ABBREVIATION`** | object / category | The abbreviation of the opponent team. |
| **`IS_HOME`** | bool | True if the game is played at home, False if away. |
| **`IS_PLAYOFF`** | bool | True if the game is a postseason/playoff game. |
| **`DAYS_REST`** | float | Number of rest days since the team's last game. |
| **`IS_B2B`** | bool | True if the team is playing on zero days of rest (back-to-back). |
| **`PTS_LAST_5`** | float | Rolling points scored per game over the team's previous 5 games. |
| **`PTS_LAST_10`** | float | Rolling points scored per game over the team's previous 10 games. |
| **`WINRATE_LAST_5`** | float | Winning percentage over the team's previous 5 games. |
| **`WINRATE_LAST_10`** | float | Winning percentage over the team's previous 10 games. |

### Metadata Columns
Retained for tracking, joins, analysis, and back-testing validation, but not intended to be passed as direct input features to the prediction model:
- **`TEAM_ID`**
- **`TEAM_ABBREVIATION`**
- **`TEAM_NAME`**
- **`GAME_ID`**
- **`GAME_DATE`**
- **`MATCHUP`**

---

## 3. Class and Attribute Distributions

### A. Target Column: `WIN`
The target variable is highly balanced (near-perfect 50/50 split), reflecting the structure of NBA team game logs (where every win matches an opponent's loss, minorly perturbed by dropping early games).

- **1 (Win)**: 1,297 rows (50.04%)
- **0 (Loss)**: 1,295 rows (49.96%)
- **Total**: 2,592 rows

### B. Feature Column: `IS_HOME`
Reflects whether the team was the home or visiting team. The small imbalance is due to dropping the first game of each team's schedule.

- **False (Away)**: 1,301 rows (50.19%)
- **True (Home)**: 1,291 rows (49.81%)
- **Total**: 2,592 rows

### C. Feature Column: `IS_PLAYOFF`
The postseason vs. regular season breakdown of the dataset.

- **False (Regular Season)**: 2,430 rows (93.75%)
- **True (Playoffs)**: 162 rows (6.25%)
- **Total**: 2,592 rows
  - *Note: None of the playoff games were dropped, as they all occurred late in the season and thus had complete regular-season historical data.*
