# NBA Team Model-Ready Dataset V3 (Core Player Availability) Report

## 1. Dataset Dimensions & Paths
- **V3 CSV Output File**: `data/processed/team_model_ready_v3_2021_22.csv`
- **V3 Parquet Output File**: `data/processed/team_model_ready_v3_2021_22.parquet`
- **Final V3 Shape**: **1766 rows, 105 columns**
- **Total Features**: **98 features** (Target `WIN` and 6 Metadata columns excluded)

## 2. Pre-Game Rolling Feature Row Drops
- **Row count after joining core availability features**: 2646
- **Row count after dropping NaNs (clean dataset)**: 1766
- **Rows dropped due to NaNs in base rolling features**: 880
  *(Explanation: These drops represent early-season games where team or opponent features are NaN because of insufficient previous history.)*

## 3. Discovered Core Roster Highlights
Below are the discovered top 5 players for a subset of prominent teams:

### LAL Core Players
- Rank 1 (Core (Top 3)): **LeBron James** (Importance Score: 58.79)
- Rank 2 (Core (Top 3)): **Anthony Davis** (Importance Score: 49.12)
- Rank 3 (Core (Top 3)): **Russell Westbrook** (Importance Score: 45.76)
- Rank 4 (Secondary (Top 4-5)): **Malik Monk** (Importance Score: 32.18)
- Rank 5 (Secondary (Top 4-5)): **Carmelo Anthony** (Importance Score: 29.66)

### BOS Core Players
- Rank 1 (Core (Top 3)): **Jayson Tatum** (Importance Score: 53.67)
- Rank 2 (Core (Top 3)): **Jaylen Brown** (Importance Score: 47.54)
- Rank 3 (Core (Top 3)): **Marcus Smart** (Importance Score: 36.55)
- Rank 4 (Secondary (Top 4-5)): **Al Horford** (Importance Score: 33.49)
- Rank 5 (Secondary (Top 4-5)): **Robert Williams III** (Importance Score: 30.28)

### NYK Core Players
- Rank 1 (Core (Top 3)): **Julius Randle** (Importance Score: 47.83)
- Rank 2 (Core (Top 3)): **RJ Barrett** (Importance Score: 43.18)
- Rank 3 (Core (Top 3)): **Evan Fournier** (Importance Score: 32.10)
- Rank 4 (Secondary (Top 4-5)): **Alec Burks** (Importance Score: 31.28)
- Rank 5 (Secondary (Top 4-5)): **Derrick Rose** (Importance Score: 29.20)

### SAS Core Players
- Rank 1 (Core (Top 3)): **Dejounte Murray** (Importance Score: 50.78)
- Rank 2 (Core (Top 3)): **Keldon Johnson** (Importance Score: 38.35)
- Rank 3 (Core (Top 3)): **Jakob Poeltl** (Importance Score: 35.79)
- Rank 4 (Secondary (Top 4-5)): **Devin Vassell** (Importance Score: 30.24)
- Rank 5 (Secondary (Top 4-5)): **Josh Richardson** (Importance Score: 27.30)

### GSW Core Players
- Rank 1 (Core (Top 3)): **Stephen Curry** (Importance Score: 51.35)
- Rank 2 (Core (Top 3)): **Klay Thompson** (Importance Score: 40.26)
- Rank 3 (Core (Top 3)): **Andrew Wiggins** (Importance Score: 38.15)
- Rank 4 (Secondary (Top 4-5)): **Jordan Poole** (Importance Score: 38.01)
- Rank 5 (Secondary (Top 4-5)): **Draymond Green** (Importance Score: 32.36)

### HOU Core Players
- Rank 1 (Core (Top 3)): **Christian Wood** (Importance Score: 41.17)
- Rank 2 (Core (Top 3)): **Kevin Porter Jr.** (Importance Score: 38.73)
- Rank 3 (Core (Top 3)): **Jalen Green** (Importance Score: 37.38)
- Rank 4 (Secondary (Top 4-5)): **Eric Gordon** (Importance Score: 31.41)
- Rank 5 (Secondary (Top 4-5)): **Dennis Schröder** (Importance Score: 31.06)

