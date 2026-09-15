import os
import json
import pandas as pd
from pathlib import Path
from nba_api.stats.endpoints import scheduleleaguev2, commonallplayers
from scripts.season_utils import normalize_season
from scripts.data_paths import get_data_paths

ROOT = Path(__file__).resolve().parents[2]
SEASON = "2026-27"
SEASON_DIR = ROOT / "data" / f"season={SEASON}"
RAW_DIR = SEASON_DIR / "raw"
PROCESSED_DIR = SEASON_DIR / "processed"
FEATURES_DIR = SEASON_DIR / "features"
SCHEDULE_RAW_DIR = RAW_DIR / "schedule"

RAW_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
FEATURES_DIR.mkdir(parents=True, exist_ok=True)
SCHEDULE_RAW_DIR.mkdir(parents=True, exist_ok=True)

print(f"=== Onboarding Season {SEASON} ===")

# 1. Fetch Schedule from NBA API
print("\n[1/5] Fetching ScheduleLeagueV2 for 2026-27...")
sl = scheduleleaguev2.ScheduleLeagueV2(season=SEASON, timeout=20)
sl_df = sl.get_data_frames()[0]

# Filter out all-star games (003), keep preseason (001), regular (002), playin (005), playoffs (004)
sched = pd.DataFrame()
sched["GAME_ID"] = sl_df["gameId"].astype(str).str.zfill(10)
sched["GAME_DATE"] = pd.to_datetime(sl_df["gameDateEst"]).dt.strftime("%Y-%m-%d")
sched["HOME_TEAM_ABBREVIATION"] = sl_df["homeTeam_teamTricode"]
sched["AWAY_TEAM_ABBREVIATION"] = sl_df["awayTeam_teamTricode"]
sched["HOME_TEAM_NAME"] = sl_df["homeTeam_teamName"]
sched["AWAY_TEAM_NAME"] = sl_df["awayTeam_teamName"]
sched["HOME_SCORE"] = sl_df.get("homeTeam_score", None)
sched["AWAY_SCORE"] = sl_df.get("awayTeam_score", None)

def determine_type(row):
    gid = str(row["gameId"])
    label = str(row.get("gameLabel", ""))
    if gid.startswith("001"):
        return "Pre Season"
    elif gid.startswith("005") or "play-in" in label.lower():
        return "PlayIn"
    elif "Finals" in label or gid.startswith("00426004"):
        return "NBA Finals"
    elif gid.startswith("004") or "Playoffs" in label:
        return "Playoffs"
    return "Regular Season"

sched["SEASON_TYPE"] = sl_df.apply(determine_type, axis=1)
sched["IS_PLAYOFF"] = sched["SEASON_TYPE"].isin(["PlayIn", "Playoffs", "NBA Finals"])
sched["GAME_STATUS"] = sl_df["gameStatusText"].fillna("Scheduled")
sched["SEASON"] = SEASON

# Save raw schedule
raw_sched_path = SCHEDULE_RAW_DIR / "nba_schedule.csv"
sched.to_csv(raw_sched_path, index=False)
sched.to_csv(PROCESSED_DIR / "schedule_combined.csv", index=False)
sched.to_csv(PROCESSED_DIR / "game_results.csv", index=False)
print(f"  -> Saved schedule: {len(sched)} games to {raw_sched_path}")

# 2. Fetch Active Players and Rosters
print("\n[2/5] Fetching CommonAllPlayers for 2026-27...")
cap = commonallplayers.CommonAllPlayers(season=SEASON, is_only_current_season=1, timeout=20)
cap_df = cap.get_data_frames()[0]

active_players = cap_df[cap_df["ROSTERSTATUS"] == 1].copy()
active_players = active_players[active_players["TEAM_ABBREVIATION"].str.len() == 3].copy()
print(f"  -> Total active roster players: {len(active_players)}")

