import os
import sys
import json
import re
import argparse
from collections import defaultdict
import pandas as pd
import numpy as np
from pathlib import Path

ROOT = Path("/Users/serhat/agProjects/nbaModelApp")

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.ingestion.nba_api_client import call_nba_api
from nba_api.stats.endpoints import playbyplayv3

def clean_clock(clock_str):
    # PT12M00.00S -> 12:00
    if not isinstance(clock_str, str):
        return "12:00"
    clock_str = clock_str.replace("PT", "").replace("S", "")
    parts = clock_str.split("M")
    if len(parts) == 2:
        minutes = parts[0]
        seconds = parts[1].split(".")[0]
        return f"{minutes.zfill(2)}:{seconds.zfill(2)}"
    return clock_str

STAT_KEYS = ("pts", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "reb", "ast", "stl", "blk", "pf", "tov")

def clean_value(value, default=None):
    if pd.isna(value):
        return default
    if isinstance(value, str):
        value = value.strip()
        return value if value else default
    return value

def as_int(value):
    value = clean_value(value)
    if value is None:
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None

def pick(row, *names, default=None):
    for name in names:
        if name in row.index:
            value = clean_value(row.get(name), None)
            if value is not None:
                return value
    return default

def empty_stats():
    return {key: 0 for key in STAT_KEYS}

def snapshot(stats):
    return dict(stats)

def is_three_pointer(description, sub_type):
    text = f"{description} {sub_type}".upper()
    return "3PT" in text or "3-PT" in text

def made_free_throw(description):
    text = description.upper()
    return "MISS" not in text and "FREE THROW" in text

def event_points(action_type, description, score_home, score_away, prev_home, prev_away):
    if action_type not in {"Made Shot", "Free Throw"}:
        return 0
    delta = max(0, int(score_home) + int(score_away) - int(prev_home) - int(prev_away))
    if delta:
        return delta
    if action_type == "Free Throw":
        return 1 if made_free_throw(description) else 0
    return 3 if "3PT" in description.upper() else 2

def parse_named_total(description, label):
    match = re.search(rf"\(([^()]+?)\s+(\d+)\s+{label}\)", description, flags=re.IGNORECASE)
    if not match:
        return None, None
    return match.group(1).strip(), int(match.group(2))

def detect_badges(event, player_stats, quarter_player_points, quarter_team_points, team_scoring_run):
    badges = []
    name = event.get("player_name")
    team = event.get("team")
    pts = event.get("points_scored", 0)
    stats = player_stats.get((team, name), empty_stats()) if team and name else empty_stats()

    if pts > 0 and name:
        q_pts = quarter_player_points[(event["period"], team, name)]
        if q_pts >= 10:
            badges.append(f"{q_pts} points this quarter")

        run = team_scoring_run.get(team)
        if run and run["player"] == name and run["points"] >= 8:
            badges.append(f"{run['points']} straight team points")

    if stats["ast"] >= 5 and event["action_type"] == "Made Shot":
        badges.append(f"{stats['ast']} assists created")
    if stats["reb"] >= 10 and event["action_type"] == "Rebound":
        badges.append(f"{stats['reb']} rebounds secured")
    if stats["blk"] >= 3 and "block" in event["description"].lower():
        badges.append(f"{stats['blk']} blocks")
    if stats["stl"] >= 3 and ("steal" in event["description"].lower() or event["action_type"] == "Steal"):
        badges.append(f"{stats['stl']} steals")

    return badges[:3]

