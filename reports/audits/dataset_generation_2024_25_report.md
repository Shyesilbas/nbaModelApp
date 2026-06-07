# 2024-25 Experimental Dataset Generation — Remap Run Report

## Blockers Fixed
- Win dataset-only game_results path now prefers `data/experimental/game_results_2024_25.csv` under the strict gate `(season=="2024-25" AND output_scope=="experimental" AND dataset_only==True)`.
- Score builder `UnboundLocalError` removed by deleting the in-function import/shadowing of `season_to_file_token`; the function uses the top-level import.

## Remap Coverage and Integrity
- Win remap coverage: 0.00% (0/2,636)
- Score remap coverage: not executed (stopped due to win coverage <95%)
- Duplicate natural key count (win mapping): 0
- Unmapped rows (win): 2,636
- Final GAME_ID intersection count after remap (win): 0

## Dataset Row Counts
- Win dataset rows written: 0 (run aborted by <95% coverage rule; existing file not overwritten)
- Score dataset rows written: 0 (not executed)

## Leakage / Validation Results
- Alignment audit: features vs game_results intersection = 0; boxscores/raw games vs results = 1,320.
- Dataset validation: FAIL — leakage flag present in win features (e.g., `PTS`).

## Production Integrity
- No production artifacts were modified (models/production, data/production intact).

## Verdict
- Overall 2024-25 experimental dataset generation: FAIL (coverage <95%).
- Not ready for cross-season merge until GAME_ID alignment is addressed in features or via higher-coverage remap.

## Notes
- The observed 0% coverage indicates the experimental 2024-25 feature files use a different `GAME_ID` namespace (`225…/425…`) than `game_results` and boxscores (`224…`). To pass, either rebuild aligned features or extend dataset-only logic to join by natural keys and fully replace feature-side `GAME_ID`s with canonical `224…` values across both team and player datasets.