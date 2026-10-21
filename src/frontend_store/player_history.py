"""Per-season player game logs and averages for the player page.

A player's log holds every game his team played that season:
  - a box score row -> the stats (DID_NOT_PLAY when MIN is null or 0);
  - no box score row while on that team -> an injected DNP row with null stats.
So games_total is the team's game count and games_played the games with minutes.
"""
from __future__ import annotations

import math
import os
import sys
from datetime import datetime, timedelta

import pandas as pd

STAT_COLS = ["MIN", "PTS", "REB", "AST", "STL", "BLK", "TOV",
             "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT",
             "FTM", "FTA", "FT_PCT", "OREB", "DREB", "PLUS_MINUS"]


def nan_safe(val):
    if val is None:
        return None
    if isinstance(val, float) and (math.isnan(val) or not math.isfinite(val)):
        return None
    if hasattr(val, "item"):
        val = val.item()
    return val


def load_player_logs(season_key: str, season_path: str) -> pd.DataFrame:
    path = os.path.join(season_path, "raw", "player_games.csv")
    if not os.path.exists(path):
        return pd.DataFrame()
    df = pd.read_csv(path).rename(columns={"Player_ID": "PLAYER_ID", "Game_ID": "GAME_ID"})
    if "TEAM_ABBREVIATION" not in df.columns and "MATCHUP" in df.columns:
        df["TEAM_ABBREVIATION"] = df["MATCHUP"].astype(str).str.split(" ").str[0]
    df["SEASON"] = season_key
    df["GAME_ID_STR"] = df["GAME_ID"].astype(str).str.strip()
    return df


def load_game_results(season_key: str, season_path: str) -> pd.DataFrame:
    path = os.path.join(season_path, "processed", "game_results.csv")
    if not os.path.exists(path):
        return pd.DataFrame()
    df = pd.read_csv(path)
    df["SEASON"] = season_key
    df["GAME_ID_STR"] = df["GAME_ID"].astype(str).str.strip()
    return df


def compute_averages(games: list) -> dict:
    """Season averages over regular-season and postseason games; preseason games stay in the log only."""
    counted = [g for g in games if g.get("SEASON_TYPE") != "Pre Season"]
    played = [g for g in counted if not g["DID_NOT_PLAY"]]
    result = {"games_played": len(played), "games_total": len(counted)}
    for col in STAT_COLS:
        vals = [g[col] for g in played if g.get(col) is not None]
        result[col] = round(sum(vals) / len(vals), 2) if vals else None
    teams = []
    for g in games:
        t = g.get("TEAM_ABBREVIATION")
        if t and t not in teams:
            teams.append(t)
    result["teams"] = teams
    return result


