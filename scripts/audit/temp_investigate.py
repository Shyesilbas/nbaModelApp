
import pandas as pd
import os

df = pd.read_csv('data/experimental/team_win_model_ready_v2_2024_25.csv')

print(f"Total rows: {len(df)}")
print(f"Unique GAME_ID: {df['GAME_ID'].nunique()}")

# Analyze GAME_ID prefixes
df['GAME_ID_STR'] = df['GAME_ID'].astype(str).str.zfill(10)
df['PREFIX'] = df['GAME_ID_STR'].str[:3]

print("\nGAME_ID Prefix Distribution:")
prefix_dist = df.groupby('PREFIX')['GAME_ID'].nunique()
print(prefix_dist)

print("\nSEASON_TYPE Distribution:")
season_type_dist = df.groupby('SEASON_TYPE')['GAME_ID'].nunique()
print(season_type_dist)

# Cross tabulation
print("\nPrefix vs SEASON_TYPE:")
print(pd.crosstab(df['PREFIX'], df['SEASON_TYPE']))

# List all columns to help with leakage identification
print("\nColumns:")
print(df.columns.tolist())
