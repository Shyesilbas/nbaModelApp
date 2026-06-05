# Real Data Preprocessing & Validation Report

This report documents the verification results of running the NBA Preprocessing and Feature Engineering pipeline on the real 2025-26 NBA datasets.

---

## 1. Raw Dataset Inspection

Both datasets were successfully loaded and validated against their expected schemas:

### Team Game Logs
- **File**: `data/raw/team_games/nba_team_games_2025_26_regular_and_playoffs.csv`
- **Parsed Size**: 2,622 rows, 29 columns
- **Season Type Distribution**:
  - Regular Season: 2,460 rows
  - Playoffs: 162 rows
- **Schema Validation**: Passed (All 29 required columns found)
- **Null Values**: 0 nulls detected
- **Duplicates**: 0 duplicates detected

### Player Game Logs
- **File**: `data/raw/player_games/nba_player_games_2025_26_regular_and_playoffs.csv`
- **Parsed Size**: 27,757 rows, 29 columns
- **Season Type Distribution**:
  - Regular Season: 25,923 rows
  - Playoffs: 1,834 rows
- **Schema Validation**: Passed (All 29 required columns found)
- **Null Values**: 0 nulls detected
- **Duplicates**: 0 duplicates detected

---

## 2. Engineered Output Shapes

The engineered features were successfully computed and written to CSV and Parquet format in `data/features/`:

| Feature Set | Output File | Rows | Columns | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Team Games** | `team_games_features_2025_26.csv` | **2,622** | **39** | Raw columns (29) + 10 engineered features |
| **Player Games** | `player_games_features_2025_26.csv` | **27,757** | **41** | Raw columns (29) + 12 engineered features |

---

## 3. Core Feature Verification

### A. Days of Rest (`DAYS_REST`) & Back-to-Back (`IS_B2B`) Logic
- **Grouping Check**:
  - Team `DAYS_REST` is grouped correctly by `TEAM_ID` (preventing mixing of different teams' schedules).
  - Player `DAYS_REST` is grouped correctly by `Player_ID` (preventing mixing of different players' scheduling).
- **Logical Validation**:
  - `IS_B2B` is evaluated as `True` **only** when `DAYS_REST == 1.0`.
  - Checking mismatch rows where `IS_B2B != (DAYS_REST == 1.0)`:
    - **Team Game Logs**: 0 mismatches
    - **Player Game Logs**: 0 mismatches

### B. Prevention of Data Leakage (Rolling Features)
All rolling features are calculated over historical values by grouping by the entity, sorting chronologically by date, and calling `.shift(1)`. This ensures that a game's own statistics do not leak into the rolling averages.

#### Leakage Verification (Team Level: ATL)
- First 5 games points: `[118, 111, 100, 123, 117]`
- Expected `PTS_LAST_5` for 6th game (Mean of first 5): **`113.8000`**
- Actual `PTS_LAST_5` value in 6th game row: **`113.8000`**
- **Difference**: `0.0000` (Passed)

#### Leakage Verification (Player Level: LeBron James)
- First 5 games points: `[11, 17, 25, 13, 10]`
- Expected `PTS_LAST_5` for 6th game (Mean of first 5): **`15.2000`**
- Actual `PTS_LAST_5` value in 6th game row: **`15.2000`**
- **Difference**: `0.0000` (Passed)

---

## 4. Early-Season NaN Behavior (First Few Rows)

As expected, early games do not have sufficient history to populate rolling statistics. The first games show `NaN` values, which are kept as-is to avoid introducing biased default values.

### Example: Atlanta Hawks (First 5 Games)
```text
    GAME_DATE      MATCHUP WL  PTS  DAYS_REST  IS_B2B  PTS_LAST_5  WINRATE_LAST_5
0  2025-10-22  ATL vs. TOR  L  118        NaN   False         NaN             NaN
1  2025-10-24    ATL @ ORL  W  111        2.0   False  118.000000        0.000000
2  2025-10-25  ATL vs. OKC  L  100        1.0    True  114.500000        0.500000
3  2025-10-27    ATL @ CHI  L  123        2.0   False  109.666667        0.333333
4  2025-10-29    ATL @ BKN  W  117        2.0   False  113.000000        0.250000
```

### Example: LeBron James (First 5 Games)
```text
    GAME_DATE      MATCHUP WL  PTS   MIN  DAYS_REST  IS_B2B  PTS_LAST_5  MIN_LAST_5  PLUS_MINUS_LAST_5
0  2025-11-18  LAL vs. UTA  W   11  30.0        NaN   False         NaN         NaN                NaN
1  2025-11-23    LAL @ UTA  W   17  34.0        5.0   False   11.000000        30.0           1.000000
2  2025-11-25  LAL vs. LAC  W   25  32.0        2.0   False   14.000000        32.0          -6.500000
3  2025-11-28  LAL vs. DAL  W   13  32.0        3.0   False   17.666667        32.0           1.666667
4  2025-12-01  LAL vs. PHX  L   10  35.0        3.0   False   16.500000        32.5           4.500000
```
*(Note: MINUTES column is parsed properly from standard NBA string formats to numeric decimals).*
