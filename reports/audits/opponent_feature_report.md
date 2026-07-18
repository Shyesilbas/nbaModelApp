# NBA Team Model-Ready Dataset V2 (Opponent-Aware) Report

## 1. Dataset Dimensions & Paths
- **V2 CSV Output File**: `/Users/serhat/PycharmProjects/nbaModelApp/data/season=2025-26/processed/team_model_ready_v2.csv`
- **V2 Parquet Output File**: `/Users/serhat/PycharmProjects/nbaModelApp/data/season=2025-26/processed/team_model_ready_v2.parquet`
- **Final V2 Shape**: **1772 rows, 54 columns**
- **Total Features**: **47 features** (Target `WIN` and 6 Metadata columns excluded)

## 2. Opponent Join Validation Metrics
- **Number of Rows Before Join**: 2642
- **Number of Rows After Join**: 2642
- **Join Success Rate**: 100.00%
- **Every GAME_ID has exactly 2 rows?**: Yes ✅
- **Number of Invalid GAME_ID row counts**: 0
- **Failed Matching GAME_IDs**: None

### Missing Opponent Feature Counts (In Joined Feature Set)
| Feature | Missing (NaN) Count | Percentage |
| :--- | :---: | :---: |
| `OPP_DAYS_REST` | 30 | 1.14% |
| `OPP_IS_B2B` | 0 | 0.00% |
| `OPP_PTS_LAST_5` | 30 | 1.14% |
| `OPP_PTS_LAST_10` | 30 | 1.14% |
| `OPP_WINRATE_LAST_5` | 30 | 1.14% |
| `OPP_WINRATE_LAST_10` | 30 | 1.14% |

## 3. Pre-Game Rolling Feature Row Drops
- **Row count after join (raw features)**: 2642
- **Row count after dropping NaNs (clean dataset)**: 1772
- **Rows dropped due to NaNs**: 870
  *(Explanation: These drops represent early-season games where either the team itself or its opponent had not played enough previous games to calculate the 10-game/5-game rolling features or scheduling rest variables.)*

## 4. Feature and Target Distributions (Clean V2 Set)
### Target Variable: `WIN`
- **1**: 886 (50.00%)
- **0**: 886 (50.00%)

### Feature: `IS_HOME`
- **False**: 888 (50.11%)
- **True**: 884 (49.89%)

### Feature: `IS_PLAYOFF`
- **False**: 1590 (89.73%)
- **True**: 182 (10.27%)

## 5. Sample Rows Side-by-Side (Team vs Opponent Features)
| GAME_DATE | TEAM_ABBREVIATION | OPPONENT_ABBREVIATION | DAYS_REST | OPP_DAYS_REST | PTS_LAST_5 | OPP_PTS_LAST_5 | WINRATE_LAST_5 | OPP_WINRATE_LAST_5 | WIN |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2025-11-04 00:00:00 | ATL | ORL | 2.0 | 3.0 | 115.4 | 117.2 | 0.4 | 0.4 | 1 |
| 2025-11-07 00:00:00 | ATL | TOR | 3.0 | 3.0 | 120.8 | 116.2 | 0.6 | 0.6 | 0 |
| 2025-11-28 00:00:00 | ATL | CLE | 3.0 | 4.0 | 115.8 | 112.2 | 0.4 | 0.6 | 1 |
| 2025-12-01 00:00:00 | ATL | DET | 1.0 | 2.0 | 122.6 | 122.4 | 0.8 | 0.6 | 0 |
| 2025-12-03 00:00:00 | ATL | LAC | 2.0 | 2.0 | 119.2 | 112.6 | 0.6 | 0.0 | 0 |
| 2025-12-06 00:00:00 | ATL | WAS | 1.0 | 2.0 | 119.0 | 110.0 | 0.4 | 0.4 | 1 |
| 2025-12-12 00:00:00 | ATL | DET | 6.0 | 6.0 | 119.2 | 118.4 | 0.4 | 0.8 | 0 |
| 2025-12-14 00:00:00 | ATL | PHI | 2.0 | 2.0 | 113.8 | 111.8 | 0.2 | 0.8 | 1 |

