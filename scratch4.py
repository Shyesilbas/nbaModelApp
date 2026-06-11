import pandas as pd
from src.processing.cleaning import normalize_game_matchups
df = pd.DataFrame({
    'GAME_ID': ['1'],
    'TEAM_ABBREVIATION': ['DAL'],
    'MATCHUP': ['DAL @ DET']
})
print("Before:")
print(df.columns)
df_new = normalize_game_matchups(df)
print("After:")
print(df_new.columns)
