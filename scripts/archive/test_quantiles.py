import pandas as pd
df1 = pd.read_csv("data/raw/boxscores/player/nba_player_boxscores_2024_25.csv")
df2 = pd.read_csv("data/raw/boxscores/player/nba_player_boxscores_2025_26.csv")
df = pd.concat([df1, df2])
df = df.dropna(subset=["MIN", "REB", "AST"])
df["MIN_FLOAT"] = df["MIN"].astype(str).apply(lambda x: float(x.split(":")[0]) + float(x.split(":")[1])/60 if ":" in str(x) else float(x) if pd.notna(x) and str(x).replace(".", "").isdigit() else 0)
grouped = df.groupby(["PLAYER_ID", "PLAYER_NAME"]).agg(TOTAL_MIN=("MIN_FLOAT", "sum"), TOTAL_REB=("REB", "sum"), TOTAL_AST=("AST", "sum")).reset_index()
grouped = grouped[grouped["TOTAL_MIN"] >= 200]
grouped["REB_PER_36"] = (grouped["TOTAL_REB"] / grouped["TOTAL_MIN"]) * 36
grouped["AST_PER_36"] = (grouped["TOTAL_AST"] / grouped["TOTAL_MIN"]) * 36
print("REB_PER_36 quantiles:")
print(grouped["REB_PER_36"].describe(percentiles=[0.1, 0.25, 0.5, 0.75, 0.9]))
print("\nAST_PER_36 quantiles:")
print(grouped["AST_PER_36"].describe(percentiles=[0.1, 0.25, 0.5, 0.75, 0.9]))
