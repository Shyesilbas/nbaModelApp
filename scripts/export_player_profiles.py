"""
Export player profiles and per-season game logs to frontend JSON.

Outputs:
  frontend/public/data/player_profiles.json        - metadata per player
  frontend/public/data/player_season_games.json    - game rows per player per season
  frontend/public/data/player_season_averages.json - season averages per player

DNP logic (corrected):
  A player's game log includes ALL games their team played that season.
  - If the player has a boxscore row for that game -> use it (DID_NOT_PLAY=False normally,
    DID_NOT_PLAY=True if MIN is null/0)
  - If the player has NO boxscore row for a team game -> inject a DNP row with
    DID_NOT_PLAY=True and stats as null.
  This ensures games_total = team's total games, games_played = boxscore rows with MIN>0.
"""

import json
import math
import os
import sys
import hashlib
from datetime import datetime, timezone

import pandas as pd
from scripts.season_utils import discover_seasons, normalize_season

OUT_DIR = os.environ.get("FRONTEND_DATA_DIR", "data/frontend")


def nan_safe(val):
    if val is None:
        return None
    if isinstance(val, float) and (math.isnan(val) or not math.isfinite(val)):
        return None
    if hasattr(val, "item"):
        val = val.item()
    return val


def write_manifest(out_dir: str, season: str):
    files = {}
    for filename in sorted(os.listdir(out_dir)):
        if not filename.endswith(".json") or filename == "manifest.json":
            continue
        path = os.path.join(out_dir, filename)
        with open(path, "rb") as f:
            digest = hashlib.sha256(f.read()).hexdigest()
        files[filename] = {
            "path": f"/data/{filename}",
            "size_bytes": os.path.getsize(path),
            "sha256": digest,
        }

    manifest = {
        "season": season,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "version": hashlib.sha256(
            json.dumps(files, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()[:16],
        "files": files,
    }
    out_path = os.path.join(out_dir, "manifest.json")
    with open(out_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"Wrote manifest -> {out_path}")


def load_boxscores(season_key, season_path):
    path = os.path.join(season_path, "raw", "boxscores", "player_boxscores.csv")
    fallback_path = os.path.join(season_path, "raw", "player_games.csv")
    if not os.path.exists(path):
        if not os.path.exists(fallback_path):
            print(f"  [WARN] missing: {path}", file=sys.stderr)
            return pd.DataFrame()
        path = fallback_path
    df = pd.read_csv(path)
    rename_map = {}
    if "Player_ID" in df.columns and "PLAYER_ID" not in df.columns:
        rename_map["Player_ID"] = "PLAYER_ID"
    if "Game_ID" in df.columns and "GAME_ID" not in df.columns:
        rename_map["Game_ID"] = "GAME_ID"
    if rename_map:
        df = df.rename(columns=rename_map)
    if "TEAM_ABBREVIATION" not in df.columns and "MATCHUP" in df.columns:
        df["TEAM_ABBREVIATION"] = df["MATCHUP"].astype(str).str.split(" ").str[0]
    df["SEASON"] = season_key
    # Normalize GAME_ID to string for consistent joining
    df["GAME_ID_STR"] = df["GAME_ID"].astype(str).str.strip()
    return df


def load_game_results(season_key, season_path):
    path = os.path.join(season_path, "processed", "game_results.csv")
    if not os.path.exists(path):
        print(f"  [WARN] missing: {path}", file=sys.stderr)
        return pd.DataFrame()
    df = pd.read_csv(path)
    df["SEASON"] = season_key
    df["GAME_ID_STR"] = df["GAME_ID"].astype(str).str.strip()
    return df


def load_player_metadata():
    path = "data/canonical/player_metadata.csv"
    if not os.path.exists(path):
        print(f"  [WARN] missing: {path}", file=sys.stderr)
        return pd.DataFrame()
    return pd.read_csv(path)


def compute_averages(games: list) -> dict:
    stat_cols = ["MIN", "PTS", "REB", "AST", "STL", "BLK", "TOV",
                 "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT",
                 "FTM", "FTA", "FT_PCT", "OREB", "DREB", "PLUS_MINUS"]
    played = [g for g in games if not g["DID_NOT_PLAY"]]
    result = {"games_played": len(played), "games_total": len(games)}
    for col in stat_cols:
        vals = [g[col] for g in played if g.get(col) is not None]
        if vals:
            avg = sum(vals) / len(vals)
            result[col] = round(avg, 2)
        else:
            result[col] = None
    actual_teams = []
    for g in games:
        t = g.get("TEAM_ABBREVIATION")
        if t and t not in actual_teams:
            actual_teams.append(t)
    result["teams"] = actual_teams
    return result


def export_player_profiles(season: str | None = None, out_dir: str | None = None):
    target_out_dir = out_dir or os.environ.get("FRONTEND_DATA_DIR", "data/frontend")
    os.makedirs(target_out_dir, exist_ok=True)
    requested_season = normalize_season(season) if season else None

    # ── Load metadata ──────────────────────────────────────────────────
    meta_df = load_player_metadata()
    meta_map = {}
    if not meta_df.empty:
        for _, row in meta_df.iterrows():
            pid = int(row["PLAYER_ID"])
            meta_map[pid] = {
                "PLAYER_ID": pid,
                "PLAYER_NAME": nan_safe(row.get("PLAYER_NAME")),
                "HEIGHT": nan_safe(row.get("HEIGHT")),
                "WEIGHT": nan_safe(row.get("WEIGHT")),
                "COLLEGE": nan_safe(row.get("COLLEGE")),
                "COUNTRY": nan_safe(row.get("COUNTRY")),
                "OFFICIAL_POSITION": nan_safe(row.get("OFFICIAL_POSITION")),
                "POSITION_GROUP": nan_safe(row.get("POSITION_GROUP")),
                "DRAFT_YEAR": nan_safe(row.get("DRAFT_YEAR")),
                "DRAFT_ROUND": nan_safe(row.get("DRAFT_ROUND")),
                "DRAFT_NUMBER": nan_safe(row.get("DRAFT_NUMBER")),
                "FROM_YEAR": nan_safe(row.get("FROM_YEAR")),
                "TO_YEAR": nan_safe(row.get("TO_YEAR")),
                "ROSTER_STATUS": nan_safe(row.get("ROSTER_STATUS")),
            }

    seasons = discover_seasons()
    if requested_season is not None:
        if requested_season not in seasons:
            raise FileNotFoundError(f"Season data not found for {requested_season}")
        seasons = {requested_season: seasons[requested_season]}

    # ── Per-season processing ──────────────────────────────────────────
    # These dicts accumulate across seasons
    player_season_games: dict = {}
    player_season_averages: dict = {}
    player_name_from_bs: dict = {}
    current_team_map: dict = {}

    for season_key, season_path in sorted(seasons.items(), key=lambda x: x[0]):
        print(f"\nProcessing {season_key}...")

        bs = load_boxscores(season_key, season_path)
        gr = load_game_results(season_key, season_path)
        roster_path = os.path.join(season_path, "analysis", "team_rosters.csv")

        # Update current team from roster if available
        if os.path.exists(roster_path):
            try:
                roster_df = pd.read_csv(roster_path)
                for _, r_row in roster_df.iterrows():
                    r_pid = int(r_row["PLAYER_ID"])
                    r_team = str(r_row["TEAM_ABBREVIATION"]).strip()
                    r_name = str(r_row.get("PLAYER_NAME", "")).strip()
                    if r_team:
                        current_team_map[r_pid] = r_team
                    if r_name and r_pid not in player_name_from_bs:
                        player_name_from_bs[r_pid] = r_name
            except Exception as e:
                print(f"  [WARN] Failed to read roster {roster_path}: {e}", file=sys.stderr)

        if bs.empty:
            # If no boxscores yet (e.g. upcoming season), only track current team and player names
            continue

        # Mark boxscore-level DNP (MIN is null or 0)
        bs["DID_NOT_PLAY"] = bs["MIN"].isna() | (bs["MIN"] == 0)

        # Build game result lookup: GAME_ID_STR -> game info dict
        game_lookup: dict = {}
        if not gr.empty:
            for _, row in gr.iterrows():
                gid = row["GAME_ID_STR"]
                game_lookup[gid] = {
                    "GAME_DATE": nan_safe(row.get("GAME_DATE")),
                    "HOME_TEAM_ABBREVIATION": nan_safe(row.get("HOME_TEAM_ABBREVIATION")),
                    "HOME_TEAM_NAME": nan_safe(row.get("HOME_TEAM_NAME")),
                    "HOME_SCORE": nan_safe(row.get("HOME_SCORE")),
                    "AWAY_TEAM_ABBREVIATION": nan_safe(row.get("AWAY_TEAM_ABBREVIATION")),
                    "AWAY_TEAM_NAME": nan_safe(row.get("AWAY_TEAM_NAME")),
                    "AWAY_SCORE": nan_safe(row.get("AWAY_SCORE")),
                    "WINNER_TEAM_ABBREVIATION": nan_safe(row.get("WINNER_TEAM_ABBREVIATION")),
                    "SEASON_TYPE": nan_safe(row.get("SEASON_TYPE")),
                    "IS_PLAYOFF": bool(row.get("IS_PLAYOFF", False)),
                }

        # Build team game sets: team_abbr -> set of GAME_ID_STR
        team_games: dict = {}
        if not gr.empty:
            for _, row in gr.iterrows():
                gid = row["GAME_ID_STR"]
                for col in ["HOME_TEAM_ABBREVIATION", "AWAY_TEAM_ABBREVIATION"]:
                    abbr = nan_safe(row.get(col))
                    if abbr:
                        team_games.setdefault(abbr, set()).add(gid)

        # Build per-player team membership for this season
        # A player may switch teams mid-season; we track per (player, game) team
        # For DNP injection, we use teams from their actual boxscore rows (most recent)
        player_teams: dict = {}  # pid -> set of team abbreviations this season
        for (pid_raw, grp_df) in bs.groupby("PLAYER_ID"):
            pid = int(pid_raw)
            teams = grp_df["TEAM_ABBREVIATION"].dropna().unique().tolist()
            player_teams[pid] = teams
            if teams:
                current_team_map[pid] = teams[-1]
            if pid not in player_name_from_bs:
                names = grp_df["PLAYER_NAME"].dropna()
                player_name_from_bs[pid] = str(names.iloc[0]) if len(names) > 0 else ""

        # For each player, build their full game log for this season
        for pid, teams in player_teams.items():
            # Games the player appears in (boxscore rows), keyed by GAME_ID_STR
            player_bs_rows = bs[bs["PLAYER_ID"] == pid].set_index("GAME_ID_STR")

            # List of (date, team) for games the player actually appeared in
            actual_games_list = []
            for gid_val, row_val in player_bs_rows.iterrows():
                gdate = game_lookup.get(gid_val, {}).get("GAME_DATE") or nan_safe(row_val.get("GAME_DATE"))
                t_abbr = nan_safe(row_val.get("TEAM_ABBREVIATION"))
                if gdate and t_abbr:
                    actual_games_list.append((gdate, t_abbr))
            actual_games_list.sort(key=lambda x: x[0])

            import datetime
            def get_active_team(target_date):
                if not actual_games_list:
                    return teams[0] if teams else None
                if target_date <= actual_games_list[0][0]:
                    return actual_games_list[0][1]
                if target_date >= actual_games_list[-1][0]:
                    return actual_games_list[-1][1]
                try:
                    target_dt = datetime.datetime.strptime(target_date, "%Y-%m-%d")
                    best_team = None
                    min_diff = datetime.timedelta(days=9999)
                    for gdate, t_abbr in actual_games_list:
                        dt = datetime.datetime.strptime(gdate, "%Y-%m-%d")
                        diff = abs(target_dt - dt)
                        if diff < min_diff:
                            min_diff = diff
                            best_team = t_abbr
                    return best_team
                except:
                    return teams[0] if teams else None

            # All team game IDs across all teams this player was on
            all_team_game_ids: set = set()
            for team in teams:
                all_team_game_ids |= team_games.get(team, set())

            games_for_player = []

            for gid_str in sorted(all_team_game_ids, key=lambda g: game_lookup.get(g, {}).get("GAME_DATE") or ""):
                game_info = game_lookup.get(gid_str, {})

                if gid_str in player_bs_rows.index:
                    # Player has a boxscore row for this game
                    row = player_bs_rows.loc[gid_str]
                    # In case of duplicate (rare), take first
                    if hasattr(row, "iloc"):
                        row = row.iloc[0] if len(row.shape) > 1 else row

                    dnp = bool(row.get("DID_NOT_PLAY", False))

                    # Determine matchup direction for this player
                    team_abbr = nan_safe(row.get("TEAM_ABBREVIATION"))
                    home = game_info.get("HOME_TEAM_ABBREVIATION")
                    away = game_info.get("AWAY_TEAM_ABBREVIATION")
                    if team_abbr == home:
                        opp = away
                        matchup = f"{home} vs. {away}"
                    else:
                        opp = home
                        matchup = f"{away} @ {home}"

                    g: dict = {
                        "GAME_ID": gid_str,
                        "GAME_DATE": game_info.get("GAME_DATE") or nan_safe(row.get("GAME_DATE")),
                        "SEASON": season_key,
                        "TEAM_ABBREVIATION": team_abbr,
                        "MATCHUP": nan_safe(row.get("MATCHUP")) or matchup,
                        "WL": nan_safe(row.get("WL")),
                        "SEASON_TYPE": nan_safe(row.get("SEASON_TYPE")) or game_info.get("SEASON_TYPE"),
                        "DID_NOT_PLAY": dnp,
                        "HOME_TEAM_ABBREVIATION": home,
                        "HOME_TEAM_NAME": game_info.get("HOME_TEAM_NAME"),
                        "HOME_SCORE": game_info.get("HOME_SCORE"),
                        "AWAY_TEAM_ABBREVIATION": away,
                        "AWAY_TEAM_NAME": game_info.get("AWAY_TEAM_NAME"),
                        "AWAY_SCORE": game_info.get("AWAY_SCORE"),
                        "WINNER_TEAM_ABBREVIATION": game_info.get("WINNER_TEAM_ABBREVIATION"),
                        "IS_PLAYOFF": game_info.get("IS_PLAYOFF", False),
                    }

                    if not dnp:
                        stat_cols = ["MIN", "PTS", "REB", "AST", "STL", "BLK", "TOV",
                                     "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT",
                                     "FTM", "FTA", "FT_PCT", "OREB", "DREB", "PLUS_MINUS", "PF"]
                        for col in stat_cols:
                            raw = row.get(col) if col in row.index else None
                            if raw is None or (isinstance(raw, float) and (math.isnan(raw) or not math.isfinite(raw))):
                                g[col] = None
                            elif isinstance(raw, float):
                                g[col] = round(raw, 3) if col.endswith("_PCT") else (int(raw) if raw == int(raw) else round(raw, 1))
                            else:
                                g[col] = nan_safe(raw)

                else:
                    # Player's team played this game but player has NO boxscore row
                    # -> True DNP (injured, inactive, traded away before game)
                    home = game_info.get("HOME_TEAM_ABBREVIATION")
                    away = game_info.get("AWAY_TEAM_ABBREVIATION")
                    game_date = game_info.get("GAME_DATE")
                    if not game_date:
                        continue

                    active_team = get_active_team(game_date)
                    if active_team != home and active_team != away:
                        continue  # Player was on a different team at this date, skip

                    player_team_in_game = active_team

                    if player_team_in_game == home:
                        opp = away
                        matchup = f"{home} vs. {away}"
                    else:
                        opp = home
                        matchup = f"{away} @ {home}"

                    # Determine W/L for this DNP game
                    winner = game_info.get("WINNER_TEAM_ABBREVIATION")
                    wl = None
                    if winner:
                        wl = "W" if winner == player_team_in_game else "L"

                    g = {
                        "GAME_ID": gid_str,
                        "GAME_DATE": game_date,
                        "SEASON": season_key,
                        "TEAM_ABBREVIATION": player_team_in_game,
                        "MATCHUP": matchup,
                        "WL": wl,
                        "SEASON_TYPE": game_info.get("SEASON_TYPE"),
                        "DID_NOT_PLAY": True,
                        "HOME_TEAM_ABBREVIATION": home,
                        "HOME_TEAM_NAME": game_info.get("HOME_TEAM_NAME"),
                        "HOME_SCORE": game_info.get("HOME_SCORE"),
                        "AWAY_TEAM_ABBREVIATION": away,
                        "AWAY_TEAM_NAME": game_info.get("AWAY_TEAM_NAME"),
                        "AWAY_SCORE": game_info.get("AWAY_SCORE"),
                        "WINNER_TEAM_ABBREVIATION": winner,
                        "IS_PLAYOFF": game_info.get("IS_PLAYOFF", False),
                    }

                games_for_player.append(g)

            if not games_for_player:
                continue

            if pid not in player_season_games:
                player_season_games[pid] = {}
            if pid not in player_season_averages:
                player_season_averages[pid] = {}

            player_season_games[pid][season_key] = games_for_player
            player_season_averages[pid][season_key] = compute_averages(games_for_player)

        # Stats
        all_pids = bs["PLAYER_ID"].unique()
        print(f"  {len(all_pids)} players, {len(game_lookup)} games")

    # ── Build player profiles ──────────────────────────────────────────
    all_player_ids = set(player_season_games.keys()) | set(player_season_averages.keys()) | set(current_team_map.keys())
    profiles = []
    for pid in all_player_ids:
        meta = meta_map.get(pid, {})
        name = meta.get("PLAYER_NAME") or player_name_from_bs.get(pid, "")
        latest_team = current_team_map.get(pid)
        entry = {
            "PLAYER_ID": pid,
            "PLAYER_NAME": name,
            "CURRENT_TEAM": latest_team,
            "CURRENT_TEAM_ABBREVIATION": latest_team,
            **{k: v for k, v in meta.items() if k not in ("PLAYER_ID", "PLAYER_NAME")},
        }
        profiles.append(entry)

    profiles.sort(key=lambda x: x.get("PLAYER_NAME") or "")

    profiles_path = os.path.join(target_out_dir, "player_profiles.json")
    with open(profiles_path, "w") as f:
        json.dump(profiles, f, separators=(",", ":"))
    print(f"\nWrote {len(profiles)} player profiles -> {profiles_path}")

    # ── Write seasons.json ─────────────────────────────────────────────
    seasons_list = sorted(list(seasons.keys()))
    seasons_path = os.path.join(target_out_dir, "seasons.json")
    with open(seasons_path, "w") as f:
        json.dump(seasons_list, f, indent=2)
    print(f"Wrote seasons list -> {seasons_path}")

    # ── Write game logs ────────────────────────────────────────────────
    # Convert keys to str for JSON
    games_out = {str(k): v for k, v in player_season_games.items()}
    games_path = os.path.join(target_out_dir, "player_season_games.json")
    with open(games_path, "w") as f:
        json.dump(games_out, f, separators=(",", ":"))
    print(f"Wrote player_season_games -> {games_path}")

    avgs_out = {str(k): v for k, v in player_season_averages.items()}
    averages_path = os.path.join(target_out_dir, "player_season_averages.json")
    with open(averages_path, "w") as f:
        json.dump(avgs_out, f, separators=(",", ":"))
    print(f"Wrote player_season_averages -> {averages_path}")

    # ── Verify Embiid as sanity check ─────────────────────────────────
    embiid_id = 203954
    sanity_season = requested_season or "2025-26"
    embiid_games = player_season_games.get(embiid_id, {}).get(sanity_season, [])
    if embiid_games:
        played = sum(1 for g in embiid_games if not g["DID_NOT_PLAY"])
        dnp = sum(1 for g in embiid_games if g["DID_NOT_PLAY"])
        print(f"\nEmbiid {sanity_season}: {played} played + {dnp} DNP = {len(embiid_games)} total")

    write_manifest(target_out_dir, requested_season or "multi")

    print("\nDone.")


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Export player profile and season history JSON files.")
    parser.add_argument("--season", default=None, help="Export a single season instead of every discovered season.")
    parser.add_argument(
        "--out-dir",
        default=os.environ.get("FRONTEND_DATA_DIR", "data/frontend"),
        help="Output directory for the generated JSON bundle.",
    )
    args = parser.parse_args()

    export_player_profiles(season=args.season, out_dir=args.out_dir)


if __name__ == "__main__":
    main()
