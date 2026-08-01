from typing import Any
from scripts.season_utils import get_default_season
from src.orchestration import pipeline_workflows as workflows


class PipelineOrchestrator:
    def __init__(self, args: Any):
        self.args = args

    def dispatch(self) -> bool:
        """
        Handle flag-driven commands before falling back to the default pipeline.

        Returns True when a command was handled, otherwise False so the caller
        can continue with the interactive/default flow.
        """
        if self.args.update_data:
            workflows.run_update_data(self.args)
            return True
        if self.args.build_player_dataset_v4:
            workflows.run_build_player_dataset_pipeline(self.args)
            return True
        if self.args.train_player_models:
            workflows.run_train_player_models_pipeline(self.args)
            return True
        if self.args.train_score_models:
            workflows.run_train_score_models_pipeline(self.args)
            return True
        if self.args.train_win_model:
            workflows.run_train_win_model_pipeline(self.args)
            return True
        if self.args.startup_check:
            workflows.run_startup_check(self.args)
            return True
        if self.args.sync_pipeline:
            workflows.run_sync_pipeline(self.args)
            return True
        if self.args.pre_model_readiness:
            workflows.run_pre_model_readiness_pipeline(self.args)
            return True
        if self.args.bootstrap_season:
            workflows.run_bootstrap_season_pipeline(self.args)
            return True
        if self.args.export_frontend_data:
            from scripts.export_frontend_data import export_data
            export_data(season=self.args.season or get_default_season())
            return True
        if self.args.build_schedule_context:
            workflows.run_schedule_context_pipeline()
            return True
        if self.args.fetch_boxscores:
            workflows.run_boxscore_pipeline_cli(self.args)
            return True
        if self.args.check_data_freshness:
            workflows.run_data_freshness_pipeline(self.args)
            return True

        return False

