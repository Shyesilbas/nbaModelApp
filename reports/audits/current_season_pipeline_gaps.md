# Current-Season Pipeline Gaps and Vulnerability Report

This document audits the gaps, vulnerabilities, and potential leakage risks in the current 2025-26 NBA model data pipeline, preparing the system for multi-season extension.

---

## 1. Hardcoded Paths

Multiple components in the current project hardcode the `2025_26` season name or file paths, presenting immediate barriers to multi-season extensions:

*   **Feature Building:** `scripts/build_matchup_features.py` points directly to:
    *   `data/features/team_games_features_2025_26.parquet`
    *   `data/processed/game_results_2025_26.parquet`
*   **Training Scripts:** `scripts/train_win_probability_v2.py` hardcodes the team dataset file path as:
    *   `data/processed/team_model_ready_v2_2025_26.csv`
*   **Central Orchestrator:** `main.py` hardcodes `2025_26` in file name formats across multiple commands: `--build-schedule-context`, `--fetch-boxscores`, `--sync-pipeline`, and `--build-enhanced-v2`.

---

## 2. Roster snapshots and trade handling

*   **Static Core Players:** Currently, the player pipeline relies on a single static roster file: [core_players.csv](file:///Users/serhat/agProjects/nbaModelApp/data/production/core_players.csv). This approach breaks when extending to multiple seasons because:
    *   Rosters change significantly season-over-season.
    *   Players get traded mid-season, resulting in varying team affiliations.
    *   Injured players are replaced by call-ups.
*   **No Transaction Log Tracking:** There is no infrastructure to apply transaction logs (trades, signings, waivers) as-of a specific `prediction_date`. For historical seasons, compiling rolling statistics without this mapping will cause significant data leakage (the model would have knowledge of trades that haven't happened yet) or invalid features.

---

## 3. Data Leakage Risks

*   **Proxy-Based Availability:** Currently, player availability is determined using a proxy: "did the player play in any of the last 3 team games?"
    *   *Risk:* If the team gets a mid-season trade, the new player won't have played any of the last 3 games for that team, incorrectly marking them as "missing" (injured) even if active.
    *   *Risk:* A player traded *away* might still be counted in the team's available minutes share if they played for the team in the last 3 games, leading to a roster membership leakage.
*   **Split form NaNs:** The split form feature ffilling relies on chronological sorting. In multi-season datasets, if seasons are concatenated without partitioning, split features could forward-fill *across* seasons (e.g., carrying over form from April of one season to October of the next), leaking old context.

---

## 4. Duplicate Datasets

The project currently has duplicate and redundant versions of key files:
*   [core_players.csv](file:///Users/serhat/agProjects/nbaModelApp/data/core_players.csv) exists in three different directories:
    *   `data/core_players.csv`
    *   `data/production/core_players.csv` (used by configs)
    *   `data/canonical/core_players.csv` (mirrored copy)
    *   `data/analysis/core_players.csv`
*   The V2 player-feature datasets are duplicated:
    *   `data/processed/team_win_model_ready_v2_player_features.csv`
    *   `data/production/team_win_model_ready_v2_player_features.csv`

---

## 5. Lack of Testing and Validation

*   **No Pipeline Unit Tests:** The project completely lacks automated unit tests to verify:
    *   Chronological shift correctness (verifying `shift(1)` successfully avoids game-day leakage).
    *   Opponent merge alignment on `GAME_ID`.
    *   Date cleaning logic.
*   **No Data Integrity Scans:** There are no automatic safeguards to detect missing rows or data duplicates during the ingestion-update-feature pipeline execution.
