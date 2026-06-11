import os
import pandas as pd
import numpy as np
import unicodedata
from typing import Tuple
from src.processing.cleaning import clean_minutes_column
from scripts.season_utils import get_default_season

def normalize_player_name(name: str) -> str:
    """
    Decomposes accented/diacritic characters, drops combining marks,
    and converts to lowercase.
    e.g., "Luka Dončić" -> "luka doncic"
    """
    if not isinstance(name, str):
        return ""
    # Normalize unicode to NFKD form to split accents from characters
    nfkd_form = unicodedata.normalize('NFKD', name)
    # Encode as ascii ignoring non-ascii characters (accents), then decode back
    only_ascii = nfkd_form.encode('ASCII', 'ignore').decode('ASCII')
    # Convert to lowercase and strip whitespace
    return only_ascii.strip().lower()

def _df_to_markdown_simple(df: pd.DataFrame) -> str:
    """Helper to convert a pandas DataFrame to a markdown table string without tabulate."""
    headers = list(df.columns)
    header_str = "| " + " | ".join(headers) + " |\n"
    sep_str = "| " + " | ".join(["---"] * len(headers)) + " |\n"
    row_strs = []
    for _, row in df.iterrows():
        row_str = "| " + " | ".join(str(val) for val in row) + " |\n"
        row_strs.append(row_str)
    return header_str + sep_str + "".join(row_strs)

