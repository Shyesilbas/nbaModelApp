import argparse
import json
import re
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from nba_api.stats.endpoints import playbyplayv3

ROOT = Path(__file__).resolve().parents[1]

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.ingestion.atomic_io import write_text_atomic
from src.ingestion.nba_api_client import call_nba_api

STAT_KEYS = ("pts", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "reb", "ast", "stl", "blk", "pf", "tov")


def clean_clock(clock_str: Any) -> str:
    if not isinstance(clock_str, str):
        return "12:00"
    clock_str = clock_str.replace("PT", "").replace("S", "")
    parts = clock_str.split("M")
    if len(parts) == 2:
        minutes = parts[0]
        seconds = parts[1].split(".")[0]
        return f"{minutes.zfill(2)}:{seconds.zfill(2)}"
    return clock_str


def clean_value(value: Any, default: Any = None) -> Any:
    if pd.isna(value):
        return default
    if isinstance(value, str):
        value = value.strip()
        return value if value else default
    return value


def as_int(value: Any) -> int | None:
    value = clean_value(value)
    if value is None:
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def pick(row: pd.Series, *names: str, default: Any = None) -> Any:
    for name in names:
        if name in row.index:
            value = clean_value(row.get(name), None)
            if value is not None:
                return value
    return default


def empty_stats() -> dict[str, int]:
    return {key: 0 for key in STAT_KEYS}


def snapshot(stats: dict[str, int]) -> dict[str, int]:
    return dict(stats)


def norm_game_id(value: Any) -> str:
    return str(value).split(".")[0].zfill(10)


def season_token(season: str) -> str:
    return season.replace("-", "_")


def season_from_game_id(game_id: str) -> str | None:
    gid = norm_game_id(game_id)
    if len(gid) < 5 or not gid.startswith("00"):
        return None
    try:
        start_year = 2000 + int(gid[3:5])
    except ValueError:
        return None
    return f"{start_year}-{str(start_year + 1)[-2:]}"


def raw_pbp_dir_for_season(season: str) -> Path:
    return ROOT / "data" / f"season={season}" / "raw" / "play_by_play"


def resolve_game_season(row: dict[str, Any], explicit_season: str | None = None) -> str | None:
    return explicit_season or row.get("SEASON") or season_from_game_id(str(row.get("GAME_ID") or ""))


def finals_prefix_for_season(season: str | None) -> str | None:
    if not season:
        return None
    try:
        return f"004{int(str(season).split('-')[0]) % 100:02d}004"
    except (TypeError, ValueError):
        return None


def row_matches_season_type(row: dict[str, Any], season_type: str, season: str | None) -> bool:
    if str(row.get("SEASON_TYPE")) == season_type:
        return True
    if season_type != "NBA Finals":
        return False
    prefix = finals_prefix_for_season(season or row.get("SEASON"))
    return bool(prefix and norm_game_id(row.get("GAME_ID")).startswith(prefix))


def is_three_pointer(description: str, sub_type: str) -> bool:
    text = f"{description} {sub_type}".upper()
    return "3PT" in text or "3-PT" in text


def made_free_throw(description: str) -> bool:
    text = description.upper()
    return "MISS" not in text and "FREE THROW" in text


def event_points(
    action_type: str,
    description: str,
    score_home: int,
    score_away: int,
    prev_home: int,
    prev_away: int,
) -> int:
    if action_type not in {"Made Shot", "Free Throw"}:
        return 0
    delta = max(0, int(score_home) + int(score_away) - int(prev_home) - int(prev_away))
    if delta:
        return delta
    if action_type == "Free Throw":
        return 1 if made_free_throw(description) else 0
    return 3 if "3PT" in description.upper() else 2


def parse_named_total(description: str, label: str) -> tuple[str | None, int | None]:
    match = re.search(rf"\(([^()]+?)\s+(\d+)\s+{label}\)", description, flags=re.IGNORECASE)
    if not match:
        return None, None
    return match.group(1).strip(), int(match.group(2))


def detect_badges(
    event: dict[str, Any],
    player_stats: defaultdict[tuple[str | None, str | None], dict[str, int]],
    quarter_player_points: defaultdict[tuple[int, str | None, str | None], int],
    team_scoring_run: dict[str, dict[str, Any]],
) -> list[str]:
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


