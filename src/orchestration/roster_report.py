import os


def run_roster_analysis_report(season, paths) -> None:
    from src.analysis.roster_analysis import run_roster_analysis
    player_csv = paths.player_games_raw
    season_data_dir = os.path.join("data", f"season={season}", "analysis")
    season_output_dir = os.path.join("reports", "operations", f"season={season}")
    roster_df, core_players_df, star_candidates_df, multi_team_players_df, player_name_lookup_df = run_roster_analysis(
        player_csv,
        data_dir=season_data_dir,
        output_dir=season_output_dir
    )
    
    print("\n============================================================")
    print("📊 ROSTER ANALYSIS DATASETS GENERATED SUCCESSFULLY 📊")
    print("============================================================\n")
    
    # Shapes & Storage locations
    print("1. TEAM ROSTERS:")
    print(f"   - CSV Path:     {os.path.join(season_data_dir, 'team_rosters.csv')}")
    print(f"   - Shape:        {roster_df.shape}")
    print("   - Sample Rows:")
    print(roster_df.head(3).to_string(index=False))
    print("\n" + "-"*60 + "\n")
    
    print("2. CORE PLAYERS:")
    print(f"   - CSV Path:     {os.path.join(season_data_dir, 'core_players.csv')}")
    print(f"   - Shape:        {core_players_df.shape}")
    print("   - Sample Rows:")
    print(core_players_df.head(3).to_string(index=False))
    print("\n" + "-"*60 + "\n")
    
    print("3. LEAGUE-WIDE STAR CANDIDATES:")
    print(f"   - CSV Path:     {os.path.join(season_data_dir, 'star_candidates.csv')}")
    print(f"   - Shape:        {star_candidates_df.shape}")
    print("   - Sample (Top 3):")
    print(star_candidates_df.head(3).to_string(index=False))
    print("\n" + "-"*60 + "\n")
    
    print("4. MULTI-TEAM PLAYERS:")
    print(f"   - CSV Path:     {os.path.join(season_data_dir, 'multi_team_players.csv')}")
    print(f"   - Shape:        {multi_team_players_df.shape}")
    print("   - Sample Rows:")
    print(multi_team_players_df.head(3).to_string(index=False))
    print("\n" + "-"*60 + "\n")
    
    print("5. NAME NORMALIZATION LOOKUP:")
    print(f"   - CSV Path:     {os.path.join(season_data_dir, 'player_name_lookup.csv')}")
    print(f"   - Shape:        {player_name_lookup_df.shape}")
    print("   - Sample Rows (with Accent Characters):")
    accented_samples = player_name_lookup_df[
        player_name_lookup_df["RAW_PLAYER_NAME"].str.contains("ć|ć|ž|š|č|č|ö|ä|í|ņ|ģ|ł", case=False, regex=True)
    ].head(5)
    if not accented_samples.empty:
        print(accented_samples.to_string(index=False))
    else:
        print(player_name_lookup_df.head(5).to_string(index=False))
    print("\n" + "-"*60 + "\n")
    
    # Check for duplicate PLAYER_ID issues in player_name_lookup
    print("🔍 INTEGRITY CHECKS:")
    dup_ids = player_name_lookup_df[player_name_lookup_df.duplicated(subset=["PLAYER_ID"])]
    if len(dup_ids) > 0:
        print(f"❌ Warning: Found duplicate PLAYER_ID values in name lookup! count={len(dup_ids)}")
        print(dup_ids.head(5))
    else:
        print("✅ Success: No duplicate PLAYER_ID issues detected in name lookup.")
        
    # Check for name normalization conflicts: 
    # Same normalized name mapping to different PLAYER_IDs (which can be normal for different players, but useful to report)
    dup_normalized = player_name_lookup_df[player_name_lookup_df.duplicated(subset=["NORMALIZED_PLAYER_NAME"], keep=False)]
    if len(dup_normalized) > 0:
        print(f"ℹ️ Info: Detected {dup_normalized['NORMALIZED_PLAYER_NAME'].nunique()} normalized names sharing multiple PLAYER_IDs:")
        # Display grouping
        for name, group in dup_normalized.groupby("NORMALIZED_PLAYER_NAME"):
            ids_str = ", ".join(group["PLAYER_ID"].astype(str).tolist())
            raw_names_str = ", ".join(group["RAW_PLAYER_NAME"].tolist())
            print(f"   - '{name}': IDs [{ids_str}] -> Raw names: [{raw_names_str}]")
    else:
        print("✅ Success: No name normalization conflicts found (all normalized names map to unique PLAYER_IDs).")
        
    print("====================================================\n")
