# NBA Team Model-Ready Dataset V2 (Enhanced) Report

> Generated: 2026-06-06
> V2 Shape: **1758 rows, 46 columns**
> Dropped rows due to NaNs: **878**

## 1. Feature Specifications

The V2 dataset is enriched with **39 pre-game leakage-free features** (target `WIN` and 7 metadata columns excluded).

### Column Groups
- **Base Team & Opponent Form**: `PTS_LAST_5`/`10`, `WINRATE_LAST_5`/`10`, `DAYS_REST`, `IS_B2B`, and `OPP_*` equivalents.
- **Defensive rolling averages**: `PTS_ALLOWED_LAST_5`/`10` and `OPP_PTS_ALLOWED_LAST_5`/`10`.
- **Home/Away splits form**: `HOME_*`, `AWAY_*`, and `OPP_HOME_*`, `OPP_AWAY_*` equivalents.
- **Head-to-head franchise history**: `H2H_*` and `OPP_H2H_*` equivalents.

## 2. Pre-Game Row Drops Summary

Out of the total merged games features, **878 rows** were dropped. These represent early-season games where rolling averages (especially split form or head-to-head metrics) could not be calculated because the teams had not yet played enough home/away games, or had not faced each other yet.
