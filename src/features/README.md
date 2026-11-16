# Features Domain

Computes leak-free pre-game team, player, Continuous Elo, schedule density, rotation continuity, and live injury/absence delta features shared by training and live serving.

> [!NOTE]
> **Related Documentation & Runbooks:**
> - **Architecture Deep Dives:** [`docs/pipeline_overview.md`](../../docs/pipeline_overview.md) · [`docs/early_season_transitions.md`](../../docs/early_season_transitions.md) · [`docs/reports/models/win_probability_model.md`](../../docs/reports/models/win_probability_model.md)
> - **Key Entry Points:** [`build_matchup_features.py`](build_matchup_features.py) · [`continuous_elo.py`](continuous_elo.py) · [`opening_elo.py`](opening_elo.py) · [`roster_absence.py`](roster_absence.py) · [`roster_talent.py`](roster_talent.py) · [`player_form.py`](player_form.py) · [`starter_history.py`](starter_history.py) · [`team_features.py`](team_features.py) · [`player_features.py`](player_features.py) · [`win_strength_features.py`](win_strength_features.py)

## Business Rules & Invariants
- **Strict Pre-Game Leakage Boundary (`shift(1)`):** Every rolling window, EWMA, opponent allowance, and Elo state uses strictly earlier chronological games (`< game_date` or `shift(1)`). Post-game outcomes never enter feature columns.
- **Single Feature Builder for Train & Serve:** `build_features` in [`build_matchup_features.py`](build_matchup_features.py) and `add_player_matchup_features` in [`player_form.py`](player_form.py) execute the exact transformations used offline so train-serve feature skew stays zero.
- **Decoupled Roster Absence & Continuity (`v12+`):** [`roster_absence.py`](roster_absence.py) evaluates a `WINDOW = 15` rotation (`MIN_ROTATION_MINUTES = 20.0`, `MIN_HISTORY_GAMES = 5`) via `build_absence_deltas` (offline boxscore availability) and `live_roster_metrics` (live overrides + previous-game carry-forward), producing `ABS_DIFF`, `MISSING_ROT_MINS_DIFF`, `ROT_CONTINUITY_DIFF`, and `ACTIVE_WT_GS_DIFF`.
- **Continuous Elo & Opening Carry-Over:** `ContinuousEloEngine` (`SEASON_REGRESSION = 0.6`, `HOME_COURT_ADVANTAGE = 50`) chains franchise ratings across seasons; `build_opening_elo` and `roster_elo_adjustment` compute season-opening ratings.
- **Early-Season Prior Handover:** `blend_score_form_with_prior` shrinks prior-season pace and offensive/defensive ratings 75% toward league means and linearly hands over to current-season form over 6 games.
- **Change rule:** Any new feature or window change requires updating YAML feature contracts under `config/features/`, running `check_feature_matrix`, and validating against multi-season walk-forward baselines before adoption.
