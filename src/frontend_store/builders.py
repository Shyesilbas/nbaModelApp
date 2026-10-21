"""Build the frontend store from pipeline data under ``data/``.

    build_season_store(season)   one season's games, box scores, details, player logs, PBP moments
    build_global_store()         seasons list, player profiles, season averages, trades

A closed season (Finals decided) whose store was built by the current STORE_VERSION is
skipped unless ``force=True``; the active season is rebuilt every time.
"""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone

import pandas as pd

from src.core.data_paths import get_data_paths
from src.core.season_utils import discover_seasons, normalize_season
from src.frontend_store.player_history import build_player_season, nan_safe
from src.frontend_store.season_status import CLOSED, finals_winner
from src.frontend_store.store import (
    GLOBAL_SCHEMA, ROOT, SEASON_SCHEMA, STORE_VERSION, build_db, connect_ro, dumps,
    global_db_path, read_doc, read_meta, season_db_path, stored_seasons,
)


def _log(msg: str) -> None:
    print(f"[frontend-store] {msg}", file=sys.stderr)


def _norm_gid(value) -> str:
    text = str(value or "").strip().split(".", 1)[0]
    return "".join(ch for ch in text if ch.isdigit()).zfill(10)


def _records(df: pd.DataFrame) -> list[dict]:
    """DataFrame rows as JSON-safe dicts (NaN -> null), matching the old JSON exports."""
    if df.empty:
        return []
    return json.loads(df.to_json(orient="records", double_precision=4, date_format="iso"))


def _read_csv(path, **kwargs) -> pd.DataFrame:
    return pd.read_csv(path, **kwargs) if path and os.path.exists(path) else pd.DataFrame()


def _iso_dates(df: pd.DataFrame) -> pd.DataFrame:
    if "GAME_DATE" in df.columns:
        df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce").dt.strftime("%Y-%m-%d")
    return df


def _overlay(base: pd.DataFrame, extra: pd.DataFrame, suffix: str, prefer_extra: bool) -> pd.DataFrame:
    """Left-join ``extra`` on GAME_ID and fold its columns into ``base``."""
    cols = [c for c in extra.columns if c != "GAME_DATE"]
    out = base.merge(extra[cols], on="GAME_ID", how="left", suffixes=("", suffix))
    for col in cols:
        side = col + suffix
        if col == "GAME_ID" or side not in out.columns:
            continue
        if col not in out.columns:
            out[col] = out[side]
        elif prefer_extra:
            out[col] = out[side].where(out[side].notna(), out[col])
        else:
            out[col] = out[col].where(out[col].notna(), out[side])
        out = out.drop(columns=[side])
    return out


def build_games_feed(season: str) -> pd.DataFrame:
    """Schedule rows, overlaid with final results and (for upcoming games) matchup context."""
    paths = get_data_paths(season)
    schedule = _iso_dates(_read_csv(paths.schedule_combined, dtype={"GAME_ID": str}))
    results = _iso_dates(_read_csv(paths.game_results, dtype={"GAME_ID": str}))
    context = _iso_dates(_read_csv(paths.upcoming_context, dtype={"GAME_ID": str}))
    games = schedule if not schedule.empty else results
    if games.empty:
        return games
    if not results.empty and games is not results:
        games = _overlay(games, results, "_RESULT", prefer_extra=True)
    if not context.empty:
        games = _overlay(games, context, "_CTX", prefer_extra=False)
    games["GAME_ID"] = games["GAME_ID"].map(_norm_gid)
    games["SEASON"] = season
    return games.sort_values(["GAME_DATE", "GAME_ID"]).reset_index(drop=True)


def _boxscores(season: str, kind: str) -> pd.DataFrame:
    path = ROOT / "data" / f"season={season}" / "raw" / "boxscores" / f"{kind}_boxscores.csv"
    df = _read_csv(path, dtype={"GAME_ID": str, "TEAM_ID": str})
    if not df.empty:
        df["GAME_ID"] = df["GAME_ID"].map(_norm_gid)
        df = _iso_dates(df).sort_values("GAME_DATE", ascending=False)
    return df


def _cached_summary(season: str, game_id: str) -> dict:
    # Only the on-disk cache: building the store must never call the NBA API.
    path = ROOT / "data" / f"season={season}" / "raw" / "game_summaries" / f"{game_id}.json"
    try:
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _leader(players: list[dict], stat: str):
    return max(players, key=lambda p: p.get(stat) or -1) if players else None


