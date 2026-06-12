import pandas as pd
from src.processing.cleaning import normalize_game_matchups
df = pd.DataFrame(columns=['GAME_ID', 'TEAM_ABBREVIATION', 'MATCHUP'])
print("Before:")
print(df.columns)
df_new = normalize_game_matchups(df)
print("After:")
print(df_new.columns)
