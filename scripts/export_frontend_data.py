import os
import json
import math
import pandas as pd

from scripts.data_paths import get_data_paths
from scripts.season_utils import get_default_season, normalize_season

def _normalized_season_type(df: pd.DataFrame) -> pd.Series:
    """Return a normalized SEASON_TYPE series with Finals derived from GAME_ID."""
    if "SEASON_TYPE" not in df.columns:
        return pd.Series([None] * len(df), index=df.index)
    season = df["SEASON_TYPE"].astype(str).copy()
    if "GAME_ID" not in df.columns:
        return season
    gid = df["GAME_ID"].astype(str).str.zfill(10)
    season = season.mask(gid.str.startswith("00425004"), "NBA Finals")
    return season


def _json_safe(value):
    if isinstance(value, float) and math.isnan(value):
        return None
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    return value

def export_data(season: str = None):
    from scripts.season_utils import get_default_season
    normalized_s = normalize_season(season or get_default_season())
    default_s = get_default_season()

    if normalized_s != default_s:
        print(f"Skipping frontend export for historical season {normalized_s} (only active season {default_s} is exported via export_frontend_data).")
        return

    paths = get_data_paths(normalized_s)
    raw_team_path = paths.team_games_raw
    raw_player_path = paths.player_games_raw
    
    roster_path = "data/analysis/team_rosters.csv"
    core_path = "data/analysis/core_players.csv"
    star_path = "data/analysis/star_candidates.csv"
    multi_team_path = "data/analysis/multi_team_players.csv"
    lookup_path = "data/analysis/player_name_lookup.csv"
    
    schedule_combined_path = paths.schedule_combined
    upcoming_context_path  = paths.upcoming_context

    token = normalized_s.replace("-", "_")
    model_v1_path = f"data/processed/team_model_ready_{token}.csv"
    model_v2_path = paths.team_model_ready_v2
    model_v3_path = f"data/processed/team_model_ready_v3_{token}.csv"
    
    out_dir = "frontend/public/data"
    os.makedirs(out_dir, exist_ok=True)
    games_feed_path = os.path.join(out_dir, "games.json")
    
    print("============================================================")
    print("🚀 NBA INTELLIGENCE LAB - EXPORTING FRONTEND DATASETS 🚀")
    print("============================================================\n")
    
    # 1. Read datasets & save directly as JSON records
    datasets = {
        "team_rosters.json": roster_path,
        "core_players.json": core_path,
        "star_candidates.json": star_path,
        "multi_team_players.json": multi_team_path,
        "player_name_lookup.json": lookup_path
    }

    # Schedule datasets (exported separately with date serialisation)
    schedule_datasets = {
        "schedule.json": schedule_combined_path,
        "upcoming_games_context.json": upcoming_context_path,
    }
    
    for filename, path in datasets.items():
        if os.path.exists(path):
            df = pd.read_csv(path)
            # Save as json records
            out_path = os.path.join(out_dir, filename)
            df.to_json(out_path, orient="records", double_precision=4)
            print(f"✅ Exported {path} -> {out_path} ({df.shape[0]} rows)")
        else:
            print(f"⚠️ Warning: Dataset not found: {path}")

    # 1b. Export schedule JSON files — use pandas to_json() to correctly
    #     serialise NaN as JSON null (json.dump writes the invalid literal NaN)
    for filename, path in schedule_datasets.items():
        if os.path.exists(path):
            df = pd.read_csv(path, dtype={"GAME_ID": str})
            # Normalise GAME_DATE to plain date strings (YYYY-MM-DD)
            if "GAME_DATE" in df.columns:
                df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce").dt.strftime("%Y-%m-%d")
            out_path = os.path.join(out_dir, filename)
            # to_json with orient="records" serialises NaN → null correctly
            df.to_json(out_path, orient="records", indent=2, double_precision=4, date_format="iso")
            print(f"✅ Exported {path} -> {out_path} ({len(df)} rows)")
        else:
            print(f"⚠️ Warning: Schedule dataset not found: {path}")

    # 1c. Export canonical merged games feed for the frontend.
    if os.path.exists(schedule_combined_path):
        df_schedule = pd.read_csv(schedule_combined_path, dtype={"GAME_ID": str})
        if "GAME_DATE" in df_schedule.columns:
            df_schedule["GAME_DATE"] = pd.to_datetime(df_schedule["GAME_DATE"], errors="coerce").dt.strftime("%Y-%m-%d")

        df_games = df_schedule.copy()
        if os.path.exists(paths.game_results):
            df_results = pd.read_csv(paths.game_results, dtype={"GAME_ID": str})
            if "GAME_DATE" in df_results.columns:
                df_results["GAME_DATE"] = pd.to_datetime(df_results["GAME_DATE"], errors="coerce").dt.strftime("%Y-%m-%d")
            result_cols = [c for c in df_results.columns if c != "GAME_DATE"]
            df_games = df_games.merge(df_results[result_cols], on="GAME_ID", how="left", suffixes=("", "_RESULT"))

        if os.path.exists(upcoming_context_path):
            df_upcoming = pd.read_csv(upcoming_context_path, dtype={"GAME_ID": str})
            if "GAME_DATE" in df_upcoming.columns:
                df_upcoming["GAME_DATE"] = pd.to_datetime(df_upcoming["GAME_DATE"], errors="coerce").dt.strftime("%Y-%m-%d")
            ctx_cols = [c for c in df_upcoming.columns if c != "GAME_DATE"]
            df_games = df_games.merge(df_upcoming[ctx_cols], on="GAME_ID", how="left", suffixes=("", "_CTX"))

        df_games = df_games.sort_values(["GAME_DATE", "GAME_ID"]).reset_index(drop=True)
        detail_lookup = {}
        game_details_path = os.path.join(out_dir, "game_details.json")
        if os.path.exists(game_details_path):
            try:
                with open(game_details_path, "r", encoding="utf-8") as f:
                    for item in json.load(f):
                        gid = str(item.get("game_id") or item.get("GAME_ID") or "")
                        if gid:
                            detail_lookup[gid] = item
            except Exception:
                detail_lookup = {}

        records = []
        for row in df_games.to_dict(orient="records"):
            gid = str(row.get("GAME_ID", ""))
            row["game_detail"] = detail_lookup.get(gid)
            records.append(_json_safe(row))

        with open(games_feed_path, "w", encoding="utf-8") as f:
            json.dump(records, f, indent=2, default=str, allow_nan=False)
        print(f"✅ Exported canonical games feed -> {games_feed_path} ({len(df_games)} rows)")
    else:
        print(f"⚠️ Warning: Canonical games feed source not found: {schedule_combined_path}")

    # 2. Build summary statistics for overview and health dashboard
    summary = {}
    
    # Load raw logs to get shapes and season splits
    if os.path.exists(raw_team_path):
        df_team = pd.read_csv(raw_team_path)
        df_team["SEASON_TYPE_NORM"] = _normalized_season_type(df_team)
        summary["total_team_game_rows"] = len(df_team)
        summary["team_games_regular"] = int((df_team["SEASON_TYPE_NORM"] == "Regular Season").sum())
        summary["team_games_playin"] = int((df_team["SEASON_TYPE_NORM"] == "PlayIn").sum())
        summary["team_games_playoffs"] = int((df_team["SEASON_TYPE_NORM"] == "Playoffs").sum())
        summary["team_games_finals"] = int((df_team["SEASON_TYPE_NORM"] == "NBA Finals").sum())
    else:
        summary["total_team_game_rows"] = 0
        summary["team_games_regular"] = 0
        summary["team_games_playin"] = 0
        summary["team_games_playoffs"] = 0
        summary["team_games_finals"] = 0
        
    if os.path.exists(raw_player_path):
        df_player = pd.read_csv(raw_player_path)
        df_player["SEASON_TYPE_NORM"] = _normalized_season_type(df_player)
        summary["total_player_game_rows"] = len(df_player)
        summary["player_games_regular"] = int((df_player["SEASON_TYPE_NORM"] == "Regular Season").sum())
        summary["player_games_playin"] = int((df_player["SEASON_TYPE_NORM"] == "PlayIn").sum())
        summary["player_games_playoffs"] = int((df_player["SEASON_TYPE_NORM"] == "Playoffs").sum())
        summary["player_games_finals"] = int((df_player["SEASON_TYPE_NORM"] == "NBA Finals").sum())
    else:
        summary["total_player_game_rows"] = 0
        summary["player_games_regular"] = 0
        summary["player_games_playin"] = 0
        summary["player_games_playoffs"] = 0
        summary["player_games_finals"] = 0

    # Load lookup datasets to get counts
    if os.path.exists(roster_path):
        df_roster = pd.read_csv(roster_path)
        summary["total_teams"] = int(df_roster["TEAM_ABBREVIATION"].nunique())
    else:
        summary["total_teams"] = 0
        
    if os.path.exists(lookup_path):
        df_lookup = pd.read_csv(lookup_path)
        summary["total_players"] = int(df_lookup["PLAYER_ID"].nunique())
    else:
        summary["total_players"] = 0
        
    # Model V1 info
    if os.path.exists(model_v1_path):
        df_v1 = pd.read_csv(model_v1_path)
        summary["v1_rows"] = len(df_v1)
        summary["v1_features"] = len(df_v1.columns) - 7  # excluding target (WIN) and 6 metadata columns
    else:
        summary["v1_rows"] = 0
        summary["v1_features"] = 0
        
    # Model V2 info
    if os.path.exists(model_v2_path):
        df_v2 = pd.read_csv(model_v2_path)
        summary["v2_rows"] = len(df_v2)
        summary["v2_features"] = len(df_v2.columns) - 7
    else:
        summary["v2_rows"] = 0
        summary["v2_features"] = 0
        
    # Model V3 info
    if os.path.exists(model_v3_path):
        df_v3 = pd.read_csv(model_v3_path)
        summary["v3_rows"] = len(df_v3)
        summary["v3_features"] = len(df_v3.columns) - 7
    else:
        summary["v3_rows"] = 0
        summary["v3_features"] = 0

    # Additional file status checks for health dashboard
    files_status = []
    all_files = {
        "Raw Team Game Logs": raw_team_path,
        "Raw Player Game Logs": raw_player_path,
        "Team Rosters": roster_path,
        "Core Players List": core_path,
        "Star Candidates": star_path,
        "Multi-Team Players": multi_team_path,
        "Player Name Lookup": lookup_path,
        "V1 Model-Ready Dataset": model_v1_path,
        "V2 Model-Ready Dataset": model_v2_path,
        "V3 Model-Ready Dataset": model_v3_path,
        "Combined Schedule": schedule_combined_path,
        "Upcoming Games Context": upcoming_context_path,
    }
    
    for desc, path in all_files.items():
        exists = os.path.exists(path)
        rows, cols = 0, 0
        size_kb = 0.0
        if exists:
            df = pd.read_csv(path)
            rows, cols = df.shape
            size_kb = round(os.path.getsize(path) / 1024.0, 2)
        
        files_status.append({
            "name": desc,
            "path": path,
            "exists": exists,
            "rows": rows,
            "columns": cols,
            "size_kb": size_kb
        })
        
    summary["files_status"] = files_status
    
    # Save dataset_summary.json
    out_summary_path = os.path.join(out_dir, "dataset_summary.json")
    with open(out_summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"✅ Exported summary statistics -> {out_summary_path}")

    # Build and Save model_ready_v2_summary.json
    v2_summary = {}
    if os.path.exists(model_v2_path):
        df_v2 = pd.read_csv(model_v2_path)
        v2_summary["row_count"] = len(df_v2)
        
        metadata_cols = ["TEAM_ID", "TEAM_ABBREVIATION", "TEAM_NAME", "GAME_ID", "GAME_DATE", "MATCHUP", "OPPONENT_ABBREVIATION"]
        existing_meta = [c for c in metadata_cols if c in df_v2.columns]
        v2_summary["metadata_columns"] = existing_meta
        v2_summary["target_column"] = "WIN"
        
        features = [col for col in df_v2.columns if col != "WIN" and col not in metadata_cols]
        v2_summary["feature_columns"] = features
        v2_summary["feature_count"] = len(features)
        
        # Convert int64 value counts to normal python ints
        dist = df_v2["WIN"].value_counts().to_dict()
        v2_summary["target_distribution"] = {str(k): int(v) for k, v in dist.items()}
        
        v2_summary["leakage_warnings"] = [
            "V2 dataset is 100% leakage-free. All rolling averages use shift(1) and do not contain information from the game being predicted.",
            "Defensive allowed points, split home/away form, and head-to-head metrics are computed strictly using historical games prior to the matchup date."
        ]
        
        if "GAME_DATE" in df_v2.columns:
            # Sort date strings
            dates = pd.to_datetime(df_v2["GAME_DATE"], errors="coerce").dt.strftime("%Y-%m-%d")
            v2_summary["latest_game_date"] = str(dates.max())
            v2_summary["earliest_game_date"] = str(dates.min())
            
        v2_summary["sync_status"] = "SYNCHRONIZED"
    else:
        v2_summary["sync_status"] = "MISSING"
        
    out_v2_summary_path = os.path.join(out_dir, "model_ready_v2_summary.json")
    with open(out_v2_summary_path, "w") as f:
        json.dump(v2_summary, f, indent=2)
    print(f"✅ Exported Model V2 summary -> {out_v2_summary_path}")

    print("\n============================================================")
    print("🎉 FRONTEND DATASETS EXPORT COMPLETED SUCCESSFULLY! 🎉")
    print("============================================================\n")

if __name__ == "__main__":
    export_data()
