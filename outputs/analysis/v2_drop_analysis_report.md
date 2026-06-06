# V2 Enhanced Dataset — Row Drop Analysis Report

> Generated: 2026-06-06
> Dataset: `team_model_ready_v2_2025_26.csv`

## Executive Summary

The Enhanced V2 dataset drops **878 rows** (33.3%) out of **2,636 raw team game rows**. The dominant cause is **Head-to-Head (H2H) features** — a team's first matchup against any opponent in the season has no historical H2H data, creating NaN values that trigger the row drop.

Removing H2H features from the NaN-drop requirement would recover **770 rows**, reducing total drops from 878 to just **108** (4.1%).

---

## 1. Dataset Dimensions

| Metric | Value |
| :--- | ---: |
| Raw team game rows (features) | 2,636 |
| V2 model-ready rows (after NaN drop) | 1,758 |
| **Total dropped rows** | **878 (33.3%)** |
| V2 columns (features + metadata) | 46 |
| V2 unique teams | 30 |
| V2 unique games | 879 |
| V2 date range | 2025-10-29 → 2026-06-05 |

---

## 2. Feature Group Breakdown

V2 enforces `dropna()` on all rolling feature columns. These columns belong to five logical groups:

### 2.1 NaN Rows Per Feature Group

| Feature Group | NaN Columns | Rows with ≥1 NaN | % of Total |
| :--- | :---: | ---: | ---: |
| Base Team Rolling | `PTS_LAST_5/10`, `WINRATE_LAST_5/10`, `DAYS_REST` | 30 | 1.1% |
| Base Opponent Rolling | `OPP_PTS_LAST_5/10`, `OPP_WINRATE_LAST_5/10` | — | — |
| Defensive Rolling | `PTS_ALLOWED_LAST_5/10`, `OPP_PTS_ALLOWED_LAST_5/10` | 30 | 1.1% |
| Home/Away Split Form | `HOME_*_LAST_5`, `AWAY_*_LAST_5` (12 cols) | 108 | 4.1% |
| **Head-to-Head** | `H2H_*_LAST_5`, `OPP_H2H_*_LAST_5` (6 cols) | **874** | **33.2%** |

> **Note:** "Base Opponent Rolling" columns are created during the opponent-join step, so their NaN pattern mirrors the team-side NaN pattern (same 30 first-game rows).

### 2.2 Marginal (Unique) Drops Per Group

This answers: "If we removed this group from the NaN requirement, how many additional rows would we recover?"

| Feature Group | Rows with NaN ONLY in this group |
| :--- | ---: |
| Base Team Rolling | 0 |
| Base Opponent Rolling | 0 |
| Defensive Rolling | 0 |
| Home/Away Split Form | 0 |
| **Head-to-Head** | **766** |

**Interpretation:** 766 rows are dropped *solely* because of H2H NaNs — every other feature group already has valid values for these rows. The remaining 108 rows dropped by H2H also overlap with Home/Away or Base rolling NaN rows.

---

## 3. Root Cause: Head-to-Head NaN Pattern

### Why H2H creates so many NaNs

The NBA has 30 teams, creating **435 unique matchup pairs**. Each pair's first meeting in the season produces H2H NaN values because there is no prior season history to compute rolling stats from. With `shift(1)`, even the 2nd meeting can have a NaN if no prior encounter exists.

| Statistic | Value |
| :--- | :--- |
| Total unique matchup pairs (season) | 439 |
| Matchup pairs with ≥1 H2H NaN row | 439 (100%) |
| H2H NaN date range | Oct 21, 2025 → Mar 28, 2026 |
| H2H valid date range | Oct 29, 2025 → Jun 05, 2026 |

### H2H NaN Distribution by Month

| Month | NaN Rows |
| :---: | ---: |
| Oct 2025 | 154 |
| Nov 2025 | 308 |
| Dec 2025 | 167 |
| Jan 2026 | 131 |
| Feb 2026 | 58 |
| Mar 2026 | 56 |

H2H NaN rows peak in October–November (early season) when most matchup pairs haven't met yet, and decay through March as the schedule fills in cross-conference games.

### H2H Games Count (when valid)

| Metric | Value |
| :--- | ---: |
| Mean H2H games per row | 1.94 |
| Median | 2 |
| Max | 5 |
| Min | 1 |

