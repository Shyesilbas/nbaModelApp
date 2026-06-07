# 2024-25 GAME_ID Alignment Report

## Sources
- raw_team_games: `/Users/serhat/agProjects/nbaModelApp/data/raw/team_games/nba_team_games_2024_25_regular_and_playoffs.csv`
- raw_player_games: `/Users/serhat/agProjects/nbaModelApp/data/raw/player_games/nba_player_games_2024_25_regular_and_playoffs.csv`
- raw_team_boxscores: `/Users/serhat/agProjects/nbaModelApp/data/raw/boxscores/team/nba_team_boxscores_2024_25.csv`
- raw_player_boxscores: `/Users/serhat/agProjects/nbaModelApp/data/raw/boxscores/player/nba_player_boxscores_2024_25.csv`
- team_features: `/Users/serhat/agProjects/nbaModelApp/data/experimental/team_games_features_2024_25.csv`
- player_features: `/Users/serhat/agProjects/nbaModelApp/data/experimental/player_games_features_2024_25.csv`
- game_results: `/Users/serhat/agProjects/nbaModelApp/data/experimental/game_results_2024_25.csv`

## Set Sizes
- raw_team_games: 1,320 unique GAME_IDs
- raw_player_games: 1,320 unique GAME_IDs
- raw_team_boxscores: 1,320 unique GAME_IDs
- raw_player_boxscores: 1,320 unique GAME_IDs
- team_features: 1,318 unique GAME_IDs
- player_features: 1,318 unique GAME_IDs
- game_results: 1,320 unique GAME_IDs

## Intersections
- Intersection(features, game_results): 0
- Intersection(boxscores, game_results): 1,320
- Intersection(raw games, game_results): 1,320

## Mismatch Samples (up to 10)
### Present in features but missing in game_results
Count: 1,318
Sample: ['22500001', '22500002', '22500003', '22500004', '22500005', '22500006', '22500007', '22500008', '22500009', '22500010']

### Present in game_results but missing in features
Count: 1,320
Sample: ['22400001', '22400002', '22400003', '22400004', '22400005', '22400006', '22400007', '22400008', '22400009', '22400010']

## Verdict
- Alignment OK: NO