"""Unit tests for ESPN cloud ingestion adapter and cloud morning sync helpers."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from scripts.ops.cloud_morning_sync import find_missing_due_games
from src.features.pbp_situational import parse_pbp_file
from src.ingestion.espn_games_fetcher import (
    FALLBACK_PLAYER_ID_BASE,
    NBA_TEAM_META,
    normalize_espn_abbr,
    normalize_player_name,
    parse_espn_summary,
    resolve_player_id,
)
from src.ingestion.player_games_fetcher import EXPECTED_COLUMNS as PLAYER_COLUMNS
from src.ingestion.starters_fetcher import STARTER_COLUMNS
from src.ingestion.team_games_fetcher import EXPECTED_COLUMNS as TEAM_COLUMNS
from src.validation.contracts import check_player_games, check_team_games


HOME_NAMES = ["Alex Alpha", "Ben Bravo", "Carl Charlie", "Dan Delta", "Eli Echo", "Finn Foxtrot"]
AWAY_NAMES = ["Gus Golf", "Hal Hotel", "Ian India", "Jay Juliet", "Ken Kilo"]


def _sample_espn_summary(periods: int = 4) -> dict:
    home_players = [
        {
            "athlete": {"id": str(100 + i), "displayName": name},
            "starter": i < 5,
            "didNotPlay": False,
            "stats": ["32", "20", "8-15", "2-5", "2-2", "6", "4", "2", "1", "1", "2", "4", "2", "+5"],
        }
        for i, name in enumerate(HOME_NAMES)
    ] + [
        {
            "athlete": {"id": "199", "displayName": "Home Bench DNP"},
            "starter": False,
            "didNotPlay": True,
            "stats": [],
        }
    ]
    away_players = [
        {
            "athlete": {"id": str(200 + i), "displayName": name},
            "starter": i < 5,
            "didNotPlay": False,
            "stats": ["30", "18", "7-14", "2-6", "2-3", "5", "3", "2", "1", "0", "1", "4", "3", "-5"],
        }
        for i, name in enumerate(AWAY_NAMES)
    ] + [
        {
            "athlete": {"id": "77777", "displayName": "Brand New Rookie"},
            "starter": False,
            "didNotPlay": False,
            "stats": ["12", "6", "2-4", "1-2", "1-2", "2", "1", "0", "0", "0", "0", "2", "1", "-2"],
        }
    ]
    labels = ["MIN", "PTS", "FG", "3PT", "FT", "REB", "AST", "TO", "STL", "BLK", "OREB", "DREB", "PF", "+/-"]
    linescores = [{"displayValue": "25"} for _ in range(periods)]

    return {
        "header": {
            "competitions": [
                {
                    "competitors": [
                        {"id": "18", "homeAway": "home", "score": "120", "linescores": linescores, "team": {"abbreviation": "NY"}},
                        {"id": "9", "homeAway": "away", "score": "114", "linescores": linescores, "team": {"abbreviation": "GS"}},
                    ]
                }
            ]
        },
        "boxscore": {
            "teams": [
                {
                    "team": {"abbreviation": "NY"},
                    "statistics": [
                        {"name": "fieldGoalsMade-fieldGoalsAttempted", "displayValue": "45-88"},
                        {"name": "threePointFieldGoalsMade-threePointFieldGoalsAttempted", "displayValue": "14-36"},
                        {"name": "freeThrowsMade-freeThrowsAttempted", "displayValue": "16-20"},
                        {"name": "offensiveRebounds", "displayValue": "10"},
                        {"name": "defensiveRebounds", "displayValue": "34"},
                        {"name": "totalRebounds", "displayValue": "44"},
                        {"name": "assists", "displayValue": "28"},
                        {"name": "steals", "displayValue": "8"},
                        {"name": "blocks", "displayValue": "5"},
                        {"name": "turnovers", "displayValue": "12"},
                        {"name": "teamTurnovers", "displayValue": "1"},
                        {"name": "totalTurnovers", "displayValue": "13"},
                        {"name": "fouls", "displayValue": "19"},
                    ],
                },
                {
                    "team": {"abbreviation": "GS"},
                    "statistics": [
                        {"name": "fieldGoalsMade-fieldGoalsAttempted", "displayValue": "42-90"},
                        {"name": "threePointFieldGoalsMade-threePointFieldGoalsAttempted", "displayValue": "16-42"},
                        {"name": "freeThrowsMade-freeThrowsAttempted", "displayValue": "14-18"},
                        {"name": "offensiveRebounds", "displayValue": "9"},
                        {"name": "defensiveRebounds", "displayValue": "31"},
                        {"name": "totalRebounds", "displayValue": "40"},
                        {"name": "assists", "displayValue": "25"},
                        {"name": "steals", "displayValue": "7"},
                        {"name": "blocks", "displayValue": "3"},
                        {"name": "turnovers", "displayValue": "14"},
                        {"name": "teamTurnovers", "displayValue": "0"},
                        {"name": "totalTurnovers", "displayValue": "14"},
                        {"name": "fouls", "displayValue": "21"},
                    ],
                },
            ],
            "players": [
                {"team": {"abbreviation": "NY"}, "statistics": [{"labels": labels, "athletes": home_players}]},
                {"team": {"abbreviation": "GS"}, "statistics": [{"labels": labels, "athletes": away_players}]},
            ],
        },
        "plays": [
            {"period": {"number": 1}, "clock": {"displayValue": "11:40"}, "scoringPlay": True, "scoreValue": 2, "homeScore": 2, "awayScore": 0, "team": {"id": "18"}, "type": {"text": "Layup"}, "text": "Makes layup"},
            {"period": {"number": 4}, "clock": {"displayValue": "45.2"}, "scoringPlay": True, "scoreValue": 3, "homeScore": 118, "awayScore": 114, "team": {"id": "18"}, "type": {"text": "3PT"}, "text": "Makes three"},
            {"period": {"number": periods}, "clock": {"displayValue": "12.0"}, "scoringPlay": True, "scoreValue": 2, "homeScore": 120, "awayScore": 114, "team": {"id": "18"}, "type": {"text": "Layup"}, "text": "Seals game"},
        ],
    }


def test_espn_abbr_and_name_normalization():
    assert normalize_espn_abbr("NY") == "NYK"
    assert normalize_espn_abbr("GS") == "GSW"
    assert normalize_espn_abbr("WSH") == "WAS"
    assert normalize_espn_abbr("UTAH") == "UTA"
    assert normalize_espn_abbr("BOS") == "BOS"
    assert normalize_player_name("Luka Dončić Jr.") == "luka doncic"


def test_parse_espn_summary_matches_contracts_and_pbp(tmp_path: Path):
    lookup = {normalize_player_name(name): 1000 + i for i, name in enumerate(HOME_NAMES)}
    lookup.update({normalize_player_name(name): 2000 + i for i, name in enumerate(AWAY_NAMES)})

    summary = _sample_espn_summary(periods=5)  # 1OT -> 265 team minutes
    team_df, player_df, starters_df, pbp_payload, unmatched = parse_espn_summary(
        summary,
        game_id="0022600300",
        game_date="2026-11-19",
        season="2026-27",
        season_type="Regular Season",
        home_abbr="NYK",
        away_abbr="GSW",
        team_meta=NBA_TEAM_META,
        player_lookup=lookup,
    )

    assert list(team_df.columns) == TEAM_COLUMNS
    assert list(player_df.columns) == PLAYER_COLUMNS
    assert list(starters_df.columns) == STARTER_COLUMNS

    check_team_games(team_df)
    check_player_games(player_df)

    assert len(team_df) == 2
    assert set(team_df["MIN"]) == {265}
    home_row = team_df[team_df["TEAM_ABBREVIATION"] == "NYK"].iloc[0]
    assert home_row["WL"] == "W"
    assert home_row["PTS"] == 120
    assert home_row["TOV"] == 12
    assert home_row["PLUS_MINUS"] == 6.0
    assert home_row["MATCHUP"] == "NYK vs. GSW"

    # 6 home played (1 DNP skipped) + 6 away played (including debut rookie)
    assert len(player_df) == 12
    assert len(unmatched) == 1
    assert unmatched[0][2] == "Brand New Rookie"
    assert unmatched[0][3] == FALLBACK_PLAYER_ID_BASE + 77777

    per_team_starters = starters_df.groupby("TEAM_ABBREVIATION")["IS_STARTER"].sum().to_dict()
    assert per_team_starters == {"NYK": 5, "GSW": 5}

    assert pbp_payload is not None
    assert pbp_payload["events"][1]["clock"] == "00:45"
    pbp_file = tmp_path / "0022600300.json"
    pbp_file.write_text(json.dumps(pbp_payload), encoding="utf-8")
    rec = parse_pbp_file(str(pbp_file))
    assert rec is not None
    assert rec["GAME_ID"] == "0022600300"
    assert rec["HOME_TEAM"] == "NYK"
    assert rec["AWAY_TEAM"] == "GSW"
    assert rec["CLUTCH_HOME_PTS"] == 3


def test_resolve_player_id_deterministic_fallback():
    pid1, ok1 = resolve_player_id("Unknown Debut Player", "54321", {})
    pid2, ok2 = resolve_player_id("Unknown Debut Player", "54321", {})
    assert not ok1 and not ok2
    assert pid1 == pid2 == FALLBACK_PLAYER_ID_BASE + 54321


def test_find_missing_due_games_respects_cutoff(monkeypatch, tmp_path: Path):
    sched_csv = tmp_path / "schedule.csv"
    team_csv = tmp_path / "team_games.csv"
    player_csv = tmp_path / "player_games.csv"

    pd.DataFrame([
        {"GAME_ID": "0022600100", "GAME_DATE": "2026-11-18", "GAME_START_UTC": "2026-11-19T00:00:00Z", "HOME_TEAM_ABBREVIATION": "BOS", "AWAY_TEAM_ABBREVIATION": "NYK", "SEASON_TYPE": "Regular Season"},
        {"GAME_ID": "0022600101", "GAME_DATE": "2026-11-18", "GAME_START_UTC": "2026-11-19T03:00:00Z", "HOME_TEAM_ABBREVIATION": "LAL", "AWAY_TEAM_ABBREVIATION": "GSW", "SEASON_TYPE": "Regular Season"},
        {"GAME_ID": "0022600102", "GAME_DATE": "2026-11-19", "GAME_START_UTC": "2026-11-20T00:00:00Z", "HOME_TEAM_ABBREVIATION": "MIA", "AWAY_TEAM_ABBREVIATION": "ORL", "SEASON_TYPE": "Regular Season"},
        {"GAME_ID": "0032600001", "GAME_DATE": "2026-11-18", "GAME_START_UTC": "2026-11-19T01:00:00Z", "HOME_TEAM_ABBREVIATION": "EST", "AWAY_TEAM_ABBREVIATION": "WST", "SEASON_TYPE": "All Star"},
    ]).to_csv(sched_csv, index=False)

    # 0022600100 already complete in both team & player logs
    pd.DataFrame([
        {"GAME_ID": "0022600100", "TEAM_ID": 1},
        {"GAME_ID": "0022600100", "TEAM_ID": 2},
    ]).to_csv(team_csv, index=False)
    pd.DataFrame([{"Game_ID": "0022600100", "Player_ID": 10}]).to_csv(player_csv, index=False)

    class _FakePaths:
        raw_schedule = str(sched_csv)
        raw_finals_schedule = str(tmp_path / "missing_finals.csv")
        team_games_raw = str(team_csv)
        player_games_raw = str(player_csv)

    monkeypatch.setattr("scripts.ops.cloud_morning_sync.get_data_paths", lambda season: _FakePaths())

    # At 06:00 UTC (09:00 TRT): 0022600101 started 3h ago (due & missing); 0022600102 hasn't started; 003* ignored.
    now = datetime(2026, 11, 19, 6, 0, tzinfo=timezone.utc)
    missing = find_missing_due_games("2026-27", now_utc=now)
    assert missing["GAME_ID"].tolist() == ["0022600101"]
