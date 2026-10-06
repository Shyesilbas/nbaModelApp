# NBA Team Model-Ready Dataset V3 (Core Player Availability) Report

## 1. Dataset Dimensions & Paths
- **V3 CSV Output File**: `data/processed/team_model_ready_v3_2025_26.csv`
- **V3 Parquet Output File**: `data/processed/team_model_ready_v3_2025_26.parquet`
- **Final V3 Shape**: **1772 rows, 165 columns**
- **Total Features**: **158 features** (Target `WIN` and 6 Metadata columns excluded)

## 2. Pre-Game Rolling Feature Row Drops
- **Row count after joining core availability features**: 2642
- **Row count after dropping NaNs (clean dataset)**: 1772
- **Rows dropped due to NaNs in base rolling features**: 870
  *(Explanation: These drops represent early-season games where team or opponent features are NaN because of insufficient previous history.)*

## 3. Discovered Core Roster Highlights
Below are the discovered top 5 players for a subset of prominent teams:

### LAL Core Players
- Rank 1 (Core (Top 3)): **Luka Dončić** (Importance Score: 62.66)
- Rank 2 (Core (Top 3)): **LeBron James** (Importance Score: 47.65)
- Rank 3 (Core (Top 3)): **Austin Reaves** (Importance Score: 47.53)
- Rank 4 (Secondary (Top 4-5)): **Deandre Ayton** (Importance Score: 31.44)
- Rank 5 (Secondary (Top 4-5)): **Rui Hachimura** (Importance Score: 29.89)

### BOS Core Players
- Rank 1 (Core (Top 3)): **Jaylen Brown** (Importance Score: 53.74)
- Rank 2 (Core (Top 3)): **Jayson Tatum** (Importance Score: 49.69)
- Rank 3 (Core (Top 3)): **Derrick White** (Importance Score: 39.86)
- Rank 4 (Secondary (Top 4-5)): **Payton Pritchard** (Importance Score: 39.54)
- Rank 5 (Secondary (Top 4-5)): **Neemias Queta** (Importance Score: 28.94)

### NYK Core Players
- Rank 1 (Core (Top 3)): **Jalen Brunson** (Importance Score: 51.53)
- Rank 2 (Core (Top 3)): **Karl-Anthony Towns** (Importance Score: 44.31)
- Rank 3 (Core (Top 3)): **OG Anunoby** (Importance Score: 39.04)
- Rank 4 (Secondary (Top 4-5)): **Mikal Bridges** (Importance Score: 35.61)
- Rank 5 (Secondary (Top 4-5)): **Josh Hart** (Importance Score: 35.43)

### SAS Core Players
- Rank 1 (Core (Top 3)): **Victor Wembanyama** (Importance Score: 49.12)
- Rank 2 (Core (Top 3)): **Stephon Castle** (Importance Score: 41.22)
- Rank 3 (Core (Top 3)): **De'Aaron Fox** (Importance Score: 40.83)
- Rank 4 (Secondary (Top 4-5)): **Devin Vassell** (Importance Score: 34.11)
- Rank 5 (Secondary (Top 4-5)): **Julian Champagnie** (Importance Score: 29.98)

### GSW Core Players
- Rank 1 (Core (Top 3)): **Stephen Curry** (Importance Score: 47.99)
- Rank 2 (Core (Top 3)): **Jimmy Butler III** (Importance Score: 42.82)
- Rank 3 (Core (Top 3)): **Brandin Podziemski** (Importance Score: 34.36)
- Rank 4 (Secondary (Top 4-5)): **Kristaps Porziņģis** (Importance Score: 32.74)
- Rank 5 (Secondary (Top 4-5)): **Draymond Green** (Importance Score: 29.93)

### HOU Core Players
- Rank 1 (Core (Top 3)): **Kevin Durant** (Importance Score: 51.27)
- Rank 2 (Core (Top 3)): **Alperen Sengun** (Importance Score: 47.48)
- Rank 3 (Core (Top 3)): **Amen Thompson** (Importance Score: 46.17)
- Rank 4 (Secondary (Top 4-5)): **Jabari Smith Jr.** (Importance Score: 39.39)
- Rank 5 (Secondary (Top 4-5)): **Reed Sheppard** (Importance Score: 31.19)