def build_game_detail(season: str, result: dict, players: list[dict]) -> dict:
    """Game header for the detail panel; box scores are served next to it, not inside it."""
    gid = _norm_gid(result.get("GAME_ID"))
    summary = _cached_summary(season, gid)
    arena = summary.get("arena") or {}
    location = str(result.get("LOCATION") or "")
    city, _, state = location.partition(",")

    def side(prefix: str) -> dict:
        score = result.get(f"{prefix}_SCORE")
        return {
            "team_id": result.get(f"{prefix}_TEAM_ABBREVIATION"),
            "team_name": result.get(f"{prefix}_TEAM_NAME"),
            "team_city": result.get(f"{prefix}_TEAM_CITY"),
            "score": int(score) if score is not None else None,
            "quarter_scores": result.get(f"{prefix}_QUARTER_SCORES"),
        }

    return {
        "game_id": gid,
        "season": season,
        "season_type": result.get("SEASON_TYPE"),
        "game_date": str(result.get("GAME_DATE")),
        "game_time": result.get("GAME_TIME"),
        "game_status": result.get("GAME_STATUS", "Final"),
        "arena": {
            "name": arena.get("name") or result.get("ARENA"),
            "city": arena.get("city") or (city.strip() or None),
            "state": arena.get("state") or (state.strip() or None),
        },
        "home_team": side("HOME"),
        "away_team": side("AWAY"),
        "game_leaders": {stat: _leader(players, key) for stat, key in
                         (("points", "PTS"), ("rebounds", "REB"), ("assists", "AST"))},
        "officials": summary.get("officials") or [],
        "game_result": result,
    }


