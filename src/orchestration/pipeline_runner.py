from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any, Dict, Optional, Tuple

import os
import pandas as pd

from src.core.data_paths import get_data_paths
from src.core.season_utils import get_default_season, normalize_season, season_to_file_token
from src.features import build_opponent_features, build_team_features, validate_opponent_join
from src.ingestion.boxscore_loader import run_boxscore_pipeline
from src.ingestion.data_loader import load_player_games, load_team_games
from src.ingestion.schedule_loader import load_combined_schedule
from src.processing.cleaning import clean_dates, sort_player_games, sort_team_games
from src.processing.model_dataset_builder import (
    build_team_model_dataset,
    build_team_model_dataset_v2,
    build_team_model_dataset_v3,
)
from src.processing.upcoming_context_service import UpcomingContextService


@dataclass
class PipelineResult:
    status: str
    metadata: Dict[str, Any]


class PipelineRunner:
    """Central orchestration helper for reusable pipeline steps.

    This isolates the concrete pipeline logic from main.py and other services
    so orchestration can be shared without importing main's private functions.
    """

    def __init__(
        self,
        season: Optional[str] = None,
        output_scope: str = "production",
    ) -> None:
        self.season = normalize_season(season or get_default_season())
        self.token = season_to_file_token(self.season)
        self.output_scope = output_scope
        self.paths = get_data_paths(self.season)

    def sync_features(self) -> PipelineResult:
        df_team_raw = load_team_games(season=self.season)
        df_player_raw = load_player_games(season=self.season)

        df_team_clean = sort_team_games(clean_dates(df_team_raw, "GAME_DATE"))
        df_player_clean = sort_player_games(clean_dates(df_player_raw, "GAME_DATE"))

        df_team_features = build_team_features(df_team_clean, season_dir=self.paths.season_dir)
        df_player_features = pd.DataFrame()
        try:
            from src.features import build_player_features

            df_player_features = build_player_features(df_player_clean)
        except Exception:
            df_player_features = pd.DataFrame()

        os.makedirs(os.path.dirname(self.paths.team_features), exist_ok=True)
        os.makedirs(os.path.dirname(self.paths.player_features), exist_ok=True)

        team_csv = self.paths.team_features if self.output_scope == "production" else os.path.join(
            "data/experimental", f"team_games_features_{self.token}.csv"
        )
        player_csv = self.paths.player_features if self.output_scope == "production" else os.path.join(
            "data/experimental", f"player_games_features_{self.token}.csv"
        )

        os.makedirs(os.path.dirname(team_csv), exist_ok=True)
        os.makedirs(os.path.dirname(player_csv), exist_ok=True)

        df_team_features.to_csv(team_csv, index=False)
        if not df_player_features.empty:
            df_player_features.to_csv(player_csv, index=False)
        if self.output_scope == "production":
            # Box-score features live only in the enrichment step; without it the season's
            # team_features.csv would lose them (the V3 file is re-enriched as well, idempotently).
            from src.features.enrich_v3_boxscore_features import enrich_all_seasons
            enrich_all_seasons([self.season])

        return PipelineResult(
            status="SUCCESS",
            metadata={
                "raw_team_rows": len(df_team_raw),
                "raw_player_rows": len(df_player_raw),
                "team_feature_rows": len(df_team_features),
                "player_feature_rows": len(df_player_features),
                "team_features_path": team_csv,
                "player_features_path": player_csv,
            },
        )

    def build_model_ready_v2(self) -> Tuple[pd.DataFrame, int]:
        df_team_raw = load_team_games(season=self.season)
        df_team_clean = sort_team_games(clean_dates(df_team_raw, "GAME_DATE"))
        df_team_features = build_team_features(df_team_clean, season_dir=self.paths.season_dir)
        df_team_features_with_opp = build_opponent_features(df_team_features)
        return build_team_model_dataset_v2(df_team_features_with_opp)

    def build_model_ready_v3(self, df_player_features: pd.DataFrame) -> Tuple[pd.DataFrame, int]:
        from src.features.core_player_availability_features import build_core_player_availability_features

        df_team_raw = load_team_games(season=self.season)
        df_team_clean = sort_team_games(clean_dates(df_team_raw, "GAME_DATE"))
        df_team_features = build_team_features(df_team_clean, season_dir=self.paths.season_dir)
        df_team_features_with_opp = build_opponent_features(df_team_features)
        df_team_features_with_core = build_core_player_availability_features(
            df_team_features_with_opp,
            df_player_features,
        )
        return build_team_model_dataset_v3(df_team_features_with_core)

    def build_schedule_context(self, save: bool = True) -> Tuple[pd.DataFrame, pd.DataFrame]:
        df_combined = load_combined_schedule(season=self.season, save=save)
        ctx_service = UpcomingContextService(season=self.season, save=save)
        return df_combined, ctx_service.build_context(save=save)

    def rebuild_game_results(self) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        return run_boxscore_pipeline()
