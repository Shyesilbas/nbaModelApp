import pandas as pd
import numpy as np
from sklearn.cluster import KMeans

# Load raw 2024-25 boxscores for stats
df = pd.read_csv("data/raw/boxscores/player/nba_player_boxscores_2024_25.csv")

# Filter out empty MIN
df = df.dropna(subset=["MIN", "REB", "AST"])
df["MIN_FLOAT"] = df["MIN"].astype(str).apply(lambda x: float(x.split(":")[0]) + float(x.split(":")[1])/60 if ":" in str(x) else float(x) if pd.notna(x) and str(x).replace(".", "").isdigit() else 0)

# Aggregate career totals for this season
grouped = df.groupby(["PLAYER_ID", "PLAYER_NAME"]).agg(
    TOTAL_MIN=("MIN_FLOAT", "sum"),
    TOTAL_REB=("REB", "sum"),
    TOTAL_AST=("AST", "sum")
).reset_index()

# Filter players with at least 50 minutes played
grouped = grouped[grouped["TOTAL_MIN"] >= 50]

grouped["REB_PER_36"] = (grouped["TOTAL_REB"] / grouped["TOTAL_MIN"]) * 36
grouped["AST_PER_36"] = (grouped["TOTAL_AST"] / grouped["TOTAL_MIN"]) * 36

# KMeans clustering (k=3)
X = grouped[["REB_PER_36", "AST_PER_36"]]
kmeans = KMeans(n_clusters=3, random_state=42, n_init=10)
grouped["CLUSTER"] = kmeans.fit_predict(X)

# Map clusters to GUARD, WING, BIG based on centroids
centroids = kmeans.cluster_centers_

labels_map = {}
for i in range(3):
    labels_map[i] = (centroids[i][0], centroids[i][1])

# Sort by AST_PER_36 to find GUARD (highest AST)
sorted_by_ast = sorted(labels_map.items(), key=lambda x: x[1][1], reverse=True)
guard_cluster = sorted_by_ast[0][0]

# Sort remaining by REB_PER_36 to find BIG (highest REB)
remaining = [item for item in labels_map.items() if item[0] != guard_cluster]
sorted_by_reb = sorted(remaining, key=lambda x: x[1][0], reverse=True)
big_cluster = sorted_by_reb[0][0]

# The last one is WING
wing_cluster = sorted_by_reb[1][0]

mapping = {guard_cluster: "GUARD", big_cluster: "BIG", wing_cluster: "WING"}
grouped["POSITION_GROUP"] = grouped["CLUSTER"].map(mapping)

print("Centroids (REB, AST):")
for i in range(3):
    print(f"{mapping[i]}: REB_36={centroids[i][0]:.1f}, AST_36={centroids[i][1]:.1f}")

print("\nSample Assignments:")
samples = grouped[grouped["PLAYER_NAME"].isin(["LeBron James", "Stephen Curry", "Nikola Jokic", "Anthony Davis", "Luka Doncic", "Jayson Tatum", "Anthony Edwards", "Rudy Gobert"])]
print(samples[["PLAYER_NAME", "REB_PER_36", "AST_PER_36", "POSITION_GROUP"]])

print("\nDistribution:")
print(grouped["POSITION_GROUP"].value_counts())