def main():
    parser = argparse.ArgumentParser(description="Build structured play-by-play JSON for the frontend.")
    parser.add_argument("--game-id", default="0042500405")
    parser.add_argument("--home-team", default="SAS")
    parser.add_argument("--away-team", default="NYK")
    args = parser.parse_args()

    game_id = str(args.game_id).zfill(10)
    print(f"Creating structured Play-by-Play JSON for game {game_id}...")
    
    try:
        pbp = call_nba_api(playbyplayv3.PlayByPlayV3, game_id=game_id, start_period=1, end_period=4)
        df = pbp.get_data_frames()[0]
        
        # Clean scores
        df["scoreHome_clean"] = pd.to_numeric(df["scoreHome"].replace("", np.nan)).ffill().fillna(0).astype(int)
        df["scoreAway_clean"] = pd.to_numeric(df["scoreAway"].replace("", np.nan)).ffill().fillna(0).astype(int)
        if "pointsTotal" in df.columns:
            df["pointsTotal"] = pd.to_numeric(df["pointsTotal"], errors="coerce").fillna(0).astype(int)
        
        # Calculate Quarter Scores
        quarter_scores = []
        prev_home, prev_away = 0, 0
        for q in sorted(df["period"].unique()):
            q_df = df[df["period"] == q]
            if not q_df.empty:
                last_row = q_df.iloc[-1]
                home_total = int(last_row["scoreHome_clean"])
                away_total = int(last_row["scoreAway_clean"])
                
                home_q = home_total - prev_home
                away_q = away_total - prev_away
                
                quarter_scores.append({
                    "quarter": f"Q{q}",
                    "home": home_q,
                    "away": away_q,
                    "home_total": home_total,
                    "away_total": away_total
                })
                prev_home, prev_away = home_total, away_total
                
        # Parse Events with running player context.
        events = []
        player_stats = defaultdict(empty_stats)
        player_lookup = {}
        quarter_player_points = defaultdict(int)
        quarter_team_points = defaultdict(int)
        team_scoring_run = {}
        prev_home, prev_away = 0, 0

        for _, row in df.iterrows():
            clock_fmt = clean_clock(row["clock"])
            action_type = str(pick(row, "actionType", default="") or "")
            sub_type = str(pick(row, "subType", default="") or "")
            team = pick(row, "teamTricode", "teamAbbreviation", default=None)
            player_name = pick(row, "playerName", default=None)
            player_id = as_int(pick(row, "personId", "playerId", "PLAYER_ID", default=None))
            description = str(pick(row, "description", default="") or "")
            score_home = int(row["scoreHome_clean"])
            score_away = int(row["scoreAway_clean"])
            points_scored = event_points(action_type, description, score_home, score_away, prev_home, prev_away)

            if team and player_name:
                player_lookup[player_name] = {"player_id": player_id, "team": team}
            key = (team, player_name)
            stats_before = snapshot(player_stats[key]) if team and player_name else None

            if team and player_name:
                stats = player_stats[key]
                desc_upper = description.upper()
                assisted_name, assisted_total = parse_named_total(description, "AST")
                if action_type == "Made Shot":
                    stats["pts"] += points_scored
                    stats["fgm"] += 1
                    stats["fga"] += 1
                    if is_three_pointer(description, sub_type):
                        stats["fg3m"] += 1
                        stats["fg3a"] += 1
                    quarter_player_points[(int(row["period"]), team, player_name)] += points_scored
                    quarter_team_points[(int(row["period"]), team)] += points_scored
                    run = team_scoring_run.get(team)
                    if run and run["player"] == player_name:
                        run["points"] += points_scored
                    else:
                        team_scoring_run[team] = {"player": player_name, "points": points_scored}
                elif action_type == "Missed Shot":
                    stats["fga"] += 1
                    if is_three_pointer(description, sub_type):
                        stats["fg3a"] += 1
                elif action_type == "Free Throw":
                    stats["fta"] += 1
                    if points_scored > 0:
                        stats["ftm"] += 1
                        stats["pts"] += 1
                        quarter_player_points[(int(row["period"]), team, player_name)] += 1
                        quarter_team_points[(int(row["period"]), team)] += 1
                        run = team_scoring_run.get(team)
                        if run and run["player"] == player_name:
                            run["points"] += 1
                        else:
                            team_scoring_run[team] = {"player": player_name, "points": 1}
                elif action_type == "Rebound":
                    stats["reb"] += 1
                elif action_type == "Foul":
                    stats["pf"] += 1
                elif action_type == "Turnover":
                    stats["tov"] += 1
                if "STEAL" in desc_upper:
                    stats["stl"] += 1
                if "BLOCK" in desc_upper or "BLK" in desc_upper:
                    stats["blk"] += 1

                if assisted_name:
                    assist_lookup = player_lookup.get(assisted_name, {"player_id": None, "team": team})
                    assist_key = (assist_lookup.get("team") or team, assisted_name)
                    player_stats[assist_key]["ast"] = max(player_stats[assist_key]["ast"] + 1, assisted_total)
            else:
                assisted_name, assisted_total = None, None

            stats_after = snapshot(player_stats[key]) if team and player_name else None

            event = {
                "period": int(row["period"]),
                "clock": clock_fmt,
                "action_type": action_type,
                "sub_type": sub_type,
                "team": team,
                "player_id": player_id,
                "player_name": player_name,
                "description": description,
                "score_home": score_home,
                "score_away": score_away,
                "points_scored": points_scored,
                "player_stats_before": stats_before,
                "player_stats_after": stats_after,
                "assist_player_name": assisted_name,
                "assist_total": assisted_total,
                "quarter_player_points": quarter_player_points[(int(row["period"]), team, player_name)] if team and player_name else 0,
                "quarter_team_points": quarter_team_points[(int(row["period"]), team)] if team else 0,
            }
            event["badges"] = detect_badges(event, player_stats, quarter_player_points, quarter_team_points, team_scoring_run)
            events.append(event)
            prev_home, prev_away = score_home, score_away
            
        output_data = {
            "game_id": game_id,
            "home_team": args.home_team,
            "away_team": args.away_team,
            "quarter_scores": quarter_scores,
            "events": events
        }
        
        # Write JSON to frontend/public/data/play_by_play/0042500405.json
        out_dir = ROOT / "frontend" / "public" / "data" / "play_by_play"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_file = out_dir / f"{game_id}.json"
        
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(output_data, f, indent=2)
            
        print(f"Successfully generated structured PBP JSON at: {out_file}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
