# Reports

Two kinds of files live here. Generated reports are rewritten by a script and never edited by hand; headline numbers in `PROJECT_STATUS.md`, `README.md` and `AI_CONTEXT.md` are taken from them. Records (audits, backtests) are dated, hand-written and frozen: they describe what was measured on that day and are not updated afterwards.

## Generated (tracked)

| Report | Script | When to rebuild |
|---|---|---|
| `evaluation/multi_season_walk_forward_backtest.{md,json}` | `PYTHONPATH=. python3 scripts/walk_forward_benchmark.py` | After every retrain or promotion. The header names the model versions it measured; `tests/test_docs_consistency.py` fails when they differ from the production release. |
| `evaluation/paper_ledger_<season>.{md,json}` | `PYTHONPATH=. python3 scripts/paper_ledger_report.py --season 2026-27` | After results are pulled (the morning routine `scripts/ops/morning.py` runs it). |
| `evaluation/training_run_<timestamp>.md` | `scripts/retrain_pipeline.py` | Written by each retrain, dry runs included. Only the run of the active release is kept (its id is `run_id` in `models/production/clean_holdout_metrics.json`); delete the others, git history keeps them. |
| `operations/season=<season>/*.md` | `PYTHONPATH=. python3 main.py --season <season> --run-roster-analysis` | Season roster analysis. For the in-progress season only the markdown is rewritten; its `data/season=<season>/analysis/*.csv` are the signed bootstrap roster and are left alone. |
| Walk-forward block in `docs/reports/models/*.md` | `scripts/walk_forward_benchmark.py` (or `--docs-only` to re-render from the saved JSON) | With every walk-forward run; the rest of those docs is hand-written. |

## Generated (not tracked, see `.gitignore`)

Run-time outputs that are stale as soon as the next data update runs: `predictions/` (`scripts/predict_daily_schedule.py`), `operations/data_freshness_report.*`, `operations/pipeline_sync_report_*.md` and the other update logs from `main.py --update-data`. Ad hoc evaluations are not tracked either: `evaluation/season_*_evaluation_report.md` and `evaluation/compare_*.md` (`scripts/generate_report.py`), `audits/drift_and_leakage_*.md` (`scripts/detect_drift_and_leakage.py`).

## Records (hand-written, frozen)

- `backtests/<date>_<topic>/` — one experiment each: README with the question, method, numbers and decision; `code/` holds the exact script that produced it.
- `audits/<date>_<topic>.md` — code and data audits.
- `production/model_performance_and_architecture_report.md` — architecture of the active models (no metric tables; those are in the generated reports).
- `operations/data_pipeline_architecture_report.md`, `operations/data_storage_and_delivery_analysis.md`, `operations/pbp_frontend_delivery.md` — pipeline and storage design notes.
