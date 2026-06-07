import importlib
from typing import Any


class PipelineOrchestrator:
    def __init__(self, args: Any):
        self.args = args
        self._legacy_main = None

    def _main_module(self):
        if self._legacy_main is None:
            self._legacy_main = importlib.import_module("main")
        return self._legacy_main

    def dispatch(self) -> bool:
        """
        Handle flag-driven commands before falling back to the default pipeline.

        Returns True when a command was handled, otherwise False so the caller
        can continue with the interactive/default flow.
        """
        main_mod = self._main_module()

        if self.args.update_data:
            main_mod._run_update_data(self.args)
            return True
        if self.args.startup_check:
            main_mod._run_startup_check(self.args)
            return True
        if self.args.sync_pipeline:
            main_mod._run_sync_pipeline(self.args)
            return True
        if self.args.pre_model_readiness:
            main_mod._run_pre_model_readiness_pipeline(self.args)
            return True
        if self.args.export_frontend_data:
            from scripts.export_frontend_data import export_data

            export_data()
            return True
        if self.args.build_schedule_context:
            main_mod._run_schedule_context_pipeline()
            return True
        if self.args.fetch_boxscores:
            main_mod._run_boxscore_pipeline_cli(self.args)
            return True
        if self.args.check_data_freshness:
            main_mod._run_data_freshness_pipeline(self.args)
            return True

        return False

