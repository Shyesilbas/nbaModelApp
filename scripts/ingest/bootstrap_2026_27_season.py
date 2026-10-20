import os
import pandas as pd
from pathlib import Path
from nba_api.stats.endpoints import scheduleleaguev2, commonallplayers
from src.ingestion.nba_api_client import call_nba_api
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
sl = call_nba_api(scheduleleaguev2.ScheduleLeagueV2, season=SEASON, timeout=20)
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
cap = call_nba_api(commonallplayers.CommonAllPlayers, season=SEASON, is_only_current_season=1, timeout=20)
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
        "GP": 0,
        "TOTAL_MIN": 0.0,
        "AVG_MIN": 0.0,
        "AVG_PTS": 0.0,
        "AVG_REB": 0.0,
        "AVG_AST": 0.0
    })
    
    avg_min = float(stats.get("AVG_MIN", 0.0))
    avg_pts = float(stats.get("AVG_PTS", 0.0))
    avg_reb = float(stats.get("AVG_REB", 0.0))
    avg_ast = float(stats.get("AVG_AST", 0.0))
    gp = int(stats.get("GP", 0))
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
else:
    # Preserve existing TRADE_DATE and HOW_ACQUIRED if already mapped
    existing_multi_path = SEASON_DIR / "analysis/multi_team_players.csv"
    if existing_multi_path.exists():
        try:
            df_ex = pd.read_csv(existing_multi_path)
            if "TRADE_DATE" in df_ex.columns:
                date_map = df_ex.set_index("PLAYER_ID")["TRADE_DATE"].to_dict()
                how_map = df_ex.set_index("PLAYER_ID")["HOW_ACQUIRED"].to_dict() if "HOW_ACQUIRED" in df_ex.columns else {}
                multi_team_df["TRADE_DATE"] = multi_team_df["PLAYER_ID"].map(date_map).fillna("2026-07-06")
                multi_team_df["HOW_ACQUIRED"] = multi_team_df["PLAYER_ID"].map(how_map).fillna("")
        except Exception:
            pass

# 4. Save Core Data and JSONs
print("\n[4/5] Saving Canonical Datasets...")

# Save Canonical Data files
analysis_dir = SEASON_DIR / "analysis"
analysis_dir.mkdir(parents=True, exist_ok=True)

roster_df.to_csv(analysis_dir / "team_rosters.csv", index=False)
core_df.to_csv(analysis_dir / "core_players.csv", index=False)
star_df.to_csv(analysis_dir / "star_candidates.csv", index=False)
multi_team_df.to_csv(analysis_dir / "multi_team_players.csv", index=False)

# Player name lookup
lookup_rows = []
for _, r in roster_df.iterrows():
    lookup_rows.append({
        "PLAYER_ID": r["PLAYER_ID"],
        "RAW_PLAYER_NAME": r["PLAYER_NAME"],
        "NORMALIZED_PLAYER_NAME": str(r["PLAYER_NAME"]).strip().lower()
    })
lookup_df = pd.DataFrame(lookup_rows).drop_duplicates(subset=["PLAYER_ID"]).reset_index(drop=True)
lookup_df.to_csv(analysis_dir / "player_name_lookup.csv", index=False)

roster_df.to_csv(ROOT / "data" / "canonical" / "team_rosters.csv", index=False)
core_df.to_csv(ROOT / "data" / "canonical" / "core_players.csv", index=False)
core_df.to_csv(ROOT / "data" / "production" / "core_players.csv", index=False)

# Synchronize 2026-27 player_features for all roster players so they can be predicted
feat_path_csv = FEATURES_DIR / "player_features.csv"
if feat_path_csv.exists():
    df_feat = pd.read_csv(feat_path_csv)
    id_col = "PLAYER_ID" if "PLAYER_ID" in df_feat.columns else "Player_ID"
    existing_pids = set(df_feat[id_col])
    missing_roster_players = roster_df[~roster_df["PLAYER_ID"].isin(existing_pids)]
    if len(missing_roster_players) > 0:
        print(f"  -> Adding {len(missing_roster_players)} missing roster players to 2026-27 player_features baseline...")
        template_row = df_feat.iloc[0].to_dict()
        new_feature_rows = []
        for _, p in missing_roster_players.iterrows():
            row_dict = template_row.copy()
            row_dict.update({
                "Player_ID": int(p["PLAYER_ID"]),
                "PLAYER_ID": int(p["PLAYER_ID"]),
                "GAME_DATE": pd.Timestamp("2026-06-01"),
                "MATCHUP": f"{p['TEAM_ABBREVIATION']} vs OPP",
                "TEAM_ABBREVIATION": p["TEAM_ABBREVIATION"],
                "PLAYER_NAME": str(p["PLAYER_NAME"]),
                "SEASON_TYPE": "Regular Season",
                "IS_HOME": 1,
                "OPPONENT_ABBREVIATION": "OPP",
                "IS_PLAYOFF": 0,
                "DAYS_REST": 3,
                "IS_B2B": 0,
                "MIN": float(p["AVG_MIN"]),
                "MIN_LAST_5": float(p["AVG_MIN"]),
                "MIN_EMA_10": float(p["AVG_MIN"]),
                "PTS": float(p["AVG_PTS"]),
                "PTS_LAST_5": float(p["AVG_PTS"]),
                "PTS_LAST_10": float(p["AVG_PTS"]),
                "REB": float(p["AVG_REB"]),
                "REB_LAST_5": float(p["AVG_REB"]),
                "AST": float(p["AVG_AST"]),
                "AST_LAST_5": float(p["AVG_AST"]),
                "PLUS_MINUS_LAST_5": 0.0,
                "POSITION_GROUP": "WING",
                "PLAYER_POSITION_GROUP": "WING",
                "USG_PCT_LAST_3": 18.0,
                "USG_PCT_LAST_10": 18.0
            })
            new_feature_rows.append(row_dict)
        df_new_feat = pd.DataFrame(new_feature_rows)
        for col in df_feat.columns:
            if col in df_new_feat.columns:
                try:
                    df_new_feat[col] = df_new_feat[col].astype(df_feat[col].dtype)
                except Exception:
                    pass
        df_combined_feat = pd.concat([df_feat, df_new_feat], ignore_index=True)
        df_combined_feat.to_csv(feat_path_csv, index=False)
        print("  -> Updated 2026-27 player_features with all current active roster members.")

# 5. Frontend store for the new season (and the global seasons list / profiles)
print("\n[5/5] Building the 2026-27 frontend store...")
from src.frontend_store.builders import build_frontend_store
build_frontend_store(["2026-27"])

print("\nSuccessfully onboarded season 2026-27!")
print(f"Total 2026-27 Games: {len(sched)}")
print(f"Total Roster Players: {len(roster_df)}")
print(f"Total Trade / Multi-Team Players: {len(multi_team_df)}")
