# Evaluation Domain

Measures out-of-sample model skill using paired date-block bootstrap confidence intervals, grades locked-season paper-trading ledgers against baselines, and renders generated documentation blocks.

> [!NOTE]
> **Related Documentation & Runbooks:**
> - **Architecture Deep Dives:** [`docs/reporting_and_validation_guide.md`](../../docs/reporting_and_validation_guide.md) · [`reports/README.md`](../../reports/README.md) · [`docs/project_status.md`](../../docs/project_status.md)
> - **Key Entry Points:** [`bootstrap.py`](bootstrap.py) · [`paper_ledger.py`](paper_ledger.py) · [`generate_report.py`](generate_report.py) · [`model_doc_blocks.py`](model_doc_blocks.py) · [`status_blocks.py`](status_blocks.py)

## Business Rules & Invariants
- **Date-Block Bootstrap Significance (`bootstrap.py`):** `paired_block_bootstrap` resamples whole game dates (not independent games) to preserve same-day correlation and computes 95% confidence intervals via `verdict`; gains where the CI spans zero are explicitly flagged as statistically indistinguishable from noise.
- **Locked-Season Scorecard (`paper_ledger.py`):** `build_report` evaluates pre-tip frozen predictions from `paper_ledger_2026_27.jsonl` by joining completed game logs at read time and benchmarking against leak-free baselines (`elo_baseline`, `home_edge`, `last10_baseline`).
- **Generated Doc Block Ownership (`model_doc_blocks.py`, `status_blocks.py`):** Headline metric tables and significance summaries between `<!-- BEGIN GENERATED: ... -->` and `<!-- END GENERATED: ... -->` in `README.md`, `docs/project_status.md`, and `docs/reports/models/*.md` are rewritten programmatically by `update_model_docs` and `update_status_docs`.
- **Ledger Detail Grading (`ledger_detail.py`):** `shadow_summary` scores shadow WIN candidates against production and Elo on the same frozen records; `player_summary` grades frozen PLAYER projections against an EMA-10 rebuilt by `player_actuals`. Both are monitoring only, never model selection.
- **On-Demand Season Auditing:** `evaluate_model_on_season` in [`generate_report.py`](generate_report.py) runs dynamic holdout evaluations and freshness audits across arbitrary historical seasons.
- **Change rule:** Never edit metrics inside `<!-- BEGIN GENERATED: ... -->` markers by hand; always regenerate via `PYTHONPATH=. python3 scripts/refresh_reports.py` and verify with `tests/test_docs_consistency.py`.
