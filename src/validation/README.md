# Validation Domain

Enforces pre-write dataframe schema contracts and audits raw/processed season data completeness, ID parity, and date freshness across pipeline stages.

> [!NOTE]
> **Related Documentation & Runbooks:**
> - **Architecture Deep Dives:** [`docs/pipeline_overview.md`](../../docs/pipeline_overview.md) · [`docs/reporting_and_validation_guide.md`](../../docs/reporting_and_validation_guide.md)
> - **Key Entry Points:** [`contracts.py`](contracts.py) · [`data_freshness.py`](data_freshness.py) · [`data_freshness_service.py`](data_freshness_service.py)

## Business Rules & Invariants
- **Fail-Fast Write Contracts (`contracts.py`):** `check_team_games`, `check_player_games`, and `check_team_model_ready` validate required columns, 10-digit zero-padded `GAME_ID` format, uniqueness (`GAME_ID` + `TEAM_ID` or `Game_ID` + `Player_ID`), non-null critical keys, and date parseability before atomic disk writes commit. Any broken invariant raises `ContractViolation`, halting the write and leaving the prior file intact.
- **Cross-Log Freshness Audits (`data_freshness.py`):** `DataFreshnessService` and `generate_data_freshness_report` compare `get_latest_team_game_date`, `get_latest_player_game_date`, and `get_latest_schedule_date` to detect missing completed games (`detect_missing_completed_games`) and team/player date drift (`detect_team_player_date_mismatch`).
- **Change rule:** Whenever a required schema column is added or renamed in `src/ingestion/` or `src/processing/`, update the corresponding `check_*` contract in [`contracts.py`](contracts.py) and its unit tests in the same change.
