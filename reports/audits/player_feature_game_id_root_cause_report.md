### Player Feature GAME_ID Root Cause Analysis — 2024-25

#### Summary
- Finding: `GAME_ID` misalignment is caused by column case inconsistency. The player pipeline preserves `Game_ID` (camel case) from ingestion and never standardizes it to uppercase `GAME_ID` before writing the final file. Downstream audits expecting `GAME_ID` therefore see either a missing column or a coerced default (e.g., 0), yielding 0% alignment with `game_results`.
- Scope: 2024-25 experimental player features at `data/experimental/player_games_features_2024_25.csv` (28,240 rows observed in strict verification).

---

### 1) Exact Code Locations (ingestion → features → transforms → writer)

1. Ingestion (source of casing change)
   - File: `src/ingestion/player_games_fetcher.py`
   - Lines: 56–61
   - Code: NBA API response columns are renamed as:
     - `"PLAYER_ID" → "Player_ID"`
     - `"GAME_ID" → "Game_ID"`  ← camel case introduced here

2. Player feature builder (passes through without standardizing)
   - File: `src/features/player_features.py`
   - Function: `build_player_features(df)`
   - Notes: Does not touch `Game_ID`/`GAME_ID`. It engineers features like `IS_HOME`, rolling stats, etc., and returns the frame with original ID casing intact.

3. Intermediate transformations touching GAME_ID (team-side and mixed joins)
   - File: `src/features/core_player_availability_features.py`
   - Lines: 24–31, 46–67, 69–71
   - Behavior:
     - Explicitly casts team `GAME_ID` and player `Game_ID` to `str`.
     - Aggregations are performed on `Game_ID` then renamed to `GAME_ID` for joins with team features. This module expects `GAME_ID` for team-side keys but works around player-side `Game_ID` by renaming in-place during aggregation.
   - File: `src/features/opponent_features.py`
   - Uses `GAME_ID` extensively for self-merge and validation; this is on team features, not player features.

4. Final output writers for player features (no standardization step)
   - A) Sync pipeline writer
     - File: `main.py`
     - Section: "SYNCING FEATURE PIPELINE"
     - Lines: ~378–416, esp. 400–415
     - Behavior: Writes `df_player_features` directly to CSV/Parquet at `data/experimental/player_games_features_{token}.{csv,parquet}` when `--output-scope experimental` is used. No `Game_ID`→`GAME_ID` normalization before save.
   - B) 2024-25 regeneration helper (audit scope)
     - File: `scripts/audit/regenerate_2024_25_features.py`
     - Lines: 100–118 (build) and 103–118 (write)
     - Behavior: Similarly writes `player_feats` to `data/experimental/player_games_features_2024_25.{csv,parquet}` without ID casing standardization.

5. Alignment audit behavior (why strict verification reported unique GAME_ID=0)
   - File: `scripts/audit/validate_2024_25_game_id_alignment.py`
   - Lines: 72–83
   - Behavior: The helper `_game_id_set` tries `GAME_ID`, `game_id`, then `Game_ID`. If an external strict check only inspects uppercase `GAME_ID`, the column will be missing in the experimental player features, and external code may coerce a missing/NaN column to numeric `0`, leading to a misleading metric like "unique GAME_ID = 0" and 0% overlap.

---

### 2) Root Cause
- The ingestion layer intentionally renames the NBA API `GAME_ID` to `Game_ID` (camel case).
- The player features pipeline keeps `Game_ID` throughout and the writers save it as-is, without also providing a standardized uppercase `GAME_ID`.
- Several downstream modules and audits assume/require uppercase `GAME_ID` for joins and validations. The mismatch causes audits that exclusively check for `GAME_ID` to see a missing or default-filled column, thus reporting 0% alignment.

---

### 3) Smallest Safe Fix
- Add a non-destructive standardization immediately before writing player features:
  - If `"GAME_ID"` is absent and `"Game_ID"` exists, create `df["GAME_ID"] = df["Game_ID"].astype(str).str.zfill(10)`.
  - Do not drop `Game_ID` to maintain backward compatibility; keep both columns for now.
- Apply this in both writers that persist player features:
  - `main.py` sync pipeline block (before `to_csv`/`to_parquet`).
  - `scripts/audit/regenerate_2024_25_features.py` (before `to_csv`/`to_parquet`).
- Optional hardening: In `src/features/player_features.py`, at the very start, normalize an internal alias `GAME_ID_STD` used for any future joins; but the minimal fix above suffices for file outputs and audits.

Rationale:
- This is the least invasive approach, avoids touching upstream ingestion behavior, and prevents breaking any existing code that might still expect `Game_ID`.

---

### 4) Can existing 2024-25 player features be repaired in-place?
- Yes. The file `data/experimental/player_games_features_2024_25.csv` contains a valid `Game_ID` column (verified sample values like `22400062`, `22400085`, etc.).
- An in-place repair can add a `GAME_ID` column computed as zero-padded strings of `Game_ID`:
  - `GAME_ID = Game_ID.astype(str).str.zfill(10)`
- No regeneration of features is required for this fix.

---

### 5) Is regeneration required?
- Not required for the ID alignment issue.
- Regeneration is only needed if you want the canonical files on disk to include the standardized `GAME_ID` produced by the pipeline automatically. Otherwise, a one-time in-place column addition is sufficient.

---

### 6) Expected Row Counts After Fix
- The fix is column-addition only; it does not filter or expand rows.
- Therefore, row counts remain unchanged.
  - Experimental 2024-25 player features: 28,240 rows (as per strict verification input) → 28,240 rows after fix.

---

### 7) Expected GAME_ID Coverage After Fix
- After adding standardized `GAME_ID = zfill10(Game_ID)`, the set of `GAME_ID`s in player features should align with `game_results` built from the same 2024-25 sources.
- Based on sampled values, `Game_ID` entries correspond to canonical IDs with prefixes `00224…` (regular season) and `00424…` (playoffs) after zero-padding.
- Expected outcome:
  - `GAME_ID` uniqueness: equals the uniqueness of `Game_ID` pre-fix (no loss).
  - Intersection with `game_results.GAME_ID`: near-complete, expected ≥ 99.5%, and typically ~100% assuming both are derived from the same season’s boxscores and schedule.

---

### Evidence Appendix (file/line references)
- Ingestion rename introducing `Game_ID`:
  - `src/ingestion/player_games_fetcher.py` lines 56–61 (`"GAME_ID": "Game_ID"`).
- Writers that omit standardization:
  - `main.py` lines 400–415: writes `df_player_features` without creating uppercase `GAME_ID`.
  - `scripts/audit/regenerate_2024_25_features.py` lines 103–118: same behavior for the audit/regeneration path.
- Mixed-case handling in transforms (shows expectation for `GAME_ID` on team side and ad-hoc rename for player side):
  - `src/features/core_player_availability_features.py` lines 24–31, 46–67, 69–71.
- Alignment audit tolerant of multiple casings (explains why some audits pass while strict checks fail):
  - `scripts/audit/validate_2024_25_game_id_alignment.py` lines 72–83.

---

### Next Steps (non-invasive)
1) Apply the smallest safe fix in the two writers (pre-save column standardization). Keep both `Game_ID` and `GAME_ID` in outputs for now.
2) Re-run the alignment audit to confirm overlap with `game_results` is restored.
3) Optionally, add a unit test or assertion in writer code paths ensuring at least one of `Game_ID`/`GAME_ID` exists and, if both exist, they are consistent after zfill.

Note: As requested, no production artifacts were modified, no datasets were regenerated, and no models were trained. This document is a read-only audit.