# Load historical player baseline from 2025-26 for realistic stats baseline
prev_player_path = ROOT / "data" / "season=2025-26" / "raw" / "player_games.csv"
prev_player_stats = {}
if prev_player_path.exists():
    df_prev = pd.read_csv(prev_player_path)
    df_prev["PTS"] = pd.to_numeric(df_prev["PTS"], errors="coerce").fillna(0)
    df_prev["REB"] = pd.to_numeric(df_prev["REB"], errors="coerce").fillna(0)
    df_prev["AST"] = pd.to_numeric(df_prev["AST"], errors="coerce").fillna(0)
    # clean min
    if "MIN" in df_prev.columns:
        df_prev["MIN_CLEAN"] = df_prev["MIN"].astype(str).str.split(":").apply(
            lambda x: float(x[0]) + float(x[1])/60.0 if len(x) == 2 else float(x[0]) if x[0].replace(".","").isdigit() else 0.0
        )
    else:
        df_prev["MIN_CLEAN"] = 20.0
    
    agg_prev = df_prev.groupby("Player_ID").agg(
        GP=("GAME_DATE", "count"),
        TOTAL_MIN=("MIN_CLEAN", "sum"),
        AVG_MIN=("MIN_CLEAN", "mean"),
        AVG_PTS=("PTS", "mean"),
        AVG_REB=("REB", "mean"),
        AVG_AST=("AST", "mean")
    ).reset_index()
    for _, r in agg_prev.iterrows():
        prev_player_stats[int(r["Player_ID"])] = r.to_dict()

# Build 2026-27 Team Rosters
roster_rows = []
for _, p in active_players.iterrows():
    pid = int(p["PERSON_ID"])
    team = p["TEAM_ABBREVIATION"]
    name = p["DISPLAY_FIRST_LAST"]
    
    stats = prev_player_stats.get(pid, {
        "GP": 10,
        "TOTAL_MIN": 200.0,
        "AVG_MIN": 20.0,
        "AVG_PTS": 10.0,
        "AVG_REB": 4.0,
        "AVG_AST": 2.5
    })
    
    avg_min = float(stats.get("AVG_MIN", 20.0))
    avg_pts = float(stats.get("AVG_PTS", 10.0))
    avg_reb = float(stats.get("AVG_REB", 4.0))
    avg_ast = float(stats.get("AVG_AST", 2.5))
    gp = int(stats.get("GP", 10))
    total_min = float(stats.get("TOTAL_MIN", avg_min * gp))
    
    importance = (avg_min * 0.5) + (avg_pts * 1.0) + (avg_reb * 1.2) + (avg_ast * 1.5)
    
    roster_rows.append({
        "TEAM_ABBREVIATION": team,
        "PLAYER_ID": pid,
        "PLAYER_NAME": name,
        "GP": gp,
        "TOTAL_MIN": round(total_min, 1),
        "AVG_MIN": round(avg_min, 1),
        "AVG_PTS": round(avg_pts, 1),
        "AVG_REB": round(avg_reb, 1),
        "AVG_AST": round(avg_ast, 1),
        "IMPORTANCE_SCORE": round(importance, 2)
    })

roster_df = pd.DataFrame(roster_rows)
roster_df = roster_df.sort_values(["TEAM_ABBREVIATION", "IMPORTANCE_SCORE"], ascending=[True, False]).reset_index(drop=True)

# 3. Compute Core Players & Star Candidates
print("\n[3/5] Computing Core Players and Trade Discovery...")
core_rows = []
star_rows = []

