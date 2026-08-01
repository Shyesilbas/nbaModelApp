from typing import Optional
import pandas as pd
from src.processing import upcoming_context_builder as builder


class UpcomingContextService:
    """Service wrapper for building upcoming games context.

    Provides a class-based entrypoint for orchestration and easier mocking in tests.
    """

    def __init__(self, season: Optional[str] = None, save: bool = True):
        self.season = season
        self.save = save

    def build_context(self, save: Optional[bool] = None) -> pd.DataFrame:
        if save is None:
            save = self.save
        return builder.build_upcoming_games_context(save=save)
