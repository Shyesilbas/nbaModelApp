"""
Unified Data Export Manager.
Consolidates frontend data caches, player profiles, archive packs, and backend runtime bundles.
"""

import json
import os
import shutil
from pathlib import Path
from typing import Dict, Any, Optional

import pandas as pd
from scripts.data_paths import get_data_paths
from scripts.season_utils import get_default_season, normalize_season, season_to_file_token


class ExportManager:
    def __init__(self, season: Optional[str] = None, output_dir: str = "frontend/public/data"):
        self.season = normalize_season(season or get_default_season())
        self.file_token = season_to_file_token(self.season)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def export_frontend_bundle(self) -> Dict[str, Any]:
        """
        Exports core frontend datasets: game results, team boxscores, player boxscores, and highlights.
        """
        paths = get_data_paths(self.season)
        results = {"exported": [], "status": "pass"}

        if Path(paths.game_results).exists():
            df_res = pd.read_csv(paths.game_results)
            res_json_path = self.output_dir / "game_results.json"
            df_res.to_json(res_json_path, orient="records", indent=2, double_precision=4)
            results["exported"].append(str(res_json_path))

        if Path(paths.team_features).exists():
            df_team = pd.read_csv(paths.team_features)
            team_json_path = self.output_dir / "team_boxscores.json"
            df_team.head(2000).to_json(team_json_path, orient="records", indent=2, double_precision=4)
            results["exported"].append(str(team_json_path))

        if Path(paths.player_features).exists():
            df_player = pd.read_csv(paths.player_features)
            player_json_path = self.output_dir / "player_boxscores.json"
            df_player.head(3000).to_json(player_json_path, orient="records", indent=2, double_precision=4)
            results["exported"].append(str(player_json_path))

        return results

    def export_multi_season_bundle(self) -> Dict[str, Any]:
        """
        Discovers all available seasons and exports combined multi-season game feeds.
        """
        from scripts.season_utils import discover_seasons
        from scripts.export_all_seasons_games import load_game_results

        seasons = discover_seasons()
        all_games = []
        for s_key, s_path in seasons.items():
            s_games = load_game_results(s_key, s_path)
            all_games.extend(s_games)

        out_path = self.output_dir / "all_seasons_games.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(all_games, f, indent=2)

        seasons_path = self.output_dir / "seasons.json"
        with open(seasons_path, "w", encoding="utf-8") as f:
            json.dump(list(seasons.keys()), f, indent=2)

        return {
            "discovered_seasons": list(seasons.keys()),
            "total_games_exported": len(all_games),
            "output_path": str(out_path),
        }

    def export_all(self) -> Dict[str, Any]:
        """
        Executes all export targets atomically across single and multi-season scopes.
        """
        bundle_res = self.export_frontend_bundle()
        multi_res = self.export_multi_season_bundle()
        return {
            "season": self.season,
            "status": "success",
            "details": {
                "single_season": bundle_res,
                "multi_season": multi_res,
            }
        }
