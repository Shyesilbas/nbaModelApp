from typing import Tuple

import pandas as pd

from src.ingestion.boxscore_loader import run_boxscore_pipeline


class BoxscoreService:
    """Runs the boxscore pipeline (team/player box scores + game results under data/).

    The frontend reads these through the frontend store (src/frontend_store/), which
    takes arena and officials from the cached game summaries warmed here.
    """

    def __init__(
        self,
        save: bool = True,
        season: str = None,
        output_scope: str = "production",
        warm_summaries: bool = True,
        summary_game_ids: list[str] | None = None,
    ):
        self.save = save
        self.season = season
        self.output_scope = output_scope
        self.warm_summaries = warm_summaries
        self.summary_game_ids = summary_game_ids

    def run_and_export(self) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        team_bs_df, player_bs_df, results_df = run_boxscore_pipeline(season=self.season, output_scope=self.output_scope)
        if self.save and self.output_scope != "experimental" and self.warm_summaries:
            self._warm_game_summaries(results_df)
        return team_bs_df, player_bs_df, results_df

    def _warm_game_summaries(self, results_df: pd.DataFrame) -> None:
        """Fetch summaries for finished games not cached yet (the store never calls the API)."""
        from src.core.season_utils import get_default_season, normalize_season
        from src.frontend_store.season_status import CLOSED, season_status
        from src.ingestion.game_summary_fetcher import fetch_game_summary

        season = normalize_season(self.season or get_default_season())
        if results_df.empty or "HOME_SCORE" not in results_df.columns or season_status(season) == CLOSED:
            return
        game_ids = results_df.loc[results_df["HOME_SCORE"].notna(), "GAME_ID"].astype(str)
        if self.summary_game_ids is not None:
            allowed = {str(g).zfill(10) for g in self.summary_game_ids}
            game_ids = [gid for gid in game_ids if gid.zfill(10) in allowed]
        for game_id in game_ids:
            try:
                fetch_game_summary(game_id.zfill(10), season=season)
            except Exception as exc:  # arena/officials are optional detail
                print(f"  Warning: game summary unavailable for {game_id}: {exc}")
