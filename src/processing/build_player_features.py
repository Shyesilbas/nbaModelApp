import os
import sys
import argparse
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT))
sys.path.append(str(ROOT / "scripts"))

from scripts.data_paths import get_data_paths
from scripts.season_utils import season_to_file_token
from scripts.build_matchup_features import compute_player_features_for_inference

def build_player_features_dataset(season=None, output_scope="production"):
    season = season or "2025-26"
    token = season_to_file_token(season)
    dp = get_data_paths(season)

    # Resolve input paths dynamically
    team_ready_path = Path(dp.team_model_ready_v2)
    # If the team_model_ready_v2 is stored in experimental (since we run with experimental scope)
    if output_scope == "experimental":
        # Prefer team_model_ready_v2 in experimental, fallback to team_games_features
        experimental_team_ready = ROOT / f"data/experimental/team_model_ready_v2_{token}.csv"
        experimental_team_features = ROOT / f"data/experimental/team_games_features_{token}.csv"
        if experimental_team_ready.exists():
            team_ready_path = experimental_team_ready
        elif experimental_team_features.exists():
            team_ready_path = experimental_team_features
            
    # Resolve game results path
    game_results_path = Path(dp.game_results)
    if output_scope == "experimental":
        experimental_results = ROOT / f"data/experimental/game_results_{token}.csv"
        if experimental_results.exists():
            game_results_path = experimental_results

    # Resolve output path
    if output_scope == "experimental":
        output_path = ROOT / f"data/experimental/team_score_model_ready_v2_{token}.csv"
    else:
        output_path = Path(dp.score_model_dataset)

    print("Starting player feature engineering...")
    print(f"  Season:      {season}")
    print(f"  Input features: {team_ready_path}")
    print(f"  Input results:  {game_results_path}")
    print(f"  Output dataset: {output_path}")

    # Check dependencies
    for p in [team_ready_path, game_results_path]:
        if not p.exists():
            raise FileNotFoundError(f"Required file not found: {p}")

    df_feat = pd.read_csv(team_ready_path)
    df_results = pd.read_csv(game_results_path)

    # 1. Filter features to home team rows only
    df_home_feats = df_feat[df_feat["IS_HOME"].astype(int) == 1].copy()
    print("Filtered features to home team rows. Matchups count:", df_home_feats.shape[0])

    # Convert GAME_ID to string to ensure clean match
    df_home_feats["GAME_ID"] = df_home_feats["GAME_ID"].astype(str)
    df_results["GAME_ID"] = df_results["GAME_ID"].astype(str)

    # Parse dates to datetimes
    df_home_feats["GAME_DATE"] = pd.to_datetime(df_home_feats["GAME_DATE"])
    df_results["GAME_DATE"] = pd.to_datetime(df_results["GAME_DATE"])

    # Merge V1 features with results to get targets
    df_results_subset = df_results[["GAME_ID", "HOME_SCORE", "AWAY_SCORE"]].rename(
        columns={"HOME_SCORE": "HOME_PTS", "AWAY_SCORE": "AWAY_PTS"}
    )
    merged = df_home_feats.merge(df_results_subset, on="GAME_ID", how="inner")
    merged["POINT_DIFF"] = merged["HOME_PTS"] - merged["AWAY_PTS"]
    merged["TOTAL_POINTS"] = merged["HOME_PTS"] + merged["AWAY_PTS"]
    print("Merged with targets. Matchups shape:", merged.shape)

    new_features = []
    print("Aggregating player features for each matchup (leakage-free)...")
    for idx, row in merged.iterrows():
        home_team = row["TEAM_ABBREVIATION"]
        away_team = row["OPPONENT_ABBREVIATION"]
        game_date_str = row["GAME_DATE"].strftime("%Y-%m-%d")

        try:
            p_feats = compute_player_features_for_inference(home_team, away_team, game_date_str, season=season)
        except Exception as e:
            print(f"Warning: failed for index {idx} ({home_team} vs {away_team} @ {game_date_str}): {e}")
            p_feats = {}

        new_features.append(p_feats)

        if (idx + 1) % 200 == 0:
            print(f"Processed {idx + 1} / {len(merged)} matchups...")

    df_new_feats = pd.DataFrame(new_features)
    final_df = pd.concat([merged.reset_index(drop=True), df_new_feats], axis=1)

    # Save the processed dataset
    os.makedirs(output_path.parent, exist_ok=True)
    final_df["GAME_DATE"] = final_df["GAME_DATE"].dt.strftime("%Y-%m-%d")
    final_df.to_csv(output_path, index=False)
    print(f"Saved enhanced dataset to {output_path} (Shape: {final_df.shape})")

def main():
    parser = argparse.ArgumentParser(description="Player feature engineering for score model dataset")
    parser.add_argument("--season", type=str, default=None, help="Season string (e.g. 2024-25)")
    parser.add_argument("--output-scope", type=str, default="production", help="Output scope (production or experimental)")
    args = parser.parse_args()
    build_player_features_dataset(season=args.season, output_scope=args.output_scope)

if __name__ == "__main__":
    main()
