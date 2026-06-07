from typing import Optional, Tuple, List, Dict, Any
import pandas as pd

from src.validation import data_freshness as df_mod


class DataFreshnessService:
    """Service wrapper around src.validation.data_freshness functions.

    Keeps the functional API but provides a lightweight class to orchestrate
    checks from higher-level code or tests.
    """

    def __init__(self, raw_team_dir: str = "data/raw/team_games", raw_player_dir: str = "data/raw/player_games", refresh_schedule: bool = True, season: Optional[str] = None):
        self.raw_team_dir = raw_team_dir
        self.raw_player_dir = raw_player_dir
        self.refresh_schedule = refresh_schedule
        self.season = season

    def load_local_datasets(self, refresh_schedule: Optional[bool] = None) -> Tuple[Optional[pd.DataFrame], Optional[pd.DataFrame], Optional[pd.DataFrame]]:
        ref_sched = refresh_schedule if refresh_schedule is not None else self.refresh_schedule
        return df_mod.load_local_datasets(self.raw_team_dir, self.raw_player_dir, refresh_schedule=ref_sched, season=self.season)

    def get_latest_team_game_date(self, df_team: pd.DataFrame) -> Optional[str]:
        return df_mod.get_latest_team_game_date(df_team)

    def get_latest_player_game_date(self, df_player: pd.DataFrame) -> Optional[str]:
        return df_mod.get_latest_player_game_date(df_player)

    def get_latest_schedule_date(self, df_schedule: pd.DataFrame) -> Optional[str]:
        return df_mod.get_latest_schedule_date(df_schedule)

    def detect_missing_completed_games(self, df_team: pd.DataFrame, df_schedule: pd.DataFrame, today=None) -> Tuple[List[Dict[str, Any]], List[str]]:
        return df_mod.detect_missing_completed_games(df_team, df_schedule, today=today)

    def generate_data_freshness_report(self, df_team: pd.DataFrame, df_player: pd.DataFrame, df_schedule: pd.DataFrame, today=None) -> Dict[str, Any]:
        return df_mod.generate_data_freshness_report(df_team, df_player, df_schedule, today=today)

    def get_inferred_finals_games(self, df_schedule: pd.DataFrame):
        return df_mod.get_inferred_finals_games(df_schedule)
