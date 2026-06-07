# Pipeline Dependency Graph

This document visualizes the dataset and script dependency chains of the NBA prediction project.

---

## 1. Dependency Graph (Mermaid Flowchart)

```mermaid
graph TD
    %% Scrapers & Raw Files
    nba_api[NBA Stats API] -->|main.py --update-data| raw_team_games[data/raw/team_games/nba_team_games_2025_26_regular_and_playoffs.csv]
    nba_api -->|main.py --update-data| raw_player_games[data/raw/player_games/nba_player_games_2025_26_regular_and_playoffs.csv]
    nba_api -->|main.py --update-data| raw_schedule[data/raw/schedule/nba_schedule_2025_26.csv]
    nba_api -->|main.py --update-data| raw_team_box[data/raw/boxscores/team/nba_team_boxscores_2025_26.csv]
    nba_api -->|main.py --update-data| raw_player_box[data/raw/boxscores/player/nba_player_boxscores_2025_26.csv]

    %% Feature Building Scripts
    raw_team_games -->|src/features/team_features.py| team_feats[data/features/team_games_features_2025_26.csv]
    raw_player_games -->|src/features/player_features.py| player_feats[data/features/player_games_features_2025_26.csv]

    %% Game Results Pivot
    raw_team_box -->|src/ingestion/boxscore_service.py| game_results[data/processed/game_results_2025_26.csv]
    raw_schedule -->|src/ingestion/schedule_loader.py| schedule_combined[data/processed/schedule_combined_2025_26.csv]
    game_results -->|src/ingestion/schedule_loader.py| schedule_combined

    %% Opponent Merge
    team_feats -->|src/features/opponent_features.py| team_feats_opp[Joined Symmetrical Team Features]

    %% Final Model Datasets
    team_feats_opp -->|scripts/train_win_probability_v2.py| win_v2_dataset[data/production/team_win_model_ready_v2_player_features.csv]
    player_feats -->|scripts/train_win_probability_v2.py| win_v2_dataset
    core_players[data/production/core_players.csv] -->|scripts/train_win_probability_v2.py| win_v2_dataset

    team_feats_opp -->|scripts/prepare_score_model.py| score_v2_dataset[data/production/team_score_model_ready_v2_player_features.csv]
    player_feats -->|scripts/prepare_score_model.py| score_v2_dataset
    core_players -->|scripts/prepare_score_model.py| score_v2_dataset

    %% Model Training
    win_v2_dataset -->|scripts/train_win_probability_v2.py| win_model_pkl[models/production/win_probability_model.pkl]
    score_v2_dataset -->|scripts/prepare_score_model.py| score_model_pkl[models/production/home_score_model_v2.pkl / away_score_model_v2.pkl]

    %% Frontend Assets
    schedule_combined -->|scripts/export_frontend_data.py| frontend_schedule_json[frontend/public/data/schedule.json]
    game_results -->|scripts/export_frontend_data.py| frontend_results_json[frontend/public/data/game_results.json]
```

---

## 2. Dependency Chains

### 2.1 Win Probability Model V2 Chain
1.  `nba_api` ➡️ [main.py --update-data](file:///Users/serhat/agProjects/nbaModelApp/main.py)
2.  ➡️ [nba_team_games_2025_26_regular_and_playoffs.csv](file:///Users/serhat/agProjects/nbaModelApp/data/raw/team_games/nba_team_games_2025_26_regular_and_playoffs.csv)
3.  ➡️ [team_features.py](file:///Users/serhat/agProjects/nbaModelApp/src/features/team_features.py)
4.  ➡️ [team_games_features_2025_26.csv](file:///Users/serhat/agProjects/nbaModelApp/data/features/team_games_features_2025_26.csv)
5.  ➡️ [opponent_features.py](file:///Users/serhat/agProjects/nbaModelApp/src/features/opponent_features.py)
6.  ➡️ Joined Symmetrical Team Features
7.  ➡️ [train_win_probability_v2.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/train_win_probability_v2.py) (combining [player_games_features_2025_26.csv](file:///Users/serhat/agProjects/nbaModelApp/data/features/player_games_features_2025_26.csv) and [core_players.csv](file:///Users/serhat/agProjects/nbaModelApp/data/production/core_players.csv))
8.  ➡️ [team_win_model_ready_v2_player_features.csv](file:///Users/serhat/agProjects/nbaModelApp/data/production/team_win_model_ready_v2_player_features.csv)
9.  ➡️ [train_win_probability_v2.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/train_win_probability_v2.py)
10. ➡️ [win_probability_model.pkl](file:///Users/serhat/agProjects/nbaModelApp/models/production/win_probability_model.pkl)

### 2.2 Score Prediction Model V2 Chain
1.  `nba_api` ➡️ [main.py --update-data](file:///Users/serhat/agProjects/nbaModelApp/main.py)
2.  ➡️ [nba_player_games_2025_26_regular_and_playoffs.csv](file:///Users/serhat/agProjects/nbaModelApp/data/raw/player_games/nba_player_games_2025_26_regular_and_playoffs.csv)
3.  ➡️ [player_features.py](file:///Users/serhat/agProjects/nbaModelApp/src/features/player_features.py)
4.  ➡️ [player_games_features_2025_26.csv](file:///Users/serhat/agProjects/nbaModelApp/data/features/player_games_features_2025_26.csv)
5.  ➡️ [prepare_score_model.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/prepare_score_model.py) (combining Opponent-aware Team Features and Roster data)
6.  ➡️ [team_score_model_ready_v2_player_features.csv](file:///Users/serhat/agProjects/nbaModelApp/data/production/team_score_model_ready_v2_player_features.csv)
7.  ➡️ [prepare_score_model.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/prepare_score_model.py)
8.  ➡️ [home_score_model_v2.pkl](file:///Users/serhat/agProjects/nbaModelApp/models/production/home_score_model_v2.pkl) and [away_score_model_v2.pkl](file:///Users/serhat/agProjects/nbaModelApp/models/production/away_score_model_v2.pkl)
