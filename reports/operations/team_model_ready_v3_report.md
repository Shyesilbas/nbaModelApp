# NBA Team Model-Ready Dataset V3 (Core Player Availability) Report

## 1. Dataset Dimensions & Paths
- **V3 CSV Output File**: `data/processed/team_model_ready_v3_2020_21.csv`
- **V3 Parquet Output File**: `data/processed/team_model_ready_v3_2020_21.parquet`
- **Final V3 Shape**: **1456 rows, 113 columns**
- **Total Features**: **106 features** (Target `WIN` and 6 Metadata columns excluded)

## 2. Pre-Game Rolling Feature Row Drops
- **Row count after joining core availability features**: 2342
- **Row count after dropping NaNs (clean dataset)**: 1456
- **Rows dropped due to NaNs in base rolling features**: 886
  *(Explanation: These drops represent early-season games where team or opponent features are NaN because of insufficient previous history.)*

## 3. Discovered Core Roster Highlights
Below are the discovered top 5 players for a subset of prominent teams:

### LAL Core Players
- Rank 1 (Core (Top 3)): **LeBron James** (Importance Score: 52.59)
- Rank 2 (Core (Top 3)): **Anthony Davis** (Importance Score: 44.51)
- Rank 3 (Core (Top 3)): **Dennis Schröder** (Importance Score: 37.78)
- Rank 4 (Secondary (Top 4-5)): **Kyle Kuzma** (Importance Score: 31.31)
- Rank 5 (Secondary (Top 4-5)): **Andre Drummond** (Importance Score: 30.00)

### BOS Core Players
- Rank 1 (Core (Top 3)): **Jayson Tatum** (Importance Score: 52.86)
- Rank 2 (Core (Top 3)): **Jaylen Brown** (Importance Score: 48.18)
- Rank 3 (Core (Top 3)): **Kemba Walker** (Importance Score: 41.22)
- Rank 4 (Secondary (Top 4-5)): **Marcus Smart** (Importance Score: 36.75)
- Rank 5 (Secondary (Top 4-5)): **Evan Fournier** (Importance Score: 32.99)

### NYK Core Players
- Rank 1 (Core (Top 3)): **Julius Randle** (Importance Score: 53.31)
- Rank 2 (Core (Top 3)): **RJ Barrett** (Importance Score: 40.63)
- Rank 3 (Core (Top 3)): **Derrick Rose** (Importance Score: 34.60)
- Rank 4 (Secondary (Top 4-5)): **Alec Burks** (Importance Score: 30.20)
- Rank 5 (Secondary (Top 4-5)): **Reggie Bullock Jr.** (Importance Score: 29.11)

### SAS Core Players
- Rank 1 (Core (Top 3)): **DeMar DeRozan** (Importance Score: 46.45)
- Rank 2 (Core (Top 3)): **Dejounte Murray** (Importance Score: 40.33)
- Rank 3 (Core (Top 3)): **Derrick White** (Importance Score: 34.74)
- Rank 4 (Secondary (Top 4-5)): **Keldon Johnson** (Importance Score: 32.06)
- Rank 5 (Secondary (Top 4-5)): **Jakob Poeltl** (Importance Score: 28.36)

### GSW Core Players
- Rank 1 (Core (Top 3)): **Stephen Curry** (Importance Score: 57.25)
- Rank 2 (Core (Top 3)): **Andrew Wiggins** (Importance Score: 40.27)
- Rank 3 (Core (Top 3)): **Kelly Oubre Jr.** (Importance Score: 35.45)
- Rank 4 (Secondary (Top 4-5)): **Draymond Green** (Importance Score: 34.39)
- Rank 5 (Secondary (Top 4-5)): **James Wiseman** (Importance Score: 26.22)

