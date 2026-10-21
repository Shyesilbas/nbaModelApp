"""Which rotation players the WIN/SCORE models assume are out when nobody said otherwise."""
from __future__ import annotations

import pandas as pd

from src.features.build_matchup_features import _load_absence_logs, _parse_player_overrides
from src.core.season_utils import date_to_season
from src.features.roster_absence import assumed_out_players


def importance_score(row) -> float:
    """Same formula as src/analysis/roster_analysis.py, on current form (EMA-10) so a role change shows up."""
    def v(c):
        x = pd.to_numeric(row.get(c), errors="coerce")
        return 0.0 if pd.isna(x) else float(x)
    return round(0.5 * v("MIN_EMA_10") + v("PTS_EMA_10") + 0.8 * v("AST_EMA_10") + 0.6 * v("REB_EMA_10"), 2)


def assumed_out_ids(team: str, pred_date: str, overrides=None, preseason: bool = False) -> set:
    logs = _load_absence_logs(date_to_season(pd.to_datetime(pred_date)))
    return assumed_out_players(logs, team, pred_date, _parse_player_overrides(overrides), preseason)