Most valid H2H rows have only 1–2 prior meetings, suggesting the feature is relatively sparse even when present.

---

## 4. Per-Column NaN Counts (Feature Dataset)

| Column | NaN Count | % of Total |
| :--- | ---: | ---: |
| `DAYS_REST` | 30 | 1.1% |
| `PTS_LAST_5` | 30 | 1.1% |
| `PTS_LAST_10` | 30 | 1.1% |
| `WINRATE_LAST_5` | 30 | 1.1% |
| `WINRATE_LAST_10` | 30 | 1.1% |
| `PTS_ALLOWED_LAST_5` | 30 | 1.1% |
| `PTS_ALLOWED_LAST_10` | 30 | 1.1% |
| `HOME_WINRATE_LAST_5` | 79 | 3.0% |
| `HOME_PTS_LAST_5` | 79 | 3.0% |
| `HOME_PTS_ALLOWED_LAST_5` | 79 | 3.0% |
| `AWAY_WINRATE_LAST_5` | 77 | 2.9% |
| `AWAY_PTS_LAST_5` | 77 | 2.9% |
| `AWAY_PTS_ALLOWED_LAST_5` | 77 | 2.9% |
| `H2H_WINRATE_LAST_5` | 874 | 33.2% |
| `H2H_PTS_LAST_5` | 874 | 33.2% |
| `H2H_PTS_ALLOWED_LAST_5` | 874 | 33.2% |

> The 30 NaN rows in base rolling features correspond to the first game of each of the 30 NBA teams (no prior games to compute rolling averages).
> The 77–79 NaN rows in Home/Away splits correspond to teams that haven't played their 1st home or away game yet in the season start.

---

## 5. Dropped Rows by Season Type

| Season Type | Dropped Rows |
| :--- | ---: |
| Regular Season | 874 |
| Playoffs | 0 |
| **Total** | **878** |

> ⚠️ The 4-row discrepancy (878 − 874) comes from the opponent-join step adding NaN rows for OPP_ columns that can't be matched (e.g., first-game scenarios mirrored on the opponent side).

All playoff, Play-In, and Finals rows survive the V2 drop — H2H pairs in the postseason have always met earlier in the regular season.

---

## 6. Per-Team Drop Distribution

Drops are **uniformly distributed** across all 30 teams:

| Metric | Value |
| :--- | ---: |
| Min drops (any team) | 29 |
| Max drops (any team) | 30 |
| Mean drops per team | 29.1 |

No team is disproportionately penalized. The 1-row variance is due to scheduling differences (some teams play slightly more unique opponents in the first few weeks).

---

## 7. Relaxed V2 Proposal

### Concept

Create a **"Relaxed V2"** dataset (`team_model_ready_v2_relaxed_2025_26.csv`) that:
- Keeps all V2 features **except** H2H columns
- OR fills H2H NaN values with a neutral default (e.g., 0.5 win rate, league-average PTS)
- Drops NaN only on base, defensive, and home/away rolling features

### Simulation Results

| Dataset Variant | Rows Kept | Rows Dropped | Drop Rate |
| :--- | ---: | ---: | ---: |
| **Current V2** (strict) | 1,758 | 878 | 33.3% |
| **Relaxed V2** (no H2H in dropna) | 2,528 | 108 | 4.1% |
| **Difference** | **+770** | **−770** | — |

### Approaches

| Approach | Pros | Cons |
| :--- | :--- | :--- |
| **A. Drop H2H columns entirely** | Simple; 770 more training rows | Lose matchup-specific signal |
| **B. Fill H2H NaN with league average** | Keep all rows, keep H2H columns | Imputed values add noise; model may learn "H2H = league avg" as a pattern |
| **C. Add H2H_AVAILABLE flag** | Model can learn when H2H is real vs imputed | Adds complexity; requires careful encoding |

### Recommendation

**Approach A** (Drop H2H columns entirely) is the safest first step:
- H2H features are sparse (mean 1.94 prior games) and noisy
- Recovering 770 early-season rows significantly improves training set size (+44%)
- If H2H proves valuable in later model experimentation, Approach C can be added as a V2.1 variant

---

## 8. Next Steps

1. **Build `team_model_ready_v2_relaxed_2025_26.csv`** using Approach A
2. **Compare model performance** (V2 strict vs. V2 relaxed) during training phase
3. **Consider H2H as optional enrichment** for playoff-only models where H2H history is always available
