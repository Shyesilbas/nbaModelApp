# Schema Parity Root Cause Audit — 2024-25 vs 2025-26
**Date:** 2026-06-09
**Scope:** Read-only investigation. No files were modified. No datasets were generated. No models were trained.
**Files Audited:**
- `data/experimental/team_win_model_ready_v2_2024_25_clean.csv` (Experimental, 2024-25)
- `data/production/team_win_model_ready_v2_player_features.csv` (Production, 2025-26)
- `data/experimental/team_games_features_2024_25.csv` (Raw feature source)
- `data/experimental/player_games_features_2024_25.csv` (Raw player feature source)
- `data/experimental/game_results_2024_25.csv` (Game results)
- `data/experimental/player_registry_2024_25.csv` (Experimental roster registry)
- `data/production/core_players.csv` (Production roster registry)
- `data/experimental/observed_affiliation_events_2024_25.csv` (Player team affiliation)
- `scripts/data_processing/clean_win_dataset_2024_25.py`
- `scripts/build_matchup_features.py`

---

## Executive Summary

Schema parity is **the genuine final blocker** for cross-season merging, but it is **solvable through a single self-join operation**. Beyond the 18 missing `OPP_*` columns, there is also a **hidden secondary blocker**: the experimental dataset's roster features (`HOME/AWAY_CORE_*`) were built using the 2024-25 player registry (`player_registry_2024_25.csv`) rather than the production `core_players.csv`, resulting in systematically lower player counts and minute sums. This causes a **feature distribution mismatch** that will corrupt model training if not addressed.

---

## 1. Do All 18 OPP_* Columns Truly Exist in Production?

**Answer: YES — all 18 columns are confirmed present in production.**

| Column | In Production? |
|--------|---------------|
| OPP_AWAY_PTS_ALLOWED_LAST_5 | ✅ |
| OPP_AWAY_PTS_LAST_5 | ✅ |
| OPP_AWAY_WINRATE_LAST_5 | ✅ |
| OPP_DAYS_REST | ✅ |
| OPP_H2H_GAMES_LAST_5 | ✅ |
| OPP_H2H_PTS_ALLOWED_LAST_5 | ✅ |
| OPP_H2H_PTS_LAST_5 | ✅ |
| OPP_H2H_WINRATE_LAST_5 | ✅ |
| OPP_HOME_PTS_ALLOWED_LAST_5 | ✅ |
| OPP_HOME_PTS_LAST_5 | ✅ |
| OPP_HOME_WINRATE_LAST_5 | ✅ |
| OPP_IS_B2B | ✅ |
| OPP_PTS_ALLOWED_LAST_10 | ✅ |
| OPP_PTS_ALLOWED_LAST_5 | ✅ |
| OPP_PTS_LAST_10 | ✅ |
| OPP_PTS_LAST_5 | ✅ |
| OPP_WINRATE_LAST_10 | ✅ |
| OPP_WINRATE_LAST_5 | ✅ |

**Evidence:** `python3` inspection of `data/production/team_win_model_ready_v2_player_features.csv` columns (88 total).

---

## 2. Can the 18 OPP_* Columns Be Reconstructed via Self-Join?

**Answer: YES — fully reconstructable via GAME_ID self-join, with no data loss.**

### Self-Join Feasibility Verification

| Check | Result |
|-------|--------|
| All GAME_IDs have exactly 2 rows in experimental? | ✅ TRUE (1,230 games × 2 = 2,460 rows) |
| All 18 base columns (`AWAY_PTS_LAST_5`, `DAYS_REST`, etc.) exist in experimental? | ✅ ALL 18 PRESENT |
| Unexpected missing columns beyond the 18 OPP_* set? | ✅ NONE |

### NaN Propagation After Self-Join

The self-join correctly propagates NaN counts. Each `OPP_*` column post-join has **exactly the same NaN count** as the opponent's corresponding base column in the original dataset:

| OPP Column | NaNs After Join | Base Column NaNs | Match? |
|---|---|---|---|
| OPP_AWAY_PTS_ALLOWED_LAST_5 | 77 | 77 | ✅ |
| OPP_AWAY_PTS_LAST_5 | 77 | 77 | ✅ |
| OPP_AWAY_WINRATE_LAST_5 | 77 | 77 | ✅ |
| OPP_DAYS_REST | 30 | 30 | ✅ |
| OPP_H2H_GAMES_LAST_5 | 0 | 0 | ✅ |
| OPP_H2H_PTS_ALLOWED_LAST_5 | 874 | 874 | ✅ |
| OPP_H2H_PTS_LAST_5 | 874 | 874 | ✅ |
| OPP_H2H_WINRATE_LAST_5 | 874 | 874 | ✅ |
| OPP_HOME_PTS_ALLOWED_LAST_5 | 79 | 79 | ✅ |
| OPP_HOME_PTS_LAST_5 | 79 | 79 | ✅ |
| OPP_HOME_WINRATE_LAST_5 | 79 | 79 | ✅ |
| OPP_IS_B2B | 0 | 0 | ✅ |
| OPP_PTS_ALLOWED_LAST_10 | 30 | 30 | ✅ |
| OPP_PTS_ALLOWED_LAST_5 | 30 | 30 | ✅ |
| OPP_PTS_LAST_10 | 30 | 30 | ✅ |
| OPP_PTS_LAST_5 | 30 | 30 | ✅ |
| OPP_WINRATE_LAST_10 | 30 | 30 | ✅ |
| OPP_WINRATE_LAST_5 | 30 | 30 | ✅ |