def run_roster_analysis(
    player_games_path: str = None,
    output_dir: str = "outputs/analysis",
    data_dir: str = "data/analysis"
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Runs the complete NBA roster discovery, core player detection, and star ranking analysis.
    Saves CSV and Parquet structured datasets under data_dir.
    Generates three markdown reports in output_dir.
    
    Returns:
        Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
            - roster_df
            - core_players_df
            - star_candidates_df
            - multi_team_players_df
            - player_name_lookup_df
    """
    print("============================================================")
    print("🏀 RUNNING NBA ROSTER DISCOVERY & IMPORTANCE PIPELINE 🏀")
    print("============================================================\n")
    
    # Load player logs
    if player_games_path is None:
        from scripts.data_paths import get_data_paths

        player_games_path = get_data_paths(get_default_season()).player_games_raw
    if not os.path.exists(player_games_path):
        raise FileNotFoundError(f"Player games dataset not found at: {player_games_path}")
        
    print(f"Loading player game logs from: {player_games_path}")
    df_player = pd.read_csv(player_games_path)
    
    # Clean minutes column (convert MM:SS or numeric to float)
    df_player = clean_minutes_column(df_player, "MIN")
    
    # Ensure numeric columns are cast correctly
    num_cols = ["PTS", "REB", "AST", "MIN"]
    for col in num_cols:
        df_player[col] = pd.to_numeric(df_player[col], errors="coerce").fillna(0)
        
    # Extract Team Abbreviation from first token of MATCHUP
    df_player["TEAM_ABBREVIATION"] = df_player["MATCHUP"].str.split().str[0]
    
    # ------------------------------------------------------------
    # 1. Team Roster Discovery Aggregation
    # ------------------------------------------------------------
    df_roster_agg = df_player.groupby(["TEAM_ABBREVIATION", "Player_ID", "PLAYER_NAME"]).agg(
        GP=("GAME_DATE", "count"),
        TOTAL_MIN=("MIN", "sum"),
        AVG_MIN=("MIN", "mean"),
        AVG_PTS=("PTS", "mean"),
        AVG_REB=("REB", "mean"),
        AVG_AST=("AST", "mean")
    ).reset_index()
    
    # Rename Player_ID to PLAYER_ID
    df_roster_agg = df_roster_agg.rename(columns={"Player_ID": "PLAYER_ID"})
    
    # Compute Importance Score
    df_roster_agg["IMPORTANCE_SCORE"] = (
        (df_roster_agg["AVG_MIN"] * 0.5) + 
        (df_roster_agg["AVG_PTS"] * 1.0) + 
        (df_roster_agg["AVG_AST"] * 0.8) + 
        (df_roster_agg["AVG_REB"] * 0.6)
    )
    
    # Sort for final output
    roster_df = df_roster_agg.sort_values(by=["TEAM_ABBREVIATION", "AVG_MIN"], ascending=[True, False]).reset_index(drop=True)
    
    # ------------------------------------------------------------
    # 2. Core Players Detection
    # ------------------------------------------------------------
    df_core = df_roster_agg.copy()
    # Rank players within their team by IMPORTANCE_SCORE descending
    df_core["CORE_RANK"] = df_core.groupby("TEAM_ABBREVIATION")["IMPORTANCE_SCORE"].rank(
        ascending=False, method="first"
    ).astype(int)
    
    df_core["IS_TOP3_CORE"] = df_core["CORE_RANK"] <= 3
    df_core["IS_TOP5_CORE"] = df_core["CORE_RANK"] <= 5
    
    core_players_df = df_core[[
        "TEAM_ABBREVIATION", "PLAYER_ID", "PLAYER_NAME", "IMPORTANCE_SCORE",
        "CORE_RANK", "IS_TOP3_CORE", "IS_TOP5_CORE"
    ]].sort_values(by=["TEAM_ABBREVIATION", "CORE_RANK"]).reset_index(drop=True)
    
    # ------------------------------------------------------------
    # 3. League-Wide Star Candidates
    # ------------------------------------------------------------
    df_league_agg = df_player.groupby(["Player_ID", "PLAYER_NAME"]).agg(
        GP=("GAME_DATE", "count"),
        TOTAL_MIN=("MIN", "sum"),
        AVG_MIN=("MIN", "mean"),
        AVG_PTS=("PTS", "mean"),
        AVG_REB=("REB", "mean"),
        AVG_AST=("AST", "mean")
    ).reset_index().rename(columns={"Player_ID": "PLAYER_ID"})
    
    df_league_agg["IMPORTANCE_SCORE"] = (
        (df_league_agg["AVG_MIN"] * 0.5) + 
        (df_league_agg["AVG_PTS"] * 1.0) + 
        (df_league_agg["AVG_AST"] * 0.8) + 
        (df_league_agg["AVG_REB"] * 0.6)
    )
    
    # Construct player teams played map
    player_teams_map = df_player.groupby("Player_ID")["TEAM_ABBREVIATION"].unique().apply(
        lambda teams: ", ".join(sorted(teams))
    ).to_dict()
    
    df_league_agg["TEAMS_PLAYED_FOR"] = df_league_agg["PLAYER_ID"].map(player_teams_map)
    
    # Rank league-wide
    df_league_agg["LEAGUE_RANK"] = df_league_agg["IMPORTANCE_SCORE"].rank(
        ascending=False, method="first"
    ).astype(int)
    
    star_candidates_df = df_league_agg[[
        "PLAYER_ID", "PLAYER_NAME", "TEAMS_PLAYED_FOR", "GP",
        "AVG_MIN", "AVG_PTS", "AVG_REB", "AVG_AST", "IMPORTANCE_SCORE", "LEAGUE_RANK"
    ]].sort_values(by="LEAGUE_RANK").reset_index(drop=True)
    
    # ------------------------------------------------------------
    # 4. Multi-Team Players Detection
    # ------------------------------------------------------------
    df_multi_team_agg = df_player.groupby(["Player_ID", "PLAYER_NAME"])["TEAM_ABBREVIATION"].nunique().reset_index(name="TEAM_COUNT").rename(columns={"Player_ID": "PLAYER_ID"})
    df_multi_team_filtered = df_multi_team_agg[df_multi_team_agg["TEAM_COUNT"] > 1].copy()
    df_multi_team_filtered["TEAMS_PLAYED_FOR"] = df_multi_team_filtered["PLAYER_ID"].map(player_teams_map)
    
    multi_team_players_df = df_multi_team_filtered[[
        "PLAYER_ID", "PLAYER_NAME", "TEAM_COUNT", "TEAMS_PLAYED_FOR"
    ]].sort_values(by="TEAM_COUNT", ascending=False).reset_index(drop=True)
    
    # ------------------------------------------------------------
    # 5. Name Normalization Table
    # ------------------------------------------------------------
    df_name_lookup_agg = df_player[["Player_ID", "PLAYER_NAME"]].drop_duplicates(subset=["Player_ID"]).copy()
    df_name_lookup_agg = df_name_lookup_agg.rename(columns={"Player_ID": "PLAYER_ID", "PLAYER_NAME": "RAW_PLAYER_NAME"})
    df_name_lookup_agg["NORMALIZED_PLAYER_NAME"] = df_name_lookup_agg["RAW_PLAYER_NAME"].apply(normalize_player_name)
    
    player_name_lookup_df = df_name_lookup_agg[[
        "PLAYER_ID", "RAW_PLAYER_NAME", "NORMALIZED_PLAYER_NAME"
    ]].sort_values(by="PLAYER_ID").reset_index(drop=True)
    
    # ------------------------------------------------------------
    # 6. Save Structured Output Datasets (CSV & Parquet)
    # ------------------------------------------------------------
    os.makedirs(data_dir, exist_ok=True)
    
    # Roster
    roster_df.to_csv(os.path.join(data_dir, "team_rosters.csv"), index=False)
    roster_df.to_parquet(os.path.join(data_dir, "team_rosters.parquet"), index=False, engine="pyarrow")
    
    # Core Players
    core_players_df.to_csv(os.path.join(data_dir, "core_players.csv"), index=False)
    core_players_df.to_parquet(os.path.join(data_dir, "core_players.parquet"), index=False, engine="pyarrow")
    
    # Star Candidates
    star_candidates_df.to_csv(os.path.join(data_dir, "star_candidates.csv"), index=False)
    star_candidates_df.to_parquet(os.path.join(data_dir, "star_candidates.parquet"), index=False, engine="pyarrow")
    
    # Multi-Team Players
    multi_team_players_df.to_csv(os.path.join(data_dir, "multi_team_players.csv"), index=False)
    multi_team_players_df.to_parquet(os.path.join(data_dir, "multi_team_players.parquet"), index=False, engine="pyarrow")
    
    # Name Lookup
    player_name_lookup_df.to_csv(os.path.join(data_dir, "player_name_lookup.csv"), index=False)
    player_name_lookup_df.to_parquet(os.path.join(data_dir, "player_name_lookup.parquet"), index=False, engine="pyarrow")
    
    print(f"Structured analysis datasets saved to: {data_dir}/")
    
    # ------------------------------------------------------------
    # 7. Generate Human-Readable Markdown Reports
    # ------------------------------------------------------------
    os.makedirs(output_dir, exist_ok=True)
    
    # Roster Report
    roster_report_path = os.path.join(output_dir, "team_roster_report.md")
    with open(roster_report_path, "w") as f:
        f.write(f"# NBA Team Rosters & Performance Discovery Report ({get_default_season()})\n\n")
        f.write("This report lists all players that appeared for each team, sorted by average minutes played.\n\n")
        
        sorted_teams = sorted(roster_df["TEAM_ABBREVIATION"].unique())
        for team in sorted_teams:
            f.write(f"## {team}\n\n")
            df_team = roster_df[roster_df["TEAM_ABBREVIATION"] == team].copy()
            df_team = df_team.sort_values(by="AVG_MIN", ascending=False).reset_index(drop=True)
            
            df_team_report = pd.DataFrame()
            df_team_report["Player Name"] = df_team["PLAYER_NAME"]
            df_team_report["GP"] = df_team["GP"]
            df_team_report["AVG MIN"] = df_team["AVG_MIN"].round(2)
            df_team_report["AVG PTS"] = df_team["AVG_PTS"].round(2)
            df_team_report["AVG REB"] = df_team["AVG_REB"].round(2)
            df_team_report["AVG AST"] = df_team["AVG_AST"].round(2)
            
            f.write(_df_to_markdown_simple(df_team_report))
            f.write("\n\n")
            
    print(f"Roster discovery report saved to: {roster_report_path}")
    
    # Core Player Report
    core_report_path = os.path.join(output_dir, "core_player_report.md")
    with open(core_report_path, "w") as f:
        f.write(f"# NBA Team Core & Secondary Player Discovery Report ({get_default_season()})\n\n")
        f.write("This report categorizes players for each team based on an automated Importance Score:\n")
        f.write("$$\\text{Importance Score} = (\\text{AVG\\_MIN} \\times 0.5) + (\\text{AVG\\_PTS} \\times 1.0) + (\\text{AVG\\_AST} \\times 0.8) + (\\text{AVG\\_REB} \\times 0.6)$$\n\n")
        
        sorted_teams = sorted(roster_df["TEAM_ABBREVIATION"].unique())
        for team in sorted_teams:
            f.write(f"## {team}\n\n")
            df_team_core = core_players_df[core_players_df["TEAM_ABBREVIATION"] == team].copy()
            # Bring detailed stats from roster_df for presentation
            df_team_stats = roster_df[roster_df["TEAM_ABBREVIATION"] == team].copy()
            df_team_merged = df_team_core.merge(df_team_stats, on=["TEAM_ABBREVIATION", "PLAYER_ID", "PLAYER_NAME"])
            df_team_merged = df_team_merged.sort_values(by="CORE_RANK").reset_index(drop=True)
            
            # Top 3 are Core
            f.write("### Core Players (Top 3)\n")
            core_players = df_team_merged[df_team_merged["CORE_RANK"] <= 3]
            for idx, row in core_players.iterrows():
                f.write(
                    f"{idx+1}. **{row['PLAYER_NAME']}** (Importance Score: {row['IMPORTANCE_SCORE_x']:.2f} | "
                    f"PTS: {row['AVG_PTS']:.1f}, REB: {row['AVG_REB']:.1f}, AST: {row['AVG_AST']:.1f}, MIN: {row['AVG_MIN']:.1f})\n"
                )
            f.write("\n")
            
            # Top 4-5 are Secondary
            f.write("### Secondary Players (Top 4-5)\n")
            secondary_players = df_team_merged[(df_team_merged["CORE_RANK"] > 3) & (df_team_merged["CORE_RANK"] <= 5)]
            for idx, row in secondary_players.iterrows():
                f.write(
                    f"{idx+1}. **{row['PLAYER_NAME']}** (Importance Score: {row['IMPORTANCE_SCORE_x']:.2f} | "
                    f"PTS: {row['AVG_PTS']:.1f}, REB: {row['AVG_REB']:.1f}, AST: {row['AVG_AST']:.1f}, MIN: {row['AVG_MIN']:.1f})\n"
                )
            f.write("\n---\n\n")
            
    print(f"Core player report saved to: {core_report_path}")
    
    # Star Player Candidates Report (Top 50)
    star_report_path = os.path.join(output_dir, "star_player_candidates.md")
    with open(star_report_path, "w") as f:
        f.write("# NBA League-Wide Star Player Candidates (Top 50)\n\n")
        f.write("This report lists the Top 50 players across the league, ranked by their data-driven Importance Score.\n\n")
        
        df_top_50 = star_candidates_df.head(50).copy()
        
        df_stars_table = pd.DataFrame()
        df_stars_table["Rank"] = df_top_50["LEAGUE_RANK"]
        df_stars_table["Player Name"] = df_top_50["PLAYER_NAME"]
        df_stars_table["Team(s)"] = df_top_50["TEAMS_PLAYED_FOR"]
        df_stars_table["GP"] = df_top_50["GP"]
        df_stars_table["Avg Min"] = df_top_50["AVG_MIN"].round(2)
        df_stars_table["Avg Pts"] = df_top_50["AVG_PTS"].round(2)
        df_stars_table["Avg Reb"] = df_top_50["AVG_REB"].round(2)
        df_stars_table["Avg Ast"] = df_top_50["AVG_AST"].round(2)
        df_stars_table["Importance Score"] = df_top_50["IMPORTANCE_SCORE"].round(2)
        
        f.write(_df_to_markdown_simple(df_stars_table))
        
    print(f"Star player candidates report saved to: {star_report_path}")
    print("\n============================================================")
    print("🎉 ROSTER DISCOVERY & PERFORMANCE ANALYSIS PIPELINE COMPLETE! 🎉")
    print("============================================================\n")
    
    return roster_df, core_players_df, star_candidates_df, multi_team_players_df, player_name_lookup_df

def get_core_players(df_player: pd.DataFrame) -> pd.DataFrame:
    """
    Computes player importance scores and returns the Top 5 core/secondary players
    for each team with CORE_RANK (1-5).
    
    Returns:
        pd.DataFrame with columns: TEAM_ABBREVIATION, PLAYER_NAME, Player_ID, IMPORTANCE_SCORE, CORE_RANK
    """
    df_player = df_player.copy()
    if "MIN" in df_player.columns and df_player["MIN"].dtype == object:
        df_player = clean_minutes_column(df_player, "MIN")
        
    num_cols = ["PTS", "REB", "AST", "MIN"]
    for col in num_cols:
        if col in df_player.columns:
            df_player[col] = pd.to_numeric(df_player[col], errors="coerce").fillna(0)
        
    if "TEAM_ABBREVIATION" not in df_player.columns and "MATCHUP" in df_player.columns:
        df_player["TEAM_ABBREVIATION"] = df_player["MATCHUP"].str.split().str[0]
        
    # Group by Team and Player to get averages
    df_roster_agg = df_player.groupby(["TEAM_ABBREVIATION", "PLAYER_NAME", "Player_ID"]).agg(
        AVG_MIN=("MIN", "mean"),
        AVG_PTS=("PTS", "mean"),
        AVG_REB=("REB", "mean"),
        AVG_AST=("AST", "mean")
    ).reset_index()
    
    # Compute Importance Score
    df_roster_agg["IMPORTANCE_SCORE"] = (
        (df_roster_agg["AVG_MIN"] * 0.5) + 
        (df_roster_agg["AVG_PTS"] * 1.0) + 
        (df_roster_agg["AVG_AST"] * 0.8) + 
        (df_roster_agg["AVG_REB"] * 0.6)
    )
    
    # Rank players per team and take top 5
    df_roster_agg["CORE_RANK"] = df_roster_agg.groupby("TEAM_ABBREVIATION")["IMPORTANCE_SCORE"].rank(
        ascending=False, method="first"
    ).astype(int)
    
    df_core = df_roster_agg[df_roster_agg["CORE_RANK"] <= 5].copy()
    return df_core[["TEAM_ABBREVIATION", "PLAYER_NAME", "Player_ID", "IMPORTANCE_SCORE", "CORE_RANK"]].sort_values(
        by=["TEAM_ABBREVIATION", "CORE_RANK"]
    ).reset_index(drop=True)
