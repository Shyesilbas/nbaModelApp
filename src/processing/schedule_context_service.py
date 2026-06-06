from typing import Tuple
import os
from datetime import date
import pandas as pd

from src.ingestion.schedule_loader import load_combined_schedule
from src.processing.upcoming_context_service import UpcomingContextService
from scripts.export_frontend_data import export_data as _export_frontend_data


class ScheduleContextService:
    """Service to build combined schedule, upcoming context, and export frontend data."""

    def __init__(self, save: bool = True):
        self.save = save

    def build(self) -> Tuple[pd.DataFrame, pd.DataFrame]:
        # Step 1: Load & combine schedule
        df_combined = load_combined_schedule(save=self.save)

        # Step 2: Build upcoming games context
        ctx_service = UpcomingContextService(save=self.save)
        df_upcoming = ctx_service.build_context(save=self.save)

        # Step 3: Export frontend JSONs
        if self.save:
            _export_frontend_data()

        return df_combined, df_upcoming
