# Orchestration Domain

Coordinates CLI command dispatch, multi-stage feature generation pipelines, season onboarding workflows, and post-update frontend view refreshes.

> [!NOTE]
> **Related Documentation & Runbooks:**
> - **Architecture Deep Dives:** [`docs/season_onboarding_guide.md`](../../docs/season_onboarding_guide.md) · [`docs/pipeline_overview.md`](../../docs/pipeline_overview.md)
> - **Key Entry Points:** [`pipeline_orchestrator.py`](pipeline_orchestrator.py) · [`pipeline_workflows.py`](pipeline_workflows.py) · [`pipeline_runner.py`](pipeline_runner.py) · [`feature_pipeline.py`](feature_pipeline.py) · [`refresh_current_season_views.py`](refresh_current_season_views.py) · [`pipeline_reports.py`](pipeline_reports.py) · [`roster_report.py`](roster_report.py)

## Business Rules & Invariants
- **Single Flag Dispatch (`PipelineOrchestrator`):** `main.py` delegates CLI flags (`--update-data`, `--bootstrap-season`, `--sync-pipeline`, `--export-frontend-data`, `--train-*-model*`, etc.) through `PipelineOrchestrator.dispatch()` to workflow handlers in [`pipeline_workflows.py`](pipeline_workflows.py).
- **Fail-Loud Stage Sequencing (`PipelineRunner`):** Sequential stages return `PipelineResult` records and halt downstream dataset builds or store refreshes if an upstream ingestion or contract check fails.
- **Post-Update View Refresh:** `refresh_current_season_views` runs after daily data updates to rebuild live display rosters (`build_live_roster`) and active-season SQLite frontend stores without touching sealed historical seasons or frozen bootstrap files.
- **Change rule:** New CLI pipeline workflows belong in [`pipeline_workflows.py`](pipeline_workflows.py) and `PipelineOrchestrator` rather than embedding business logic directly in `main.py`.