def _pbp_moments(season: str):
    from src.frontend_store.pbp_moments import condense_payload

    pbp_dir = ROOT / "data" / f"season={season}" / "raw" / "play_by_play"
    for path in sorted(pbp_dir.glob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            _log(f"skipping unreadable PBP {path.name}: {exc}")
            continue
        yield _norm_gid(path.stem), condense_payload(payload)


def _analysis_csv(season: str, name: str) -> pd.DataFrame:
    return _read_csv(ROOT / "data" / f"season={season}" / "analysis" / name)


def _roster(season: str) -> pd.DataFrame:
    from src.analysis.live_roster_refresh import preferred_roster_path

    return _read_csv(preferred_roster_path(str(ROOT / "data" / f"season={season}" / "analysis")))


def season_store_is_current(season: str) -> bool:
    meta = read_meta(season_db_path(season))
    return meta.get("status") == CLOSED and meta.get("store_version") == STORE_VERSION


def build_season_store(season: str, force: bool = False) -> bool:
    """Build one season's store. Returns False when a sealed closed season was skipped."""
    season = normalize_season(season)
    if not force and season_store_is_current(season):
        _log(f"{season}: closed and sealed, skipped")
        return False

    started = time.time()
    season_path = str(ROOT / "data" / f"season={season}")
    champion = finals_winner(season)
    games = build_games_feed(season)
    results = _iso_dates(_read_csv(get_data_paths(season).game_results, dtype={"GAME_ID": str}))
    team_bs = _boxscores(season, "team")
    player_bs = _boxscores(season, "player")
    roster = _roster(season)
    history = build_player_season(season, season_path, roster)

    player_rows_by_game: dict[str, list[dict]] = {}
    for row in _records(player_bs):
        player_rows_by_game.setdefault(row["GAME_ID"], []).append(row)

    with build_db(season_db_path(season), SEASON_SCHEMA) as conn:
        conn.executemany(
            "INSERT INTO games VALUES (?, ?, ?)",
            [(r["GAME_ID"], r.get("GAME_DATE"), dumps(r)) for r in _records(games)],
        )
        conn.executemany(
            "INSERT INTO team_boxscores VALUES (?, ?)",
            [(r["GAME_ID"], dumps(r)) for r in _records(team_bs)],
        )
        conn.executemany(
            "INSERT INTO player_boxscores VALUES (?, ?, ?)",
            [(gid, r.get("PLAYER_ID"), dumps(r)) for gid, rows in player_rows_by_game.items() for r in rows],
        )
        conn.executemany(
            "INSERT OR REPLACE INTO game_details VALUES (?, ?)",
            [
                # Feed rows carry the result plus the schedule's ARENA/LOCATION.
                (r["GAME_ID"], dumps(build_game_detail(season, r, player_rows_by_game.get(r["GAME_ID"], []))))
                for r in _records(games)
                if r.get("HOME_SCORE") is not None
            ],
        )
        conn.executemany(
            "INSERT INTO player_games VALUES (?, ?, ?)",
            [(str(pid), dumps(g), dumps(history["averages"][pid])) for pid, g in history["games"].items()],
        )
        conn.executemany("INSERT INTO pbp_moments VALUES (?, ?)", [(gid, dumps(m)) for gid, m in _pbp_moments(season)])
        docs = {
            "game_results": _records(results),
            "team_rosters": _records(roster),
            "multi_team_players": _records(_analysis_csv(season, "multi_team_players.csv")),
            "player_index": {str(pid): v for pid, v in history["index"].items()},
        }
        conn.executemany("INSERT INTO docs VALUES (?, ?)", [(k, dumps(v)) for k, v in docs.items()])
        meta = {
            "season": season,
            "status": CLOSED if champion else "active",
            "champion": champion or "",
            "store_version": STORE_VERSION,
            "built_at": datetime.now(timezone.utc).isoformat(),
        }
        conn.executemany("INSERT INTO meta VALUES (?, ?)", list(meta.items()))

    _log(f"{season}: {meta['status']} store built in {time.time() - started:.1f}s "
         f"({len(games)} games, {len(history['games'])} players)")
    return True


def _player_metadata() -> dict[int, dict]:
    path = ROOT / "data" / "reference" / "player_metadata.csv"
    df = _read_csv(path)
    fields = ["HEIGHT", "WEIGHT", "COLLEGE", "COUNTRY", "OFFICIAL_POSITION", "POSITION_GROUP",
              "DRAFT_YEAR", "DRAFT_ROUND", "DRAFT_NUMBER", "FROM_YEAR", "TO_YEAR", "ROSTER_STATUS"]
    meta = {}
    for _, row in df.iterrows():
        meta[int(row["PLAYER_ID"])] = {
            "PLAYER_NAME": nan_safe(row.get("PLAYER_NAME")),
            **{f: nan_safe(row.get(f)) for f in fields},
        }
    return meta


def build_global_store() -> None:
    """Cross-season views, assembled from the season stores (cheap: no raw data is reread)."""
    started = time.time()
    seasons = stored_seasons()
    current_team: dict[int, str] = {}
    names: dict[int, str] = {}
    averages: dict[str, dict] = {}
    for season in seasons:  # ascending, so later seasons win the current team
        conn = connect_ro(season_db_path(season))
        try:
            index = read_doc(conn, "player_index", {})
            for pid_str, entry in index.items():
                pid = int(pid_str)
                for team_key in ("roster_team", "boxscore_team"):
                    if entry.get(team_key):
                        current_team[pid] = entry[team_key]
                for name_key in ("roster_name", "boxscore_name"):
                    if entry.get(name_key):
                        names.setdefault(pid, entry[name_key])
            for pid, avg_json in conn.execute("SELECT player_id, averages_json FROM player_games"):
                averages.setdefault(pid, {})[season] = json.loads(avg_json)
        finally:
            conn.close()

    meta = _player_metadata()
    profiles = []
    for pid in set(current_team) | {int(p) for p in averages}:
        m = meta.get(pid, {})
        team = current_team.get(pid)
        profiles.append({
            "PLAYER_ID": pid,
            "PLAYER_NAME": m.get("PLAYER_NAME") or names.get(pid, ""),
            "CURRENT_TEAM": team,
            "CURRENT_TEAM_ABBREVIATION": team,
            **{k: v for k, v in m.items() if k != "PLAYER_NAME"},
        })
    profiles.sort(key=lambda p: p.get("PLAYER_NAME") or "")

    from src.frontend_store.export_trades import build_trades

    docs = {
        "seasons": seasons,
        "player_profiles": profiles,
        "player_season_averages": averages,
        "trades": build_trades(),
    }
    with build_db(global_db_path(), GLOBAL_SCHEMA) as conn:
        conn.executemany("INSERT INTO docs VALUES (?, ?)", [(k, dumps(v)) for k, v in docs.items()])
        conn.execute("INSERT INTO meta VALUES ('built_at', ?)", (datetime.now(timezone.utc).isoformat(),))
    _log(f"global store built in {time.time() - started:.1f}s ({len(profiles)} players, {len(seasons)} seasons)")


def build_frontend_store(seasons: list[str] | None = None, force: bool = False) -> None:
    """Build the given seasons (default: every season with data), then the global store."""
    for season in seasons or list(discover_seasons()):
        build_season_store(season, force=force)
    build_global_store()