def build_play_by_play_payload(
    game_id: str,
    home_team: str | None,
    away_team: str | None,
    start_period: int,
    end_period: int,
) -> dict[str, Any]:
    pbp = call_nba_api(
        playbyplayv3.PlayByPlayV3,
        game_id=game_id,
        start_period=start_period,
        end_period=end_period,
    )
    df = pbp.get_data_frames()[0]
    if df.empty:
        raise ValueError(f"No play-by-play rows returned for {game_id}")

    df["scoreHome_clean"] = pd.to_numeric(df["scoreHome"].replace("", np.nan)).ffill().fillna(0).astype(int)
    df["scoreAway_clean"] = pd.to_numeric(df["scoreAway"].replace("", np.nan)).ffill().fillna(0).astype(int)

    quarter_scores = []
    prev_home, prev_away = 0, 0
    for q in sorted(df["period"].dropna().unique()):
        q_df = df[df["period"] == q]
        if q_df.empty:
            continue
        last_row = q_df.iloc[-1]
        home_total = int(last_row["scoreHome_clean"])
        away_total = int(last_row["scoreAway_clean"])
        quarter_scores.append(
            {
                "quarter": f"Q{int(q)}",
                "home": home_total - prev_home,
                "away": away_total - prev_away,
                "home_total": home_total,
                "away_total": away_total,
            }
        )
        prev_home, prev_away = home_total, away_total

    events = []
    player_stats: defaultdict[tuple[str | None, str | None], dict[str, int]] = defaultdict(empty_stats)
    player_lookup: dict[str, dict[str, Any]] = {}
    quarter_player_points: defaultdict[tuple[int, str | None, str | None], int] = defaultdict(int)
    quarter_team_points: defaultdict[tuple[int, str | None], int] = defaultdict(int)
    team_scoring_run: dict[str, dict[str, Any]] = {}
    prev_home, prev_away = 0, 0

    for _, row in df.iterrows():
        period = int(row["period"])
        action_type = str(pick(row, "actionType", default="") or "")
        sub_type = str(pick(row, "subType", default="") or "")
        team = pick(row, "teamTricode", "teamAbbreviation", default=None)
        player_name = pick(row, "playerName", default=None)
        player_id = as_int(pick(row, "personId", "playerId", "PLAYER_ID", default=None))
        description = str(pick(row, "description", default="") or "")
        score_home = int(row["scoreHome_clean"])
        score_away = int(row["scoreAway_clean"])
        points_scored = event_points(action_type, description, score_home, score_away, prev_home, prev_away)
        assisted_name: str | None = None
        assisted_total: int | None = None

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
                quarter_player_points[(period, team, player_name)] += points_scored
                quarter_team_points[(period, team)] += points_scored
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
                    quarter_player_points[(period, team, player_name)] += 1
                    quarter_team_points[(period, team)] += 1
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
                player_stats[assist_key]["ast"] = max(player_stats[assist_key]["ast"] + 1, assisted_total or 0)

        stats_after = snapshot(player_stats[key]) if team and player_name else None
        event = {
            "period": period,
            "clock": clean_clock(row["clock"]),
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
            "quarter_player_points": quarter_player_points[(period, team, player_name)] if team and player_name else 0,
            "quarter_team_points": quarter_team_points[(period, team)] if team else 0,
        }
        event["badges"] = detect_badges(event, player_stats, quarter_player_points, team_scoring_run)
        events.append(event)
        prev_home, prev_away = score_home, score_away

    return {
        "game_id": game_id,
        "home_team": home_team,
        "away_team": away_team,
        "quarter_scores": quarter_scores,
        "events": events,
    }


def load_game_index(season: str | None = None) -> list[dict[str, Any]]:
    """Schedule + results rows from the pipeline data (one season, or every season)."""
    from scripts.season_utils import discover_seasons
    from src.frontend_store.builders import build_games_feed

    seasons = [season] if season else list(discover_seasons())
    rows: list[dict[str, Any]] = []
    for s in seasons:
        feed = build_games_feed(s)
        rows.extend(feed.astype(object).where(feed.notna(), None).to_dict(orient="records"))
    return rows


def select_games(args: argparse.Namespace) -> list[dict[str, Any]]:
    index = load_game_index(args.season)
    rows_by_gid = {norm_game_id(row.get("GAME_ID")): row for row in index if row.get("GAME_ID")}
    selected: list[dict[str, Any]] = []

    if args.game_id:
        for raw_gid in args.game_id:
            gid = norm_game_id(raw_gid)
            row = dict(rows_by_gid.get(gid, {}))
            row["GAME_ID"] = gid
            row.setdefault("HOME_TEAM_ABBREVIATION", args.home_team)
            row.setdefault("AWAY_TEAM_ABBREVIATION", args.away_team)
            selected.append(row)
    elif args.season:
        selected = [row for row in index if str(row.get("SEASON")) == args.season]
    else:
        raise ValueError("Provide --game-id or --season.")

    if args.season_type:
        allowed = {value.strip() for value in args.season_type}
        selected = [
            row
            for row in selected
            if any(row_matches_season_type(row, season_type, args.season) for season_type in allowed)
        ]

    if args.final_only:
        selected = [row for row in selected if str(row.get("GAME_STATUS", "")).lower() == "final"]

    seen = set()
    deduped = []
    for row in selected:
        gid = norm_game_id(row.get("GAME_ID"))
        if gid in seen:
            continue
        seen.add(gid)
        row["GAME_ID"] = gid
        deduped.append(row)

    deduped.sort(key=lambda row: (str(row.get("GAME_DATE") or ""), str(row.get("GAME_ID") or "")))
    if args.limit:
        deduped = deduped[: args.limit]
    return deduped