def _game_info(row) -> dict:
    return {
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


def _game_header(gid_str, season_key, team_abbr, game_info, game_date, matchup, wl, season_type, dnp) -> dict:
    return {
        "GAME_ID": gid_str,
        "GAME_DATE": game_date,
        "SEASON": season_key,
        "TEAM_ABBREVIATION": team_abbr,
        "MATCHUP": matchup,
        "WL": wl,
        "SEASON_TYPE": season_type,
        "DID_NOT_PLAY": dnp,
        "HOME_TEAM_ABBREVIATION": game_info.get("HOME_TEAM_ABBREVIATION"),
        "HOME_TEAM_NAME": game_info.get("HOME_TEAM_NAME"),
        "HOME_SCORE": game_info.get("HOME_SCORE"),
        "AWAY_TEAM_ABBREVIATION": game_info.get("AWAY_TEAM_ABBREVIATION"),
        "AWAY_TEAM_NAME": game_info.get("AWAY_TEAM_NAME"),
        "AWAY_SCORE": game_info.get("AWAY_SCORE"),
        "WINNER_TEAM_ABBREVIATION": game_info.get("WINNER_TEAM_ABBREVIATION"),
        "IS_PLAYOFF": game_info.get("IS_PLAYOFF", False),
    }


def _matchup(team_abbr, home, away) -> str:
    return f"{home} vs. {away}" if team_abbr == home else f"{away} @ {home}"


def _stat_value(col, raw):
    if raw is None or (isinstance(raw, float) and (math.isnan(raw) or not math.isfinite(raw))):
        return None
    if isinstance(raw, float):
        return round(raw, 3) if col.endswith("_PCT") else (int(raw) if raw == int(raw) else round(raw, 1))
    return nan_safe(raw)


def build_player_season(season_key: str, season_path: str, roster: pd.DataFrame | None = None) -> dict:
    """Game logs, averages and team/name lookups for every player of one season.

    Returns ``{"games": {pid: [...]}, "averages": {pid: {...}}, "index": {pid: {...}}}`` where
    ``index`` holds the roster team, latest box score team and name used for player profiles.
    """
    index: dict = {}
    if roster is not None and not roster.empty:
        for r in roster.itertuples(index=False):
            entry = index.setdefault(int(r.PLAYER_ID), {})
            team = str(r.TEAM_ABBREVIATION).strip()
            if team:
                entry["roster_team"] = team
            name = str(getattr(r, "PLAYER_NAME", "") or "").strip()
            if name:
                entry["roster_name"] = name

    bs = load_player_logs(season_key, season_path)
    gr = load_game_results(season_key, season_path)
    games_by_player: dict = {}
    averages_by_player: dict = {}
    if bs.empty:
        return {"games": games_by_player, "averages": averages_by_player, "index": index}

    bs["DID_NOT_PLAY"] = bs["MIN"].isna() | (bs["MIN"] == 0)

    game_lookup: dict = {}
    team_games: dict = {}
    for _, row in gr.iterrows():
        gid = row["GAME_ID_STR"]
        game_lookup[gid] = _game_info(row)
        for col in ["HOME_TEAM_ABBREVIATION", "AWAY_TEAM_ABBREVIATION"]:
            abbr = nan_safe(row.get(col))
            if abbr:
                team_games.setdefault(abbr, set()).add(gid)

    for pid_raw, grp_df in bs.groupby("PLAYER_ID"):
        pid = int(pid_raw)
        teams = grp_df["TEAM_ABBREVIATION"].dropna().unique().tolist()
        entry = index.setdefault(pid, {})
        if teams:
            entry["boxscore_team"] = teams[-1]
        names = grp_df["PLAYER_NAME"].dropna()
        if len(names) > 0:
            entry["boxscore_name"] = str(names.iloc[0])

        player_rows = grp_df.set_index("GAME_ID_STR")
        appearances = sorted(
            (game_lookup.get(gid, {}).get("GAME_DATE") or nan_safe(r.get("GAME_DATE")), nan_safe(r.get("TEAM_ABBREVIATION")))
            for gid, r in player_rows.iterrows()
        )
        appearances = [(d, t) for d, t in appearances if d and t]

        def active_team(target_date: str):
            # The team of the nearest game the player actually appeared in.
            if not appearances:
                return teams[0] if teams else None
            if target_date <= appearances[0][0]:
                return appearances[0][1]
            if target_date >= appearances[-1][0]:
                return appearances[-1][1]
            target = datetime.strptime(target_date, "%Y-%m-%d")
            best, best_diff = None, timedelta(days=9999)
            for gdate, team in appearances:
                diff = abs(target - datetime.strptime(gdate, "%Y-%m-%d"))
                if diff < best_diff:
                    best, best_diff = team, diff
            return best

        all_team_game_ids: set = set()
        for team in teams:
            all_team_game_ids |= team_games.get(team, set())

        games = []
        for gid_str in sorted(all_team_game_ids, key=lambda g: game_lookup.get(g, {}).get("GAME_DATE") or ""):
            info = game_lookup.get(gid_str, {})
            home, away = info.get("HOME_TEAM_ABBREVIATION"), info.get("AWAY_TEAM_ABBREVIATION")
            if gid_str in player_rows.index:
                row = player_rows.loc[gid_str]
                if isinstance(row, pd.DataFrame):
                    row = row.iloc[0]
                dnp = bool(row.get("DID_NOT_PLAY", False))
                team_abbr = nan_safe(row.get("TEAM_ABBREVIATION"))
                g = _game_header(
                    gid_str, season_key, team_abbr, info,
                    info.get("GAME_DATE") or nan_safe(row.get("GAME_DATE")),
                    nan_safe(row.get("MATCHUP")) or _matchup(team_abbr, home, away),
                    nan_safe(row.get("WL")),
                    nan_safe(row.get("SEASON_TYPE")) or info.get("SEASON_TYPE"),
                    dnp,
                )
                if not dnp:
                    for col in STAT_COLS + ["PF"]:
                        g[col] = _stat_value(col, row.get(col) if col in row.index else None)
            else:
                game_date = info.get("GAME_DATE")
                if not game_date:
                    continue
                team_abbr = active_team(game_date)
                if team_abbr not in (home, away):
                    continue  # on another team at that date
                winner = info.get("WINNER_TEAM_ABBREVIATION")
                wl = ("W" if winner == team_abbr else "L") if winner else None
                g = _game_header(
                    gid_str, season_key, team_abbr, info, game_date,
                    _matchup(team_abbr, home, away), wl, info.get("SEASON_TYPE"), True,
                )
            games.append(g)

        if games:
            games_by_player[pid] = games
            averages_by_player[pid] = compute_averages(games)

    print(f"  {season_key}: {bs['PLAYER_ID'].nunique()} players, {len(game_lookup)} games", file=sys.stderr)
    return {"games": games_by_player, "averages": averages_by_player, "index": index}
