# Model Governance Golden Audit

Updated: 2026-06-16

## Final Decision

The current model governance structure is accepted as the production policy baseline.

No model is promoted automatically. Production artifacts remain unchanged unless a future candidate passes all promotion gates and the operator explicitly confirms promotion.

## Why This Policy Stands

The governance rebuild is intentionally stricter than the historical production workflow:

- Season-based external validation is the primary evaluation policy.
- `2025-26` remains a true external validation season for the current cycle.
- WIN uses the same `win_v9.yaml` 62-feature contract.
- PBP features are not added to production model contracts because the ablations did not prove a reliable lift.
- Historical chronological quantile split is not the primary governance policy, even when it can make metrics look better.

This means the governance candidate may trail the current production model slightly, but the evaluation is more honest and easier to reproduce.

## Current WIN Policy

For the current evaluation cycle:

| Role | Seasons |
| --- | --- |
| Completed fit seasons | `2020-21`, `2021-22`, `2022-23`, `2023-24`, `2024-25` |
| External validation season | `2025-26` |
| Feature contract | `config/features/win_v9.yaml` |
| Feature count | 62 |
| Production write policy | Never automatic |

The WIN trainer must not refit the final candidate on `2025-26`. The validation season is used only for external evaluation and champion/challenger comparison.

## Promotion Rule

A WIN candidate can only be recommended for production if all of these are true on `2025-26` external validation:

1. Candidate Brier score is less than or equal to production Brier.
2. Candidate ROC-AUC is greater than or equal to production ROC-AUC.
3. No major segment regression appears in required segments.
4. The feature contract remains unchanged or the contract change is explicitly reviewed.
5. Metadata, feature contract snapshot, split metadata, and evaluation report are saved.
6. The operator confirms promotion in a non-dry-run workflow.

## PBP Decision

Play-by-play data is valuable for product UX and future research, but it is not part of the current production training contract.

Reason:

- PBP-based model experiments did not establish a robust, leakage-safe improvement for WIN, SCORE, or PLAYER.
- Some PBP-derived signals are post-game facts unless carefully transformed into pre-game rolling features.
- The current model governance target is reproducibility and honest external validation, not forcing new data into the model.

PBP is therefore served to the frontend lazily through the API for game detail views, while model training remains on the approved v9 contracts.

## Operational Baseline

Use dry-run for audit:

```bash
PYTHONPATH=. python3 scripts/run_training_workflow.py --dry-run
```

Expected behavior:

- Candidate artifacts are written under `models/experimental/`.
- Production artifacts under `models/production/` are not modified.
- Promotion remains blocked unless thresholds, champion/challenger gate, and manual confirmation all pass.

## Do Not Change Without A New Audit

- Do not add PBP features to `win_v9`, `score_v9`, or `player_v9` without a fresh leakage review and ablation.
- Do not switch WIN governance back to chronological quantile split as the primary policy.
- Do not promote a candidate that only wins on internal calibration but loses on `2025-26`.
- Do not copy raw PBP into `frontend/public`; serve it through the API.