for team, group in roster_df.groupby("TEAM_ABBREVIATION"):
    sorted_group = group.sort_values("IMPORTANCE_SCORE", ascending=False).reset_index(drop=True)
    for rank, (_, row) in enumerate(sorted_group.iterrows(), start=1):
        is_top3 = rank <= 3
        is_top5 = rank <= 5
        core_rows.append({
            "TEAM_ABBREVIATION": team,
            "PLAYER_ID": row["PLAYER_ID"],
            "PLAYER_NAME": row["PLAYER_NAME"],
            "IMPORTANCE_SCORE": row["IMPORTANCE_SCORE"],
            "CORE_RANK": rank,
            "IS_TOP3_CORE": is_top3,
            "IS_TOP5_CORE": is_top5
        })
        if rank <= 5:
            star_rows.append({
                "PLAYER_ID": row["PLAYER_ID"],
                "PLAYER_NAME": row["PLAYER_NAME"],
                "TEAMS_PLAYED_FOR": team,
                "NUM_TEAMS": 1,
                "GP": row["GP"],
                "AVG_MIN": row["AVG_MIN"],
                "AVG_PTS": row["AVG_PTS"],
                "AVG_REB": row["AVG_REB"],
                "AVG_AST": row["AVG_AST"],
                "IMPORTANCE_SCORE": row["IMPORTANCE_SCORE"],
                "STAR_TIER": "Tier 1: Franchise Core" if rank == 1 else "Tier 2: Co-Star" if rank <= 3 else "Tier 3: Key Starter"
            })

core_df = pd.DataFrame(core_rows)
star_df = pd.DataFrame(star_rows)

# Multi-team / Trade player discovery
# Check if player played for a different team in 2025-26 than current 2026-27 team!
multi_team_rows = []
if prev_player_path.exists():
    df_prev = pd.read_csv(prev_player_path)
    df_prev["TEAM_ABBREVIATION"] = df_prev["MATCHUP"].str.split().str[0]
    prev_teams = df_prev.groupby("Player_ID")["TEAM_ABBREVIATION"].unique().to_dict()
    
    for _, row in roster_df.iterrows():
        pid = row["PLAYER_ID"]
        curr_team = row["TEAM_ABBREVIATION"]
        past_teams = list(prev_teams.get(pid, []))
        
        if past_teams and (curr_team not in past_teams or len(past_teams) > 1):
            all_teams = list(dict.fromkeys(past_teams + [curr_team]))
            multi_team_rows.append({
                "PLAYER_ID": pid,
                "PLAYER_NAME": row["PLAYER_NAME"],
                "TEAMS_PLAYED_FOR": ", ".join(all_teams),
                "NUM_TEAMS": len(all_teams),
                "GP": row["GP"],
                "AVG_MIN": row["AVG_MIN"],
                "AVG_PTS": row["AVG_PTS"],
                "AVG_REB": row["AVG_REB"],
                "AVG_AST": row["AVG_AST"],
                "IMPORTANCE_SCORE": row["IMPORTANCE_SCORE"]
            })

multi_team_df = pd.DataFrame(multi_team_rows)
if multi_team_df.empty:
    # Fallback to general list
    multi_team_df = pd.DataFrame(columns=["PLAYER_ID", "PLAYER_NAME", "TEAMS_PLAYED_FOR", "NUM_TEAMS", "GP", "AVG_MIN", "AVG_PTS", "AVG_REB", "AVG_AST", "IMPORTANCE_SCORE"])

# 4. Save Core Data and JSONs
print("\n[4/5] Saving Canonical Datasets and Frontend Public Cache...")

# Save Canonical Data files
analysis_dir = SEASON_DIR / "analysis"
analysis_dir.mkdir(parents=True, exist_ok=True)

roster_df.to_csv(analysis_dir / "team_rosters.csv", index=False)
roster_df.to_parquet(analysis_dir / "team_rosters.parquet", index=False)
core_df.to_csv(analysis_dir / "core_players.csv", index=False)
core_df.to_parquet(analysis_dir / "core_players.parquet", index=False)
star_df.to_csv(analysis_dir / "star_candidates.csv", index=False)
star_df.to_parquet(analysis_dir / "star_candidates.parquet", index=False)
multi_team_df.to_csv(analysis_dir / "multi_team_players.csv", index=False)
multi_team_df.to_parquet(analysis_dir / "multi_team_players.parquet", index=False)

