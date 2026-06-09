import pandas as pd
import json

exp_file = "data/experimental/team_win_model_ready_v2_2024_25.csv"
prod_file = "data/production/team_win_model_ready_v2_player_features.csv"

# Load the experimental dataset
df_exp = pd.read_csv(exp_file, low_memory=False)

print("1. Exact row count:", len(df_exp))
print("2. Exact unique GAME_ID count:", df_exp['GAME_ID'].nunique() if 'GAME_ID' in df_exp.columns else "GAME_ID missing")

if 'GAME_ID' in df_exp.columns:
    print("\n3. Rows per GAME_ID distribution:")
    print(df_exp['GAME_ID'].value_counts().value_counts().sort_index())

print("\n4. Does PLAYER_ID exist?", 'PLAYER_ID' in df_exp.columns)
print("5. Does PLAYER_NAME exist?", 'PLAYER_NAME' in df_exp.columns)

if 'PLAYER_ID' in df_exp.columns:
    print("6. How many distinct PLAYER_ID values exist?", df_exp['PLAYER_ID'].nunique())
else:
    print("6. How many distinct PLAYER_ID values exist? N/A")

cols = df_exp.columns.tolist()
print("\n7. First 30 column names:")
for c in cols[:30]: print(" -", c)

print("\n8. Last 30 column names:")
for c in cols[-30:]: print(" -", c)

print("\n9. Columns containing PLAYER, CORE, EXPECTED, PRA:")
for c in cols:
    if any(k in c.upper() for k in ['PLAYER', 'CORE', 'EXPECTED', 'PRA']):
        print(" -", c)

print("\n11. Schema comparison against production:")
df_prod = pd.read_csv(prod_file, nrows=0) # Just need columns
prod_cols = df_prod.columns.tolist()

exp_set = set(cols)
prod_set = set(prod_cols)

missing_exp = sorted(list(prod_set - exp_set))
missing_prod = sorted(list(exp_set - prod_set))
common = sorted(list(exp_set & prod_set))

print("columns missing from experimental:")
print("Count:", len(missing_exp))
for c in missing_exp:
    print(" -", c)

print("\ncolumns missing from production:")
print("Count:", len(missing_prod))
for c in missing_prod:
    print(" -", c)

print("\ncolumns common to both:")
print("Count:", len(common))
for c in common:
    print(" -", c)

