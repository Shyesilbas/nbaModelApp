# NBA Team Model-Ready Dataset V2 (Opponent-Aware) Report

## 1. Dataset Dimensions & Paths
- **V2 CSV Output File**: `data/processed/team_model_ready_v2_2025_26.csv`
- **V2 Parquet Output File**: `data/processed/team_model_ready_v2_2025_26.parquet`
- **Final V2 Shape**: **2590 rows, 22 columns**
- **Total Features**: **15 features** (Target `WIN` and 6 Metadata columns excluded)

## 2. Opponent Join Validation Metrics
- **Number of Rows Before Join**: 2622
- **Number of Rows After Join**: 2622
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
- **Row count after join (raw features)**: 2622
- **Row count after dropping NaNs (clean dataset)**: 2590
- **Rows dropped due to NaNs**: 32
  *(Explanation: These drops represent early-season games where either the team itself or its opponent had not played enough previous games to calculate the 10-game/5-game rolling features or scheduling rest variables.)*

## 4. Feature and Target Distributions (Clean V2 Set)
### Target Variable: `WIN`
- **1**: 1295 (50.00%)
- **0**: 1295 (50.00%)

### Feature: `IS_HOME`
- **False**: 1300 (50.19%)
- **True**: 1290 (49.81%)

### Feature: `IS_PLAYOFF`
- **False**: 2428 (93.75%)
- **True**: 162 (6.25%)

## 5. Sample Rows Side-by-Side (Team vs Opponent Features)
| GAME_DATE | TEAM_ABBREVIATION | OPPONENT_ABBREVIATION | DAYS_REST | OPP_DAYS_REST | PTS_LAST_5 | OPP_PTS_LAST_5 | WINRATE_LAST_5 | OPP_WINRATE_LAST_5 | WIN |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2025-10-24 00:00:00 | ATL | ORL | 2.0 | 2.0 | 118.0 | 125.0 | 0.0 | 1.0 | 1 |
| 2025-10-25 00:00:00 | ATL | OKC | 1.0 | 2.0 | 114.5 | 133.0 | 0.5 | 1.0 | 0 |
| 2025-10-27 00:00:00 | ATL | CHI | 2.0 | 2.0 | 109.66666666666667 | 112.5 | 0.3333333333333333 | 1.0 | 0 |
| 2025-10-29 00:00:00 | ATL | BKN | 2.0 | 2.0 | 113.0 | 114.25 | 0.25 | 0.0 | 1 |
| 2025-10-31 00:00:00 | ATL | IND | 2.0 | 2.0 | 113.8 | 113.25 | 0.4 | 0.0 | 1 |
| 2025-11-02 00:00:00 | ATL | CLE | 2.0 | 2.0 | 115.8 | 114.2 | 0.6 | 0.6 | 0 |
| 2025-11-04 00:00:00 | ATL | ORL | 2.0 | 3.0 | 115.4 | 117.2 | 0.4 | 0.4 | 1 |
| 2025-11-07 00:00:00 | ATL | TOR | 3.0 | 3.0 | 120.8 | 116.2 | 0.6 | 0.6 | 0 |