### POR Core Players
- Rank 1 (Core (Top 3)): **Damian Lillard** (Importance Score: 50.49)
- Rank 2 (Core (Top 3)): **Josh Hart** (Importance Score: 42.64)
- Rank 3 (Core (Top 3)): **Jusuf Nurkić** (Importance Score: 38.01)
- Rank 4 (Secondary (Top 4-5)): **Anfernee Simons** (Importance Score: 36.77)
- Rank 5 (Secondary (Top 4-5)): **Drew Eubanks** (Importance Score: 35.62)

### TOR Core Players
- Rank 1 (Core (Top 3)): **Pascal Siakam** (Importance Score: 51.32)
- Rank 2 (Core (Top 3)): **Fred VanVleet** (Importance Score: 46.72)
- Rank 3 (Core (Top 3)): **OG Anunoby** (Importance Score: 40.42)
- Rank 4 (Secondary (Top 4-5)): **Scottie Barnes** (Importance Score: 40.19)
- Rank 5 (Secondary (Top 4-5)): **Gary Trent Jr.** (Importance Score: 38.66)

## 4. Post-Tipoff Proxy Feature Warning (Potential Leakage)
> [!WARNING]
> **Potential Data Leakage Warning**: The features tracking player attendance (`PLAYED_COUNT`) and playing time (`MINUTES_SUM`) are computed from the box scores of the game being predicted. These are **post-tipoff observed stats** and are included as proxy features for analysis. In a real-world pre-game prediction environment, these features must be replaced with pre-game projections or injury reports to prevent data leakage.

## 5. Sample Rows (Core Player Availability & Metrics)
| GAME_DATE | TEAM_ABBREVIATION | OPPONENT_ABBREVIATION | TEAM_CORE_TOP3_PLAYED_COUNT | TEAM_CORE_TOP3_AVAILABLE_RATE | OPP_CORE_TOP3_PLAYED_COUNT | OPP_CORE_TOP3_AVAILABLE_RATE | TEAM_CORE_TOP3_MINUTES_SUM | OPP_CORE_TOP3_MINUTES_SUM | WIN |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2021-11-01 00:00:00 | ATL | WAS | 3 | 1.0 | 2 | 0.6666666666666666 | 101.0 | 68.0 | 1 |
| 2021-11-09 00:00:00 | ATL | UTA | 2 | 0.6666666666666666 | 3 | 1.0 | 70.0 | 87.0 | 0 |
| 2021-12-03 00:00:00 | ATL | PHI | 2 | 0.6666666666666666 | 1 | 0.3333333333333333 | 69.0 | 36.0 | 0 |
| 2021-12-05 00:00:00 | ATL | CHA | 2 | 0.6666666666666666 | 1 | 0.3333333333333333 | 74.0 | 40.0 | 0 |
| 2021-12-10 00:00:00 | ATL | BKN | 2 | 0.6666666666666666 | 1 | 0.3333333333333333 | 74.0 | 38.0 | 0 |
| 2021-12-15 00:00:00 | ATL | ORL | 2 | 0.6666666666666666 | 3 | 1.0 | 66.0 | 98.0 | 1 |
| 2021-12-17 00:00:00 | ATL | DEN | 2 | 0.6666666666666666 | 3 | 1.0 | 67.0 | 84.0 | 0 |
| 2021-12-22 00:00:00 | ATL | ORL | 2 | 0.6666666666666666 | 1 | 0.3333333333333333 | 63.0 | 36.0 | 0 |
| 2021-12-23 00:00:00 | ATL | PHI | 2 | 0.6666666666666666 | 2 | 0.6666666666666666 | 59.0 | 74.0 | 1 |
| 2021-12-25 00:00:00 | ATL | NYK | 2 | 0.6666666666666666 | 3 | 1.0 | 69.0 | 91.0 | 0 |

