from typing import Tuple
import os
import json
import pandas as pd
from src.ingestion.boxscore_loader import run_boxscore_pipeline

OUT_DIR = "frontend/public/data"


class BoxscoreService:
    """Service that runs the boxscore pipeline and exports frontend JSONs."""

    def __init__(self, save: bool = True):
        self.save = save

    def run_and_export(self) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        team_bs_df, player_bs_df, results_df = run_boxscore_pipeline()

        if self.save:
            os.makedirs(OUT_DIR, exist_ok=True)

            def _save_json(df: pd.DataFrame, filename: str):
                for col in df.select_dtypes(include=["datetime64[ns]"]).columns:
                    df[col] = pd.to_datetime(df[col], errors="coerce").dt.strftime("%Y-%m-%d")
                path = os.path.join(OUT_DIR, filename)
                df.to_json(path, orient="records", indent=2, double_precision=4, date_format="iso")

            _save_json(results_df.copy(), "game_results.json")

            team_recent = team_bs_df.sort_values("GAME_DATE", ascending=False).head(2000).copy()
            _save_json(team_recent, "team_boxscores.json")

            player_recent = player_bs_df.sort_values("GAME_DATE", ascending=False).head(3000).copy()
            _save_json(player_recent, "player_boxscores.json")

            # Highlights
            highlights = {"highest_scoring_games": [], "lowest_scoring_games": [], "top_points": [], "top_assists": [], "top_rebounds": []}
            if not results_df.empty:
                df_res = results_df.copy()
                df_res["TOTAL_PTS"] = df_res["HOME_SCORE"] + df_res["AWAY_SCORE"]
                df_high = df_res.sort_values("TOTAL_PTS", ascending=False).head(5)
                for _, row in df_high.iterrows():
                    highlights["highest_scoring_games"].append({
                        "GAME_ID": row["GAME_ID"],
                        "GAME_DATE": str(row["GAME_DATE"]),
                        "HOME_TEAM": row["HOME_TEAM_ABBREVIATION"],
                        "AWAY_TEAM": row["AWAY_TEAM_ABBREVIATION"],
                        "HOME_SCORE": int(row["HOME_SCORE"]),
                        "AWAY_SCORE": int(row["AWAY_SCORE"]),
                        "TOTAL_PTS": int(row["TOTAL_PTS"]),
                        "SEASON_TYPE": row["SEASON_TYPE"]
                    })
                df_low = df_res.sort_values("TOTAL_PTS", ascending=True).head(5)
                for _, row in df_low.iterrows():
                    highlights["lowest_scoring_games"].append({
                        "GAME_ID": row["GAME_ID"],
                        "GAME_DATE": str(row["GAME_DATE"]),
                        "HOME_TEAM": row["HOME_TEAM_ABBREVIATION"],
                        "AWAY_TEAM": row["AWAY_TEAM_ABBREVIATION"],
                        "HOME_SCORE": int(row["HOME_SCORE"]),
                        "AWAY_SCORE": int(row["AWAY_SCORE"]),
                        "TOTAL_PTS": int(row["TOTAL_PTS"]),
                        "SEASON_TYPE": row["SEASON_TYPE"]
                    })
            if not player_bs_df.empty:
                df_player = player_bs_df.copy()
                if "PTS" in df_player.columns:
                    df_pts = df_player.sort_values("PTS", ascending=False).head(5)
                    for _, row in df_pts.iterrows():
                        highlights["top_points"].append({
                            "PLAYER_NAME": row["PLAYER_NAME"],
                            "TEAM": row["TEAM_ABBREVIATION"],
                            "MATCHUP": row.get("MATCHUP", ""),
                            "GAME_DATE": str(row["GAME_DATE"]),
                            "VALUE": int(row["PTS"]),
                            "GAME_ID": row["GAME_ID"]
                        })
                if "AST" in df_player.columns:
                    df_ast = df_player.sort_values("AST", ascending=False).head(5)
                    for _, row in df_ast.iterrows():
                        highlights["top_assists"].append({
                            "PLAYER_NAME": row["PLAYER_NAME"],
                            "TEAM": row["TEAM_ABBREVIATION"],
                            "MATCHUP": row.get("MATCHUP", ""),
                            "GAME_DATE": str(row["GAME_DATE"]),
                            "VALUE": int(row["AST"]),
                            "GAME_ID": row["GAME_ID"]
                        })
                if "REB" in df_player.columns:
                    df_reb = df_player.sort_values("REB", ascending=False).head(5)
                    for _, row in df_reb.iterrows():
                        highlights["top_rebounds"].append({
                            "PLAYER_NAME": row["PLAYER_NAME"],
                            "TEAM": row["TEAM_ABBREVIATION"],
                            "MATCHUP": row.get("MATCHUP", ""),
                            "GAME_DATE": str(row["GAME_DATE"]),
                            "VALUE": int(row["REB"]),
                            "GAME_ID": row["GAME_ID"]
                        })
            highlights_path = os.path.join(OUT_DIR, "highlights.json")
            with open(highlights_path, "w") as f:
                json.dump(highlights, f, indent=2)

        return team_bs_df, player_bs_df, results_df