**Reconstruction mechanism:** `df_right = df_exp[['GAME_ID','TEAM_ID'] + base_cols].rename(columns={'TEAM_ID':'OPP_TEAM_ID', **{c:f'OPP_{c}' for c in base_cols}})`; then merge on `GAME_ID` filtering `TEAM_ID != OPP_TEAM_ID`.

> **Note on H2H NaN count (874):** This is not a bug. It reflects games where no prior H2H game occurred in the rolling 5-game window — a valid domain reality for early-season matchups.

---

## 3. Is PTS_ALLOWED Actual Leakage or a Historical Rolling Feature?

**Answer: CONFIRMED LEAKAGE — PTS_ALLOWED is the opponent's actual current-game score.**

### Evidence

**Game 22500082 (ATL vs TOR):**
```
ATL row: PTS_ALLOWED = 138
TOR row: PTS_ALLOWED = 118
```

Interpretation:
- ATL's PTS_ALLOWED = 138 → This is TOR's actual final score in **this same game**
- TOR's PTS_ALLOWED = 118 → This is ATL's actual final score in **this same game**

Each team's `PTS_ALLOWED` is precisely the opponent's total points **from the game being predicted**. This means `PTS_ALLOWED` is definitionally post-tipoff information — a **direct target leakage column**.

### Source Path

The `clean_win_dataset_2024_25.py` script explicitly includes `PTS_ALLOWED` in `SAFE_FEATURES` (line 28), misclassifying it. It was never generated as a rolling average — it is the raw current-game value.

**Action required:** Drop `PTS_ALLOWED` before merging. This column does **not exist in production** and must not be added.

---

## 4. Are SEASON_ID and SEASON_TYPE Merely Metadata?

**Answer: YES — pure metadata with no predictive content. Safe to drop.**

| Column | Values in Experimental | In Production? | Classification |
|--------|------------------------|----------------|----------------|
| SEASON_ID | `22025` only | ❌ No | Metadata (season identifier) |
| SEASON_TYPE | `Regular Season` only (after clean filter) | ❌ No | Metadata (game type filter) |

### Verification

- `SEASON_ID = 22025` is the NBA's internal code for the 2025-26 season (note: the **experimental dataset labeled "2024-25" actually contains 2025-26 season data** with GAME_IDs in the `225xxxx` namespace).
- `SEASON_TYPE` in the clean regular-season file is always `Regular Season` — a constant with zero predictive value.
- These columns were never part of the production schema design.

**Action required:** Drop both `SEASON_ID` and `SEASON_TYPE` before merging.

---

## 5. Is Schema Parity Genuinely the Final Blocker?

**Answer: Partially YES — but there is a hidden secondary blocker discovered during this audit.**

### Primary Blocker: Schema Parity (Known)
The 18 missing `OPP_*` columns prevent direct concatenation of experimental and production datasets. This is **solvable** with a self-join operation (see Section 2).

### Hidden Secondary Blocker: Roster Feature Distribution Mismatch (NEWLY DISCOVERED)

A **systematic feature distribution mismatch** was found between experimental and production datasets for all `HOME/AWAY_CORE_*` and `HOME/AWAY_TOP3_*` player-availability features.

**Concrete Evidence — Game 22500785 (PHX vs OKC, 2026-02-13):**

| Feature | Experimental (2024-25 registry) | Production (core_players.csv) |
|---------|--------------------------------|-------------------------------|
| HOME_CORE_PLAYERS_AVAILABLE_COUNT | 7 | 12–13 |
| AWAY_CORE_EXPECTED_MIN_SUM | 257.9 | 365.4–380.0 |

**Root Cause:** The `compute_player_features_for_inference()` function in `scripts/build_matchup_features.py` (lines 288–329) uses a branching logic:
- If `season == "2024-25"` → uses `data/experimental/player_registry_2024_25.csv` + `observed_affiliation_events_2024_25.csv`
- Otherwise → uses `data/production/core_players.csv`

The experimental `player_registry_2024_25.csv` has 547 players with **a different roster definition** than the production `core_players.csv` (590 players). This results in different `CORE_RANK` assignments and different availability counts.

**Dataset-level distribution comparison:**

| Feature | Experimental Mean | Production Mean | Δ |
|---------|-------------------|-----------------|---|
| HOME_CORE_PLAYERS_AVAILABLE_COUNT | 9.40 | 12.88 | **+3.48** |
| AWAY_CORE_EXPECTED_MIN_SUM | 276.25 | 372.11 | **+95.86** |

This means: **merging the two datasets as-is would create a bimodal distribution** in all roster features, which would severely degrade model generalization (the model would implicitly learn season identity from the roster features, not from actual roster quality).

