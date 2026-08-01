# NBA Team Model-Ready Dataset V2 (Opponent-Aware) Report

## 1. Dataset Dimensions & Paths
- **V2 CSV Output File**: `/Users/serhat/PycharmProjects/nbaModelApp/data/season=2020-21/processed/team_model_ready_v2.csv`
- **V2 Parquet Output File**: `/Users/serhat/PycharmProjects/nbaModelApp/data/season=2020-21/processed/team_model_ready_v2.parquet`
- **Final V2 Shape**: **1456 rows, 54 columns**
- **Total Features**: **47 features** (Target `WIN` and 6 Metadata columns excluded)

## 2. Opponent Join Validation Metrics
- **Number of Rows Before Join**: 2342
- **Number of Rows After Join**: 2342
- **Join Success Rate**: 100.00%
- **Every GAME_ID has exactly 2 rows?**: Yes ✅
- **Number of Invalid GAME_ID row counts**: 0
- **Failed Matching GAME_IDs**: None

### Missing Opponent Feature Counts (In Joined Feature Set)
| Feature | Missing (NaN) Count | Percentage |
| :--- | :---: | :---: |
| `OPP_DAYS_REST` | 30 | 1.28% |
| `OPP_IS_B2B` | 0 | 0.00% |
| `OPP_PTS_LAST_5` | 30 | 1.28% |
| `OPP_PTS_LAST_10` | 30 | 1.28% |
| `OPP_WINRATE_LAST_5` | 30 | 1.28% |
| `OPP_WINRATE_LAST_10` | 30 | 1.28% |

## 3. Pre-Game Rolling Feature Row Drops
- **Row count after join (raw features)**: 2342
- **Row count after dropping NaNs (clean dataset)**: 1456
- **Rows dropped due to NaNs**: 886
  *(Explanation: These drops represent early-season games where either the team itself or its opponent had not played enough previous games to calculate the 10-game/5-game rolling features or scheduling rest variables.)*

## 4. Feature and Target Distributions (Clean V2 Set)
### Target Variable: `WIN`
- **0**: 728 (50.00%)
- **1**: 728 (50.00%)

### Feature: `IS_HOME`
- **False**: 728 (50.00%)
- **True**: 728 (50.00%)

### Feature: `IS_PLAYOFF`
- **False**: 1274 (87.50%)
- **True**: 182 (12.50%)

## 5. Sample Rows Side-by-Side (Team vs Opponent Features)
| GAME_DATE | TEAM_ABBREVIATION | OPPONENT_ABBREVIATION | DAYS_REST | OPP_DAYS_REST | PTS_LAST_5 | OPP_PTS_LAST_5 | WINRATE_LAST_5 | OPP_WINRATE_LAST_5 | WIN |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2021-01-09 00:00:00 | ATL | CHA | 3.0 | 1.0 | 109.6 | 105.2 | 0.2 | 0.4 | 0 |
| 2021-01-20 00:00:00 | ATL | DET | 2.0 | 2.0 | 104.6 | 104.8 | 0.4 | 0.4 | 1 |
| 2021-01-22 00:00:00 | ATL | MIN | 2.0 | 2.0 | 108.2 | 103.6 | 0.6 | 0.2 | 1 |
| 2021-01-27 00:00:00 | ATL | BKN | 1.0 | 2.0 | 114.0 | 119.8 | 0.8 | 0.6 | 0 |
| 2021-02-04 00:00:00 | ATL | UTA | 1.0 | 2.0 | 113.4 | 115.6 | 0.4 | 0.8 | 0 |
| 2021-02-10 00:00:00 | ATL | DAL | 4.0 | 2.0 | 110.8 | 121.4 | 0.4 | 0.6 | 0 |
| 2021-02-15 00:00:00 | ATL | NYK | 2.0 | 2.0 | 113.4 | 107.8 | 0.2 | 0.6 | 0 |
| 2021-02-19 00:00:00 | ATL | BOS | 2.0 | 2.0 | 115.6 | 107.8 | 0.2 | 0.4 | 0 |