def write_payload(payload: dict[str, Any], out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{payload['game_id']}.json"
    write_text_atomic(json.dumps(payload, indent=2), out_path)
    return out_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch NBA play-by-play data and cache structured JSON under data/season=*/raw/play_by_play.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--game-id", nargs="+", help="One or more NBA game IDs.")
    target.add_argument("--season", help="Season label, e.g. 2025-26.")
    parser.add_argument("--season-type", action="append", help="Filter season mode by SEASON_TYPE. Repeatable.")
    parser.add_argument("--home-team", help="Fallback home abbreviation for --game-id not found in source.")
    parser.add_argument("--away-team", help="Fallback away abbreviation for --game-id not found in source.")
    parser.add_argument("--out-dir", help="Override output directory for PBP JSON cache. Defaults to data/season=<season>/raw/play_by_play.")
    parser.add_argument("--start-period", type=int, default=1)
    parser.add_argument("--end-period", type=int, default=4)
    parser.add_argument("--limit", type=int, help="Limit number of selected games, useful for smoke tests.")
    parser.add_argument("--sleep", type=float, default=0.6, help="Delay between API calls in seconds.")
    parser.add_argument("--force", action="store_true", help="Overwrite existing cached JSON files.")
    parser.add_argument("--dry-run", action="store_true", help="Print selected games without calling the NBA API.")
    parser.add_argument("--final-only", action=argparse.BooleanOptionalAction, default=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    games = select_games(args)
    out_dir = Path(args.out_dir) if args.out_dir else None

    if not games:
        print("No games selected.")
        return 0

    output_label = out_dir if out_dir else "data/season=<season>/raw/play_by_play"
    print(f"Selected {len(games)} game(s). Output: {output_label}")
    if args.dry_run:
        for idx, row in enumerate(games, start=1):
            gid = norm_game_id(row["GAME_ID"])
            season = resolve_game_season(row, args.season)
            target_dir = out_dir or raw_pbp_dir_for_season(season or "unknown")
            out_path = target_dir / f"{gid}.json"
            status = "exists" if out_path.exists() else "missing"
            print(
                f"[{idx}/{len(games)}] {gid} "
                f"{row.get('AWAY_TEAM_ABBREVIATION') or '?'} @ {row.get('HOME_TEAM_ABBREVIATION') or '?'} "
                f"{row.get('GAME_DATE') or ''} {row.get('SEASON_TYPE') or ''} [{status}]"
            )
        return 0

    written = 0
    skipped = 0
    failed = 0

    for idx, row in enumerate(games, start=1):
        gid = norm_game_id(row["GAME_ID"])
        season = resolve_game_season(row, args.season)
        if not season and not out_dir:
            print(f"  failed {gid}: unable to resolve season for default output path", file=sys.stderr)
            failed += 1
            continue
        target_dir = out_dir or raw_pbp_dir_for_season(str(season))
        out_path = target_dir / f"{gid}.json"
        if out_path.exists() and not args.force:
            print(f"[{idx}/{len(games)}] skip existing {gid}")
            skipped += 1
            continue

        home_team = row.get("HOME_TEAM_ABBREVIATION") or args.home_team
        away_team = row.get("AWAY_TEAM_ABBREVIATION") or args.away_team
        try:
            print(f"[{idx}/{len(games)}] fetching {gid} {away_team or '?'} @ {home_team or '?'}")
            payload = build_play_by_play_payload(
                gid,
                home_team=home_team,
                away_team=away_team,
                start_period=args.start_period,
                end_period=args.end_period,
            )
            path = write_payload(payload, target_dir)
            print(f"  wrote {path} ({len(payload['events'])} events)")
            written += 1
        except Exception as exc:
            print(f"  failed {gid}: {exc}", file=sys.stderr)
            failed += 1

        if args.sleep > 0 and idx < len(games):
            time.sleep(args.sleep)

    print(f"Done. written={written} skipped={skipped} failed={failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