---

## 6. After Parity Fix, Will Cross-Season Merge Be Safe?

**Answer: CONDITIONAL — safe for team rolling features only; NOT safe for roster features without additional fixes.**

| Feature Group | Safe to Merge After OPP Self-Join? | Why |
|---|---|---|
| `PTS_LAST_5`, `WINRATE_LAST_5`, etc. | ✅ YES | Distributions are compatible (mean ~115.6 vs ~115.3) |
| `DAYS_REST`, `IS_B2B` | ✅ YES | Boolean/integer, compatible |
| `H2H_*` columns | ✅ YES (with NaN imputation) | High NaN rate (874/2460) but structurally compatible |
| `HOME/AWAY_CORE_*` (roster features) | ❌ NO | Systematically lower values in experimental due to different registry |
| `HOME/AWAY_TOP3_*` (roster features) | ❌ NO | Same root cause as above |
| `HOME/AWAY_MISSING_CORE_*` | ❌ NO | Same root cause |

---

## 7. Implementation Complexity Estimate

### Fix 1: OPP_* Column Reconstruction (REQUIRED)
**Complexity: Low | Risk: Low | Estimated effort: ~30 min**

```python
# Pseudocode only - do NOT execute
base_cols = [c.replace("OPP_","") for c in opp_cols_18]
df_opp = df_exp[['GAME_ID','TEAM_ID'] + base_cols].rename(
    columns={'TEAM_ID':'OPP_TEAM_ID', **{c:f'OPP_{c}' for c in base_cols}}
)
df_final = df_exp.merge(df_opp, on='GAME_ID').query('TEAM_ID != OPP_TEAM_ID')
```

### Fix 2: Drop Leakage and Metadata Columns (REQUIRED)
**Complexity: Trivial | Risk: None | Estimated effort: ~5 min**

Columns to drop: `PTS_ALLOWED`, `SEASON_ID`, `SEASON_TYPE`

### Fix 3: Roster Feature Alignment (REQUIRED FOR VALID MERGE)
**Complexity: Medium | Risk: Medium | Estimated effort: 2–4 hours**

Two options:
- **Option A (Recommended):** Rebuild the experimental win dataset's roster features using `data/production/core_players.csv` for consistency. This requires re-running `compute_player_features_for_inference` with the production registry for all 2024-25 games.
- **Option B (Stopgap):** Add a `SEASON` indicator column and train separate per-season models, bypassing the distribution mismatch entirely.

---

## Summary Table

| Question | Finding |
|---|---|
| Is schema parity genuinely the final blocker? | YES for direct concat. Additionally, roster features have a distribution mismatch (hidden blocker). |
| Are the 18 OPP_* columns reconstructable? | YES — fully reconstructable via GAME_ID self-join with zero data loss. |
| Is any additional hidden blocker present? | YES — roster feature distribution mismatch due to different player registry (experimental 547 players vs production 590 players). |
| Is PTS_ALLOWED leakage? | YES — confirmed as current-game opponent score, not a rolling feature. Must be dropped. |
| Are SEASON_ID and SEASON_TYPE metadata? | YES — pure metadata, no predictive value, safe to drop. |
| After parity fix, will cross-season merge be safe? | CONDITIONAL — safe for team rolling features; NOT safe for roster features without registry unification. |
| Estimated total implementation complexity? | Low-Medium (3–5 hours total for all three fixes). |

---

## Appendix: Dataset Survey

| File | Rows | Games | GAME_ID Range | Date Range | Season |
|---|---|---|---|---|---|
| `exp/team_win_model_ready_v2_2024_25_clean.csv` | 2,460 | 1,230 | `0022500001–0022501230` | 2025-10-21 – 2026-04-12 | 2025-26 regular |
| `exp/team_win_model_ready_v2_2024_25.csv` (raw) | 2,636 | 1,318 | `22500001–52500211` | 2025-10-21 – 2026-06-05 | 2025-26 all |
| `prod/team_win_model_ready_v2_player_features.csv` | 1,758 | 879 | `22500009–52500211` | 2025-10-29 – 2026-06-05 | 2025-26 partial |
| `exp/team_games_features_2024_25.csv` | 2,640 | 1,320 | `22400001–52400211` | 2024-10-22 – 2025-06-22 | **2024-25 ✅** |
| `exp/player_games_features_2024_25.csv` | 28,240 | — | — | 2024-10-22 – 2025-06-22 | **2024-25 ✅** |

> **Critical naming note:** Files labeled `_2024_25` in `data/experimental/` span two different realities:
> - The raw feature files (`team_games_features_2024_25.csv`, `player_games_features_2024_25.csv`) contain genuine **2024-25 season data** (GAME_IDs `002244xxxx/004244xxxx`, dates Oct 2024 – Jun 2025).
> - The assembled model-ready files (`team_win_model_ready_v2_2024_25.csv`, `*_clean.csv`) contain **2025-26 season data** (GAME_IDs `225xxxxx`, dates Oct 2025 – Apr 2026), because the feature builder was inadvertently run against 2025-26 raw sources when the experimental features were initially mislabeled.