### HOU Core Players
- Rank 1 (Core (Top 3)): **Christian Wood** (Importance Score: 44.31)
- Rank 2 (Core (Top 3)): **John Wall** (Importance Score: 44.11)
- Rank 3 (Core (Top 3)): **Kelly Olynyk** (Importance Score: 42.92)
- Rank 4 (Secondary (Top 4-5)): **Kevin Porter Jr.** (Importance Score: 40.02)
- Rank 5 (Secondary (Top 4-5)): **Khyri Thomas** (Importance Score: 37.86)

### POR Core Players
- Rank 1 (Core (Top 3)): **Damian Lillard** (Importance Score: 56.09)
- Rank 2 (Core (Top 3)): **CJ McCollum** (Importance Score: 46.48)
- Rank 3 (Core (Top 3)): **Norman Powell** (Importance Score: 37.77)
- Rank 4 (Secondary (Top 4-5)): **Jusuf Nurkić** (Importance Score: 32.09)
- Rank 5 (Secondary (Top 4-5)): **Robert Covington** (Importance Score: 30.14)

### TOR Core Players
- Rank 1 (Core (Top 3)): **Pascal Siakam** (Importance Score: 47.18)
- Rank 2 (Core (Top 3)): **Fred VanVleet** (Importance Score: 45.47)
- Rank 3 (Core (Top 3)): **Kyle Lowry** (Importance Score: 43.73)
- Rank 4 (Secondary (Top 4-5)): **OG Anunoby** (Importance Score: 37.60)
- Rank 5 (Secondary (Top 4-5)): **Gary Trent Jr.** (Importance Score: 35.22)

## 4. Post-Tipoff Proxy Feature Warning (Potential Leakage)
> [!WARNING]
> **Potential Data Leakage Warning**: The features tracking player attendance (`PLAYED_COUNT`) and playing time (`MINUTES_SUM`) are computed from the box scores of the game being predicted. These are **post-tipoff observed stats** and are included as proxy features for analysis. In a real-world pre-game prediction environment, these features must be replaced with pre-game projections or injury reports to prevent data leakage.

## 5. Sample Rows (Core Player Availability & Metrics)
| GAME_DATE | TEAM_ABBREVIATION | OPPONENT_ABBREVIATION | TEAM_CORE_TOP3_PLAYED_COUNT | TEAM_CORE_TOP3_AVAILABLE_RATE | OPP_CORE_TOP3_PLAYED_COUNT | OPP_CORE_TOP3_AVAILABLE_RATE | TEAM_CORE_TOP3_MINUTES_SUM | OPP_CORE_TOP3_MINUTES_SUM | WIN |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2021-01-09 00:00:00 | ATL | CHA | 3 | 1.0 | 3 | 1.0 | 94.0 | 102.0 | 0 |
| 2021-01-20 00:00:00 | ATL | DET | 3 | 1.0 | 2 | 0.6666666666666666 | 126.0 | 68.0 | 1 |
| 2021-01-22 00:00:00 | ATL | MIN | 3 | 1.0 | 2 | 0.6666666666666666 | 89.0 | 49.0 | 1 |
| 2021-01-27 00:00:00 | ATL | BKN | 3 | 1.0 | 3 | 1.0 | 113.0 | 130.0 | 0 |
| 2021-02-04 00:00:00 | ATL | UTA | 2 | 0.6666666666666666 | 3 | 1.0 | 59.0 | 81.0 | 0 |
| 2021-02-10 00:00:00 | ATL | DAL | 3 | 1.0 | 3 | 1.0 | 101.0 | 85.0 | 0 |
| 2021-02-15 00:00:00 | ATL | NYK | 3 | 1.0 | 3 | 1.0 | 106.0 | 98.0 | 0 |
| 2021-02-19 00:00:00 | ATL | BOS | 3 | 1.0 | 3 | 1.0 | 98.0 | 105.0 | 0 |
| 2021-02-23 00:00:00 | ATL | CLE | 3 | 1.0 | 3 | 1.0 | 88.0 | 111.0 | 0 |
| 2021-02-24 00:00:00 | ATL | BOS | 3 | 1.0 | 2 | 0.6666666666666666 | 81.0 | 61.0 | 1 |

