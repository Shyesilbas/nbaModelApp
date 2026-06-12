from typing import Tuple
import os
import json
import pandas as pd
from src.ingestion.boxscore_loader import run_boxscore_pipeline

OUT_DIR = "frontend/public/data"


class BoxscoreService:
    """Service that runs the boxscore pipeline and exports frontend JSONs."""

    def __init__(self, save: bool = True, season: str = None, output_scope: str = "production"):
        self.save = save
        self.season = season
        self.output_scope = output_scope

    def run_and_export(self) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        team_bs_df, player_bs_df, results_df = run_boxscore_pipeline(season=self.season, output_scope=self.output_scope)

        from scripts.season_utils import get_default_season, normalize_season
        current_season = normalize_season(self.season or get_default_season())
        default_season = get_default_season()

        if self.save and self.output_scope != "experimental":
            os.makedirs(OUT_DIR, exist_ok=True)

            def _save_json(df: pd.DataFrame, filename: str):
                for col in df.select_dtypes(include=["datetime64[ns]"]).columns:
                    df[col] = pd.to_datetime(df[col], errors="coerce").dt.strftime("%Y-%m-%d")
                path = os.path.join(OUT_DIR, filename)
                df.to_json(path, orient="records", indent=2, double_precision=4, date_format="iso")

            if current_season == default_season:
                _save_json(results_df.copy(), "game_results.json")

                team_recent = team_bs_df.sort_values("GAME_DATE", ascending=False).copy()
                _save_json(team_recent, "team_boxscores.json")

                player_recent = player_bs_df.sort_values("GAME_DATE", ascending=False).copy()
                _save_json(player_recent, "player_boxscores.json")
            else:
                _save_json(results_df.copy(), f"game_results_{current_season}.json")

                team_recent = team_bs_df.sort_values("GAME_DATE", ascending=False).copy()
                _save_json(team_recent, f"team_boxscores_{current_season}.json")

                player_recent = player_bs_df.sort_values("GAME_DATE", ascending=False).copy()
                _save_json(player_recent, f"player_boxscores_{current_season}.json")

            # Game details: merge game results with the corresponding team and player box scores.
            game_details = []
            if not results_df.empty:
                results_sorted = results_df.copy().sort_values("GAME_DATE", ascending=False)
                for _, row in results_sorted.iterrows():
                    game_id = str(row["GAME_ID"])
                    home_id = row.get("HOME_TEAM_ABBREVIATION")
                    away_id = row.get("AWAY_TEAM_ABBREVIATION")

                    teams_for_game = team_bs_df[team_bs_df["GAME_ID"].astype(str) == game_id].copy()
                    players_for_game = player_bs_df[player_bs_df["GAME_ID"].astype(str) == game_id].copy()

                    def _row_to_dict(series):
                        out = {}
                        for col, val in series.items():
                            if pd.notna(val):
                                if hasattr(val, "item"):
                                    try:
                                        val = val.item()
                                    except Exception:
                                        pass
                                out[col] = val
                        return out

                    team_stats = [_row_to_dict(r) for _, r in teams_for_game.iterrows()]
                    player_stats = [_row_to_dict(r) for _, r in players_for_game.iterrows()]

                    team_lookup = {str(t.get("TEAM_ABBREVIATION")): t for t in team_stats}
                    home_team = team_lookup.get(str(home_id), {})
                    away_team = team_lookup.get(str(away_id), {})

                    leaders = {
                        "points": None,
                        "rebounds": None,
                        "assists": None,
                    }
                    if player_stats:
                        leaders["points"] = max(player_stats, key=lambda x: x.get("PTS", -1) or -1)
                        leaders["rebounds"] = max(player_stats, key=lambda x: x.get("REB", -1) or -1)
                        leaders["assists"] = max(player_stats, key=lambda x: x.get("AST", -1) or -1)

                    game_details.append({
                        "game_id": game_id,
                        "season": row.get("SEASON"),
                        "season_type": row.get("SEASON_TYPE"),
                        "game_date": str(row.get("GAME_DATE")),
                        "game_time": row.get("GAME_TIME"),
                        "game_status": row.get("GAME_STATUS", "Final"),
                        "arena": {
                            "name": row.get("ARENA"),
                            "city": row.get("LOCATION", "").split(",")[0].strip() if row.get("LOCATION") else None,
                            "state": row.get("LOCATION", "").split(",")[1].strip() if row.get("LOCATION") and "," in str(row.get("LOCATION")) else None,
                        },
                        "home_team": {
                            "team_id": home_id,
                            "team_name": row.get("HOME_TEAM_NAME"),
                            "team_city": row.get("HOME_TEAM_CITY"),
                            "score": int(row.get("HOME_SCORE")) if pd.notna(row.get("HOME_SCORE")) else None,
                            "quarter_scores": row.get("HOME_QUARTER_SCORES", None),
                        },
                        "away_team": {
                            "team_id": away_id,
                            "team_name": row.get("AWAY_TEAM_NAME"),
                            "team_city": row.get("AWAY_TEAM_CITY"),
                            "score": int(row.get("AWAY_SCORE")) if pd.notna(row.get("AWAY_SCORE")) else None,
                            "quarter_scores": row.get("AWAY_QUARTER_SCORES", None),
                        },
                        "team_stats": team_stats,
                        "player_stats": player_stats,
                        "game_leaders": leaders,
                        "officials": row.get("OFFICIALS", []) or [],
                        "game_result": _row_to_dict(row),
                    })

            game_details_path = os.path.join(OUT_DIR, "game_details.json")
            with open(game_details_path, "w") as f:
                json.dump(game_details, f, indent=2, default=str)

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