### POR Core Players
- Rank 1 (Core (Top 3)): **Deni Avdija** (Importance Score: 50.46)
- Rank 2 (Core (Top 3)): **Jrue Holiday** (Importance Score: 39.28)
- Rank 3 (Core (Top 3)): **Shaedon Sharpe** (Importance Score: 37.76)
- Rank 4 (Secondary (Top 4-5)): **Jerami Grant** (Importance Score: 35.98)
- Rank 5 (Secondary (Top 4-5)): **Toumani Camara** (Importance Score: 34.59)

### TOR Core Players
- Rank 1 (Core (Top 3)): **Scottie Barnes** (Importance Score: 44.91)
- Rank 2 (Core (Top 3)): **Brandon Ingram** (Importance Score: 43.82)
- Rank 3 (Core (Top 3)): **RJ Barrett** (Importance Score: 41.37)
- Rank 4 (Secondary (Top 4-5)): **Immanuel Quickley** (Importance Score: 39.57)
- Rank 5 (Secondary (Top 4-5)): **Jakob Poeltl** (Importance Score: 28.03)

## 4. Post-Tipoff Proxy Feature Warning (Potential Leakage)
> [!WARNING]
> **Potential Data Leakage Warning**: The features tracking player attendance (`PLAYED_COUNT`) and playing time (`MINUTES_SUM`) are computed from the box scores of the game being predicted. These are **post-tipoff observed stats** and are included as proxy features for analysis. In a real-world pre-game prediction environment, these features must be replaced with pre-game projections or injury reports to prevent data leakage.

## 5. Sample Rows (Core Player Availability & Metrics)
| GAME_DATE | TEAM_ABBREVIATION | OPPONENT_ABBREVIATION | TEAM_CORE_TOP3_PLAYED_COUNT | TEAM_CORE_TOP3_AVAILABLE_RATE | OPP_CORE_TOP3_PLAYED_COUNT | OPP_CORE_TOP3_AVAILABLE_RATE | TEAM_CORE_TOP3_MINUTES_SUM | OPP_CORE_TOP3_MINUTES_SUM | WIN |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2025-11-04 00:00:00 | ATL | ORL | 2 | 0.6666666666666666 | 3 | 1.0 | 65.0 | 94.0 | 1 |
| 2025-11-07 00:00:00 | ATL | TOR | 2 | 0.6666666666666666 | 3 | 1.0 | 63.0 | 103.0 | 0 |
| 2025-11-28 00:00:00 | ATL | CLE | 2 | 0.6666666666666666 | 2 | 0.6666666666666666 | 74.0 | 69.0 | 1 |
| 2025-12-01 00:00:00 | ATL | DET | 2 | 0.6666666666666666 | 3 | 1.0 | 73.0 | 96.0 | 0 |
| 2025-12-03 00:00:00 | ATL | LAC | 1 | 0.3333333333333333 | 1 | 0.3333333333333333 | 31.0 | 35.0 | 0 |
| 2025-12-06 00:00:00 | ATL | WAS | 2 | 0.6666666666666666 | 1 | 0.3333333333333333 | 71.0 | 36.0 | 1 |
| 2025-12-12 00:00:00 | ATL | DET | 2 | 0.6666666666666666 | 3 | 1.0 | 65.0 | 68.0 | 0 |
| 2025-12-14 00:00:00 | ATL | PHI | 2 | 0.6666666666666666 | 2 | 0.6666666666666666 | 69.0 | 69.0 | 1 |
| 2025-12-18 00:00:00 | ATL | CHA | 2 | 0.6666666666666666 | 3 | 1.0 | 73.0 | 99.0 | 0 |
| 2025-12-19 00:00:00 | ATL | SAS | 2 | 0.6666666666666666 | 3 | 1.0 | 64.0 | 67.0 | 0 |

