
import pandas as pd

df = pd.read_csv('/Users/serhat/agProjects/nbaModelApp/data/experimental/team_win_model_ready_v2_2024_25.csv')
game_id_counts = df['GAME_ID'].value_counts()
print(game_id_counts)
print(f"Total rows: {len(df)}")
print(f"Unique GAME_IDs: {len(game_id_counts)}")
print(f"Rows per GAME_ID distribution:\n{game_id_counts.describe()}")
