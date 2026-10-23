from __future__ import annotations

from typing import Any, Dict, List, Mapping, Sequence


TEAM_STAT_KEYS = [
    ("field_goals_made", "fgm"),
    ("field_goals_attempted", "fga"),
    ("field_goal_percentage", "fgp"),
    ("three_pointers_made", "fg3m"),
    ("three_pointers_attempted", "fg3a"),
    ("three_point_percentage", "fg3p"),
    ("free_throws_made", "ftm"),
    ("free_throws_attempted", "fta"),
    ("free_throw_percentage", "ftp"),
    ("total_rebounds", "reb"),
    ("offensive_rebounds", "oreb"),
    ("defensive_rebounds", "dreb"),
    ("assists", "ast"),
    ("steals", "stl"),
    ("blocks", "blk"),
    ("turnovers", "tov"),
    ("personal_fouls", "pf"),
    ("fast_break_points", "fbp"),
    ("points_in_paint", "pip"),
    ("second_chance_points", "scp"),
    ("bench_points", "bench"),
]


PLAYER_STAT_KEYS = [
    ("minutes", "min"),
    ("points", "pts"),
    ("rebounds", "reb"),
    ("assists", "ast"),
    ("steals", "stl"),
    ("blocks", "blk"),
    ("turnovers", "tov"),
    ("personal_fouls", "pf"),
    ("field_goals_made", "fgm"),
    ("field_goals_attempted", "fga"),
    ("field_goal_percentage", "fgp"),
    ("three_pointers_made", "fg3m"),
    ("three_pointers_attempted", "fg3a"),
    ("three_point_percentage", "fg3p"),
    ("free_throws_made", "ftm"),
    ("free_throws_attempted", "fta"),
    ("free_throw_percentage", "ftp"),
    ("plus_minus", "pm"),
    ("offensive_rebounds", "oreb"),
    ("defensive_rebounds", "dreb"),
]


def _pick(row: Mapping[str, Any], keys: Sequence[tuple[str, str]]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for src, dst in keys:
        if src in row and row[src] is not None:
            out[dst] = row[src]
    return out


def compact_game_payload(game: Mapping[str, Any], *, top_players: int = 8) -> Dict[str, Any]:
    """
    Convert a verbose boxscore/game payload into an AI-friendly compact payload.

    Design goals:
    - keep canonical identifiers and the minimum context needed for reasoning
    - use short stat keys to reduce token count
    - keep only top players plus the team aggregates
    - avoid repeating full team names unless needed once
    """

    home = game.get("home_team", {}) or {}
    away = game.get("away_team", {}) or {}
    arena = game.get("arena", {}) or {}

    player_rows = list(game.get("player_stats", []) or [])
    team_rows = list(game.get("team_stats", []) or [])
    leaders = game.get("game_leaders", {}) or {}

    compact_players: List[Dict[str, Any]] = []
    for row in player_rows[:top_players]:
        compact_players.append(
            {
                "id": row.get("player_id"),
                "n": row.get("player_name"),
                "t": row.get("team_id"),
                "p": row.get("position"),
                **_pick(row, PLAYER_STAT_KEYS),
            }
        )

    compact_teams: List[Dict[str, Any]] = []
    for row in team_rows:
        compact_teams.append(
            {
                "id": row.get("team_id"),
                **_pick(row, TEAM_STAT_KEYS),
            }
        )

    return {
        "gid": game.get("game_id"),
        "s": game.get("season"),
        "st": game.get("season_type"),
        "dt": game.get("game_date"),
        "tm": game.get("game_time"),
        "status": game.get("game_status"),
        "arena": {
            "n": arena.get("name"),
            "c": arena.get("city"),
            "s": arena.get("state"),
        },
        "teams": {
            "h": {
                "id": home.get("team_id"),
                "n": home.get("team_name"),
                "c": home.get("team_city"),
                "sc": home.get("score"),
                "q": home.get("quarter_scores", []),
            },
            "a": {
                "id": away.get("team_id"),
                "n": away.get("team_name"),
                "c": away.get("team_city"),
                "sc": away.get("score"),
                "q": away.get("quarter_scores", []),
            },
        },
        "stats": compact_teams,
        "players": compact_players,
        "leaders": {
            "pts": leaders.get("points"),
            "reb": leaders.get("rebounds"),
            "ast": leaders.get("assists"),
        },
        "officials": [
            {"id": o.get("official_id"), "n": o.get("name")}
            for o in (game.get("officials", []) or [])
        ],
    }


def expand_winner(payload: Mapping[str, Any]) -> str | None:
    """
    Convenience helper for downstream prompts:
    returns the most likely winner abbreviation from compact payload.
    """
    home = payload.get("teams", {}).get("h", {})
    away = payload.get("teams", {}).get("a", {})
    home_score = home.get("sc")
    away_score = away.get("sc")
    if home_score is None or away_score is None:
        return None
    return home.get("id") if home_score >= away_score else away.get("id")
