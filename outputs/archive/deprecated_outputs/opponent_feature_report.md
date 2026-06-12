# NBA Team Model-Ready Dataset V2 (Opponent-Aware) Report

## 1. Dataset Dimensions & Paths
- **V2 CSV Output File**: `/Users/serhat/agProjects/nbaModelApp/data/season=2021-22/processed/team_model_ready_v2.csv`
- **V2 Parquet Output File**: `/Users/serhat/agProjects/nbaModelApp/data/season=2021-22/processed/team_model_ready_v2.parquet`
- **Final V2 Shape**: **1766 rows, 46 columns**
- **Total Features**: **39 features** (Target `WIN` and 6 Metadata columns excluded)

## 2. Opponent Join Validation Metrics
- **Number of Rows Before Join**: 2646
- **Number of Rows After Join**: 2646
- **Join Success Rate**: 100.00%
- **Every GAME_ID has exactly 2 rows?**: Yes ✅
- **Number of Invalid GAME_ID row counts**: 0
- **Failed Matching GAME_IDs**: None

### Missing Opponent Feature Counts (In Joined Feature Set)
| Feature | Missing (NaN) Count | Percentage |
| :--- | :---: | :---: |
| `OPP_DAYS_REST` | 30 | 1.13% |
| `OPP_IS_B2B` | 0 | 0.00% |
| `OPP_PTS_LAST_5` | 30 | 1.13% |
| `OPP_PTS_LAST_10` | 30 | 1.13% |
| `OPP_WINRATE_LAST_5` | 30 | 1.13% |
| `OPP_WINRATE_LAST_10` | 30 | 1.13% |

## 3. Pre-Game Rolling Feature Row Drops
- **Row count after join (raw features)**: 2646
- **Row count after dropping NaNs (clean dataset)**: 1766
- **Rows dropped due to NaNs**: 880
  *(Explanation: These drops represent early-season games where either the team itself or its opponent had not played enough previous games to calculate the 10-game/5-game rolling features or scheduling rest variables.)*

## 4. Feature and Target Distributions (Clean V2 Set)
### Target Variable: `WIN`
- **1**: 883 (50.00%)
- **0**: 883 (50.00%)

### Feature: `IS_HOME`
- **True**: 883 (50.00%)
- **False**: 883 (50.00%)

### Feature: `IS_PLAYOFF`
- **False**: 1592 (90.15%)
- **True**: 174 (9.85%)

## 5. Sample Rows Side-by-Side (Team vs Opponent Features)
| GAME_DATE | TEAM_ABBREVIATION | OPPONENT_ABBREVIATION | DAYS_REST | OPP_DAYS_REST | PTS_LAST_5 | OPP_PTS_LAST_5 | WINRATE_LAST_5 | OPP_WINRATE_LAST_5 | WIN |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2021-11-01 00:00:00 | ATL | WAS | 2.0 | 2.0 | 104.8 | 115.6 | 0.4 | 0.8 | 1 |
| 2021-11-09 00:00:00 | ATL | UTA | 1.0 | 2.0 | 110.8 | 111.4 | 0.2 | 0.6 | 0 |
| 2021-12-03 00:00:00 | ATL | PHI | 2.0 | 2.0 | 114.6 | 101.2 | 0.8 | 0.4 | 0 |
| 2021-12-05 00:00:00 | ATL | CHA | 2.0 | 4.0 | 111.2 | 125.2 | 0.6 | 0.4 | 0 |
| 2021-12-10 00:00:00 | ATL | BKN | 4.0 | 2.0 | 109.6 | 107.0 | 0.4 | 0.6 | 0 |
| 2021-12-15 00:00:00 | ATL | ORL | 2.0 | 3.0 | 115.0 | 107.8 | 0.2 | 0.0 | 1 |
| 2021-12-17 00:00:00 | ATL | DEN | 2.0 | 2.0 | 118.0 | 115.6 | 0.4 | 0.6 | 0 |
| 2021-12-22 00:00:00 | ATL | ORL | 5.0 | 4.0 | 115.6 | 100.4 | 0.4 | 0.2 | 0 |

