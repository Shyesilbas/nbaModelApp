# NBA Team Model-Ready Dataset V3 (Core Player Availability) Report

## 1. Dataset Dimensions & Paths
- **V3 CSV Output File**: `data/processed/team_model_ready_v3_2025_26.csv`
- **V3 Parquet Output File**: `data/processed/team_model_ready_v3_2025_26.parquet`
- **Final V3 Shape**: **2590 rows, 62 columns**
- **Total Features**: **55 features** (Target `WIN` and 6 Metadata columns excluded)

## 2. Pre-Game Rolling Feature Row Drops
- **Row count after joining core availability features**: 2622
- **Row count after dropping NaNs (clean dataset)**: 2590
- **Rows dropped due to NaNs in base rolling features**: 32
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
- Rank 5 (Secondary (Top 4-5)): **Anfernee Simons** (Importance Score: 29.76)

### NYK Core Players
- Rank 1 (Core (Top 3)): **Jalen Brunson** (Importance Score: 51.15)
- Rank 2 (Core (Top 3)): **Karl-Anthony Towns** (Importance Score: 44.74)
- Rank 3 (Core (Top 3)): **OG Anunoby** (Importance Score: 38.74)
- Rank 4 (Secondary (Top 4-5)): **Mikal Bridges** (Importance Score: 35.73)
- Rank 5 (Secondary (Top 4-5)): **Josh Hart** (Importance Score: 35.56)

### SAS Core Players
- Rank 1 (Core (Top 3)): **Victor Wembanyama** (Importance Score: 48.84)
- Rank 2 (Core (Top 3)): **Stephon Castle** (Importance Score: 41.46)
- Rank 3 (Core (Top 3)): **De'Aaron Fox** (Importance Score: 40.91)
- Rank 4 (Secondary (Top 4-5)): **Devin Vassell** (Importance Score: 33.88)
- Rank 5 (Secondary (Top 4-5)): **Julian Champagnie** (Importance Score: 29.99)

### GSW Core Players
- Rank 1 (Core (Top 3)): **Stephen Curry** (Importance Score: 47.96)
- Rank 2 (Core (Top 3)): **Jimmy Butler III** (Importance Score: 42.82)
- Rank 3 (Core (Top 3)): **Brandin Podziemski** (Importance Score: 34.08)
- Rank 4 (Secondary (Top 4-5)): **Kristaps Porziņģis** (Importance Score: 33.10)
- Rank 5 (Secondary (Top 4-5)): **Draymond Green** (Importance Score: 29.86)

### HOU Core Players
- Rank 1 (Core (Top 3)): **Kevin Durant** (Importance Score: 51.27)
- Rank 2 (Core (Top 3)): **Alperen Sengun** (Importance Score: 47.48)
- Rank 3 (Core (Top 3)): **Amen Thompson** (Importance Score: 46.17)
- Rank 4 (Secondary (Top 4-5)): **Jabari Smith Jr.** (Importance Score: 39.39)
- Rank 5 (Secondary (Top 4-5)): **Reed Sheppard** (Importance Score: 31.19)

### POR Core Players
- Rank 1 (Core (Top 3)): **Deni Avdija** (Importance Score: 50.13)
- Rank 2 (Core (Top 3)): **Jrue Holiday** (Importance Score: 39.17)
- Rank 3 (Core (Top 3)): **Shaedon Sharpe** (Importance Score: 38.01)
- Rank 4 (Secondary (Top 4-5)): **Jerami Grant** (Importance Score: 36.13)
- Rank 5 (Secondary (Top 4-5)): **Toumani Camara** (Importance Score: 34.67)

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
| 2025-10-24 00:00:00 | ATL | ORL | 3 | 1.0 | 3 | 1.0 | 91.0 | 104.0 | 1 |
| 2025-10-25 00:00:00 | ATL | OKC | 2 | 0.6666666666666666 | 2 | 0.6666666666666666 | 60.0 | 56.0 | 0 |
| 2025-10-27 00:00:00 | ATL | CHI | 3 | 1.0 | 2 | 0.6666666666666666 | 96.0 | 67.0 | 0 |
| 2025-10-29 00:00:00 | ATL | BKN | 3 | 1.0 | 3 | 1.0 | 68.0 | 97.0 | 1 |
| 2025-10-31 00:00:00 | ATL | IND | 2 | 0.6666666666666666 | 1 | 0.3333333333333333 | 65.0 | 30.0 | 1 |
| 2025-11-02 00:00:00 | ATL | CLE | 2 | 0.6666666666666666 | 2 | 0.6666666666666666 | 69.0 | 71.0 | 0 |
| 2025-11-04 00:00:00 | ATL | ORL | 2 | 0.6666666666666666 | 3 | 1.0 | 65.0 | 94.0 | 1 |
| 2025-11-07 00:00:00 | ATL | TOR | 2 | 0.6666666666666666 | 3 | 1.0 | 63.0 | 103.0 | 0 |
| 2025-11-08 00:00:00 | ATL | LAL | 0 | 0.0 | 1 | 0.3333333333333333 | 0.0 | 27.0 | 1 |
| 2025-11-10 00:00:00 | ATL | LAC | 1 | 0.3333333333333333 | 1 | 0.3333333333333333 | 35.0 | 39.0 | 1 |

