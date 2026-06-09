# Leakage Audit


## data/experimental/team_score_model_ready_v2_2024_25.csv
- **Present Leakage Cols**: {'STL', 'FTM', 'FGM', 'POINT_DIFF', 'FGA', 'FT_PCT', 'PTS', 'HOME_PTS', 'PF', 'AWAY_PTS', 'OREB', 'FTA', 'MIN', 'FG_PCT', 'BLK', 'FG3_PCT', 'AST', 'TOV', 'PLUS_MINUS', 'PTS_ALLOWED', 'DREB', 'TOTAL_POINTS', 'FG3A', 'REB', 'FG3M', 'WL'}
- **Used Leakage Cols**: set()
- **Excluded Leakage Cols**: {'FG3_PCT', 'AST', 'STL', 'FG3M', 'FTM', 'FGM', 'POINT_DIFF', 'TOV', 'PLUS_MINUS', 'FGA', 'FT_PCT', 'PTS', 'HOME_PTS', 'PTS_ALLOWED', 'DREB', 'PF', 'AWAY_PTS', 'OREB', 'TOTAL_POINTS', 'FTA', 'FG3A', 'REB', 'MIN', 'FG_PCT', 'BLK', 'WL'}
- **Verdict**: LEAKAGE PRESENT BUT EXCLUDED

## data/experimental/team_score_model_ready_v3_ema_experimental.csv
- **Present Leakage Cols**: {'TOTAL_POINTS', 'HOME_PTS', 'POINT_DIFF', 'AWAY_PTS'}
- **Used Leakage Cols**: set()
- **Excluded Leakage Cols**: {'TOTAL_POINTS', 'HOME_PTS', 'POINT_DIFF', 'AWAY_PTS'}
- **Verdict**: LEAKAGE PRESENT BUT EXCLUDED

## data/experimental/team_win_model_ready_v2_2024_25.csv
- **Present Leakage Cols**: {'STL', 'FTM', 'FGM', 'FGA', 'FT_PCT', 'PTS', 'PF', 'OREB', 'FTA', 'MIN', 'FG_PCT', 'BLK', 'FG3_PCT', 'AST', 'TOV', 'PLUS_MINUS', 'PTS_ALLOWED', 'DREB', 'FG3A', 'REB', 'FG3M', 'WL'}
- **Used Leakage Cols**: set()
- **Excluded Leakage Cols**: {'FG3_PCT', 'AST', 'STL', 'FG3M', 'FTM', 'FGM', 'TOV', 'PLUS_MINUS', 'FGA', 'FT_PCT', 'PTS', 'PTS_ALLOWED', 'DREB', 'PF', 'OREB', 'FTA', 'FG3A', 'REB', 'MIN', 'FG_PCT', 'BLK', 'WL'}
- **Verdict**: LEAKAGE PRESENT BUT EXCLUDED

## data/experimental/team_win_model_ready_v2_2024_25_clean.csv
- **Present Leakage Cols**: {'PTS_ALLOWED'}
- **Used Leakage Cols**: set()
- **Excluded Leakage Cols**: {'PTS_ALLOWED'}
- **Verdict**: LEAKAGE PRESENT BUT EXCLUDED

## data/experimental/team_win_model_ready_v3_ema_experimental.csv
- **Present Leakage Cols**: set()
- **Used Leakage Cols**: set()
- **Excluded Leakage Cols**: set()
- **Verdict**: LEAKAGE SAFE

## data/processed/team_score_model_ready_v2_player_features.csv
- **Present Leakage Cols**: {'TOTAL_POINTS', 'HOME_PTS', 'POINT_DIFF', 'AWAY_PTS'}
- **Used Leakage Cols**: set()
- **Excluded Leakage Cols**: {'TOTAL_POINTS', 'HOME_PTS', 'POINT_DIFF', 'AWAY_PTS'}
- **Verdict**: LEAKAGE PRESENT BUT EXCLUDED

## data/processed/team_score_model_ready_v3_ema_experimental.csv
- **Present Leakage Cols**: {'TOTAL_POINTS', 'HOME_PTS', 'POINT_DIFF', 'AWAY_PTS'}
- **Used Leakage Cols**: set()
- **Excluded Leakage Cols**: {'TOTAL_POINTS', 'HOME_PTS', 'POINT_DIFF', 'AWAY_PTS'}
- **Verdict**: LEAKAGE PRESENT BUT EXCLUDED

## data/processed/team_win_model_ready_v2_player_features.csv
- **Present Leakage Cols**: set()
- **Used Leakage Cols**: set()
- **Excluded Leakage Cols**: set()
- **Verdict**: LEAKAGE SAFE

## data/processed/team_win_model_ready_v3_ema_experimental.csv
- **Present Leakage Cols**: set()
- **Used Leakage Cols**: set()
- **Excluded Leakage Cols**: set()
- **Verdict**: LEAKAGE SAFE

## data/production/team_score_model_ready_v2_player_features.csv
- **Present Leakage Cols**: {'TOTAL_POINTS', 'HOME_PTS', 'POINT_DIFF', 'AWAY_PTS'}
- **Used Leakage Cols**: set()
- **Excluded Leakage Cols**: {'TOTAL_POINTS', 'HOME_PTS', 'POINT_DIFF', 'AWAY_PTS'}
- **Verdict**: LEAKAGE PRESENT BUT EXCLUDED

## data/production/team_win_model_ready_v2_player_features.csv
- **Present Leakage Cols**: set()
- **Used Leakage Cols**: set()
- **Excluded Leakage Cols**: set()
- **Verdict**: LEAKAGE SAFE
