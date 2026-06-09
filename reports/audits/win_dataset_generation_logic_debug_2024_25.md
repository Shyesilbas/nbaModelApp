# Win Dataset Generation Logic Debug 2024-25

- **Player-Level Rows**: The investigation found no evidence of player-level rows being introduced into the `team_win_model_ready_v2_2024_25.csv` output. The `compute_player_features_for_inference` function correctly returns aggregated features, not raw player rows. The initial bug report seems to have been mistaken on this point.

- **Join Aggregation**: The script uses `pd.concat` on `axis=1` to add the aggregated player features, which is appropriate given that the features are computed row-by-row from the input team-game data. No change is needed here.

- **Production Dataset Comparison**: The 2025-26 production win dataset is generated from `team_model_ready_v2`, which is a pre-filtered and cleaned dataset. The 2024-25 experimental dataset was being generated from the raw `team_games_features_2024_25.csv`, which was the source of the discrepancy.

- **Expected Production Contract**: The production contract expects a team-game level dataset with one row per team per game, including only regular season games. The experimental dataset was violating this by including other game types.

- **Conclusion**: The root cause of the validation failure is that the input data for the 2024-25 experimental win dataset was not filtered to include only regular season games, leading to an incorrect row count. The fix is to add a filter for `SEASON_TYPE == 'Regular Season'` in `scripts/train_win_probability_v2.py`.