roster_df.to_csv(ROOT / "data" / "canonical" / "team_rosters.csv", index=False)
core_df.to_csv(ROOT / "data" / "canonical" / "core_players.csv", index=False)
core_df.to_csv(ROOT / "data" / "production" / "core_players.csv", index=False)

# Frontend Public JSONs
public_data = ROOT / "frontend" / "public" / "data"
public_data.mkdir(parents=True, exist_ok=True)

with open(public_data / "team_rosters.json", "w", encoding="utf-8") as f:
    json.dump(roster_df.to_dict(orient="records"), f, indent=2)

with open(public_data / "core_players.json", "w", encoding="utf-8") as f:
    json.dump(core_df.to_dict(orient="records"), f, indent=2)

with open(public_data / "star_candidates.json", "w", encoding="utf-8") as f:
    json.dump(star_df.to_dict(orient="records"), f, indent=2)

with open(public_data / "multi_team_players.json", "w", encoding="utf-8") as f:
    json.dump(multi_team_df.to_dict(orient="records"), f, indent=2)

# Copy to root data/ also for fallback
with open(ROOT / "data" / "team_rosters.json", "w", encoding="utf-8") as f:
    json.dump(roster_df.to_dict(orient="records"), f, indent=2)
with open(ROOT / "data" / "core_players.json", "w", encoding="utf-8") as f:
    json.dump(core_df.to_dict(orient="records"), f, indent=2)
with open(ROOT / "data" / "star_candidates.json", "w", encoding="utf-8") as f:
    json.dump(star_df.to_dict(orient="records"), f, indent=2)
with open(ROOT / "data" / "multi_team_players.json", "w", encoding="utf-8") as f:
    json.dump(multi_team_df.to_dict(orient="records"), f, indent=2)

# 5. Update Seasons list and all_seasons_games.json
print("\n[5/5] Updating all_seasons_games and seasons.json...")

seasons_list = [
    "2026-27",
    "2025-26",
    "2024-25",
    "2023-24",
    "2022-23",
    "2021-22",
    "2020-21",
    "2019-20",
    "2018-19"
]

with open(public_data / "seasons.json", "w", encoding="utf-8") as f:
    json.dump(seasons_list, f, indent=2)
with open(ROOT / "data" / "seasons.json", "w", encoding="utf-8") as f:
    json.dump(seasons_list, f, indent=2)

# Update all_seasons_games.json with 2026-27 schedule rows
all_seasons_games_path = public_data / "all_seasons_games.json"
existing_games = []
if all_seasons_games_path.exists():
    try:
        with open(all_seasons_games_path, "r", encoding="utf-8") as f:
            existing_games = json.load(f)
    except Exception:
        existing_games = []

# Filter out any old 2026-27 if any, and prepend new 2026-27 games
new_sched_records = sched.to_dict(orient="records")
filtered_existing = [g for g in existing_games if g.get("SEASON") != "2026-27"]
combined_all_games = new_sched_records + filtered_existing

with open(all_seasons_games_path, "w", encoding="utf-8") as f:
    json.dump(combined_all_games, f, indent=2)

with open(public_data / "game_results.json", "w", encoding="utf-8") as f:
    json.dump(new_sched_records, f, indent=2)

# Generate archive index for 2026-27
archive_dir = public_data / "archive"
archive_dir.mkdir(parents=True, exist_ok=True)
with open(archive_dir / "games_index_2026_27.json", "w", encoding="utf-8") as f:
    json.dump(new_sched_records, f, indent=2)

print("\nSuccessfully onboarded season 2026-27!")
print(f"Total 2026-27 Games: {len(sched)}")
print(f"Total Roster Players: {len(roster_df)}")
print(f"Total Trade / Multi-Team Players: {len(multi_team_df)}")
