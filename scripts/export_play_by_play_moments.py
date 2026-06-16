#!/usr/bin/env python3
"""Export condensed play-by-play moments for archive browsing.

This keeps the quarter scores and only the moments that matter for a human scan:
- scoring plays
- highlight/badge plays
- clutch plays late in Q4/OT
- lead changes and ties
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.season_utils import discover_seasons, normalize_season

DEFAULT_SOURCE_ROOT = REPO_ROOT / "data"
DEFAULT_OUT_DIR = REPO_ROOT / "data" / "frontend" / "play_by_play_moments"


def norm_game_id(value: Any) -> str:
    text = str(value or "").split(".")[0]
    digits = re.sub(r"\D", "", text)
    return digits.zfill(10)


def parse_clock(clock: str | None) -> int:
    if not clock:
        return 12 * 60
    text = str(clock).strip().replace("PT", "").replace("S", "")
    if "M" not in text:
        return 12 * 60
    minutes, seconds = text.split("M", 1)
    try:
        return int(minutes) * 60 + int(float(seconds))
    except ValueError:
        return 12 * 60


def should_keep_event(event: dict[str, Any], prev_diff: int | None, period: int) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    pts = int(event.get("points_scored") or 0)
    badges = event.get("badges") or []
    clock_remaining = parse_clock(str(event.get("clock") or ""))
    diff_after = int(event.get("score_home") or 0) - int(event.get("score_away") or 0)

    if badges:
        reasons.append("badge")
    if period >= 4 and clock_remaining <= 5 * 60 and pts > 0:
        reasons.append("clutch")
    if prev_diff is not None and pts > 0:
        if prev_diff == 0 or diff_after == 0 or (prev_diff > 0 > diff_after) or (prev_diff < 0 < diff_after):
            reasons.append("lead_change")

    return bool(reasons), reasons


def is_three_pointer(event: dict[str, Any]) -> bool:
    text = f"{event.get('description') or ''} {event.get('sub_type') or ''}".upper()
    return "3PT" in text or "3-PT" in text


def milestone_reasons(event: dict[str, Any]) -> list[str]:
    reasons: list[str] = []
    stats = event.get("player_stats_after") or {}
    if not isinstance(stats, dict):
        return reasons

    pts = int(stats.get("pts") or 0)
    reb = int(stats.get("reb") or 0)
    ast = int(stats.get("ast") or 0)
    stl = int(stats.get("stl") or 0)
    blk = int(stats.get("blk") or 0)

    if pts >= 30:
        reasons.append("30_pt_game")
    elif pts >= 20 and int(event.get("points_scored") or 0) > 0:
        reasons.append("20_pt_game")

    if pts >= 10 and reb >= 10:
        reasons.append("double_double")
    if pts >= 10 and reb >= 10 and ast >= 10:
        reasons.append("triple_double")
    if ast >= 10:
        reasons.append("10_ast")
    if reb >= 15:
        reasons.append("15_reb")
    if stl >= 5:
        reasons.append("5_stl")
    if blk >= 5:
        reasons.append("5_blk")

    return reasons


def condense_payload(payload: dict[str, Any]) -> dict[str, Any]:
    events = payload.get("events", [])
    last_index_by_period: dict[int, int] = {}
    for idx, event in enumerate(events):
        try:
            period = int(event.get("period") or 0)
        except (TypeError, ValueError):
            continue
        last_index_by_period[period] = idx

    condensed_events: list[dict[str, Any]] = []
    prev_diff = None
    scoring_events = 0
    highlight_events = 0
    total_events = len(events)
    final_five_start = max(0, total_events - 5)
    last_three_made_team: str | None = None
    last_three_made_player: str | None = None
    last_three_made_index: int | None = None
    team_scoring_run: dict[str, int] = {}

    for idx, event in enumerate(events):
        period = int(event.get("period") or 0)
        keep = idx >= final_five_start
        reasons: list[str] = ["final_5"] if keep else []
        if not keep:
            base_keep, base_reasons = should_keep_event(event, prev_diff, period)
            if base_keep:
                keep = True
                reasons.extend(base_reasons)

        diff_after = int(event.get("score_home") or 0) - int(event.get("score_away") or 0)
        prev_diff = diff_after

        if event.get("points_scored", 0):
            scoring_events += 1
        if event.get("badges"):
            highlight_events += 1

        points_scored = int(event.get("points_scored") or 0)
        team = event.get("team")
        player = event.get("player_name")
        action_type = str(event.get("action_type") or "")

        if points_scored > 0 and team:
            team_scoring_run[team] = team_scoring_run.get(team, 0) + points_scored
            for other_team in list(team_scoring_run.keys()):
                if other_team != team:
                    team_scoring_run[other_team] = 0
            if team_scoring_run[team] >= 6:
                reasons.append("team_run")
                keep = True
        else:
            if action_type not in {"Free Throw", "Made Shot"}:
                team_scoring_run = {k: 0 for k in team_scoring_run}

        if points_scored == 3 and is_three_pointer(event):
            if last_three_made_team == team:
                reasons.append("back_to_back_3")
                keep = True
            if last_three_made_player == player:
                reasons.append("player_3_run")
                keep = True
            last_three_made_team = team
            last_three_made_player = player
            last_three_made_index = idx

        if points_scored > 0:
            milestone = milestone_reasons(event)
            if milestone:
                reasons.extend(milestone)
                keep = True

        if idx == last_index_by_period.get(period):
            keep = True
            reasons = sorted(set(reasons + ["quarter_end"]))

        if not keep:
            continue

        slim = {
            "period": event.get("period"),
            "clock": event.get("clock"),
            "action_type": event.get("action_type"),
            "sub_type": event.get("sub_type"),
            "team": event.get("team"),
            "player_name": event.get("player_name"),
            "description": event.get("description"),
            "score_home": event.get("score_home"),
            "score_away": event.get("score_away"),
            "points_scored": event.get("points_scored", 0),
            "badges": event.get("badges", []),
            "moment_reasons": reasons,
        }
        if "player_id" in event:
            slim["player_id"] = event.get("player_id")
        if "player_stats_after" in event:
            stats = event.get("player_stats_after") or {}
            if isinstance(stats, dict):
                slim["player_stats_after"] = {
                    key: stats.get(key)
                    for key in ("pts", "reb", "ast", "stl", "blk", "tov")
                    if key in stats
                }
        condensed_events.append(slim)

    return {
        "game_id": payload.get("game_id"),
        "home_team": payload.get("home_team"),
        "away_team": payload.get("away_team"),
        "quarter_scores": payload.get("quarter_scores", []),
        "events": condensed_events,
        "is_condensed": True,
        "source_event_count": len(events),
        "event_count": len(condensed_events),
        "scoring_event_count": scoring_events,
        "highlight_event_count": highlight_events,
    }


def build_moments_pack(source_root: Path, out_dir: Path) -> None:
    seasons = discover_seasons()
    out_dir.mkdir(parents=True, exist_ok=True)

    for season, season_path in seasons.items():
        src_dir = Path(season_path) / "raw" / "play_by_play"
        if not src_dir.exists():
            continue

        season_out = out_dir / season
        season_out.mkdir(parents=True, exist_ok=True)

        for src_file in sorted(src_dir.glob("*.json")):
            payload = json.loads(src_file.read_text(encoding="utf-8"))
            condensed = condense_payload(payload)
            (season_out / src_file.name).write_text(json.dumps(condensed, indent=2), encoding="utf-8")

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "version": hashlib.sha256(
            json.dumps(sorted(str(p) for p in out_dir.rglob("*.json")), separators=(",", ":")).encode("utf-8")
        ).hexdigest()[:16],
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export condensed play-by-play moments.")
    parser.add_argument(
        "--out-dir",
        default=str(DEFAULT_OUT_DIR),
        help="Output directory for the condensed moment pack.",
    )
    args = parser.parse_args()

    build_moments_pack(DEFAULT_SOURCE_ROOT, Path(args.out_dir).resolve())
    print(f"Play-by-play moments written to {Path(args.out_dir).resolve()}")


if __name__ == "__main__":
    main()
