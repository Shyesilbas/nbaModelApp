"""Rebuild on-court lineups from cached play-by-play and cut each game into stints.

The cached feed names the player leaving on a substitution (``player_id``) but gives the player entering only as a
last name inside ``description`` ("SUB: Clarkson FOR Markkanen"). Entering players are therefore resolved against the
game's box score roster, excluding players already on court. Period starters are the players whose first appearance in
the period is not a substitution in, topped up from the previous period's closing lineup.

A stint is a stretch of game time with a fixed ten-player lineup. Output rows carry elapsed seconds and the points each
side scored inside the stint. Box score MIN and PLUS_MINUS are the quality check: on-court margin must equal PLUS_MINUS.
"""
from __future__ import annotations

import difflib
import json
import re
import unicodedata
from pathlib import Path
from typing import Any

import pandas as pd

REGULATION_SECONDS = 720
OVERTIME_SECONDS = 300


def _norm(name: Any) -> str:
    text = unicodedata.normalize("NFKD", str(name or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9 ]", "", text.lower()).strip()


def _period_length(period: int) -> int:
    return REGULATION_SECONDS if period <= 4 else OVERTIME_SECONDS


def _period_start(period: int) -> int:
    if period <= 4:
        return (period - 1) * REGULATION_SECONDS
    return 4 * REGULATION_SECONDS + (period - 5) * OVERTIME_SECONDS


def _elapsed(period: int, clock: Any) -> int:
    match = re.match(r"^(\d+):(\d+)", str(clock or ""))
    remaining = int(match.group(1)) * 60 + int(match.group(2)) if match else 0
    return _period_start(period) + _period_length(period) - remaining


_SUFFIXES = {"jr", "sr", "ii", "iii", "iv"}


def _strip_suffix(name: str) -> str:
    tokens = name.split()
    while len(tokens) > 1 and tokens[-1] in _SUFFIXES:
        tokens.pop()
    return " ".join(tokens)


class _Roster:
    """Box score players of one game: id -> team, and name lookup per team."""

    def __init__(self, box: pd.DataFrame):
        self.team_of = dict(zip(box["PLAYER_ID"].astype(int), box["TEAM_ABBREVIATION"]))
        self.names = {int(pid): _strip_suffix(_norm(name)) for pid, name in zip(box["PLAYER_ID"], box["PLAYER_NAME"])}

    def candidates(self, team: str, pbp_name: str, excluded: set[int]) -> list[int]:
        """Team players not in ``excluded`` matching the feed name: surname, "X. Surname" initials, or a close spelling."""
        raw = str(pbp_name or "").strip()
        initial = None
        if re.match(r"^[A-Za-z]{1,2}\.\s+\S", raw):
            initial, raw = raw.split(".", 1)
            initial = _norm(initial)
        target = _strip_suffix(_norm(raw))
        pool = [pid for pid, t in self.team_of.items() if t == team and pid not in excluded]

        def first_ok(pid: int) -> bool:
            return initial is None or self.names[pid].startswith(initial)

        exact = [p for p in pool if first_ok(p) and (self.names[p] == target or self.names[p].endswith(" " + target))]
        if exact:
            return exact
        scored = []
        for p in pool:
            if first_ok(p):
                ratio = difflib.SequenceMatcher(None, self.names[p].split(" ")[-1], target.split(" ")[-1]).ratio()
                if ratio >= 0.75:
                    scored.append((ratio, p))
        return [p for _, p in sorted(scored, reverse=True)]


_SUB = re.compile(r"SUB:\s*(.+?)\s+FOR\s+(.+)$")


def _sub_in_name(description: str) -> str | None:
    match = _SUB.match(str(description or "").strip())
    return match.group(1) if match else None


def _period_starters(events: list[dict], roster: _Roster, teams: tuple[str, str], previous: dict[str, set[int]]) -> dict[str, set[int]]:
    entered: set[int] = set()
    present: dict[str, set[int]] = {t: set() for t in teams}
    starters: dict[str, set[int]] = {t: set() for t in teams}
    for e in events:
        pid = e.get("player_id")
        if e.get("action_type") == "Substitution":
            out_id = int(pid) if pid else None
            team = roster.team_of.get(out_id)
            if team not in teams:
                continue
            if out_id not in entered:
                starters[team].add(out_id)
            present[team].discard(out_id)
            incoming = roster.candidates(team, _sub_in_name(e.get("description")) or "", present[team] | starters[team])
            if incoming:
                entered.add(incoming[0])
                present[team].add(incoming[0])
        elif pid and int(pid) in roster.team_of:
            pid = int(pid)
            team = roster.team_of[pid]
            if pid not in entered and pid not in present[team]:
                starters[team].add(pid)
            present[team].add(pid)
    out = {}
    for team in teams:
        chosen = set(starters[team])
        if len(chosen) < 5:
            for pid in sorted(previous.get(team, set()) - entered - chosen):
                if len(chosen) == 5:
                    break
                chosen.add(pid)
        out[team] = chosen
    return out


def extract_stints(game: dict, box: pd.DataFrame) -> tuple[list[dict], dict]:
    """Stints of one game and a status dict (``ok`` plus reasons)."""
    home, away = game["home_team"], game["away_team"]
    teams = (home, away)
    roster = _Roster(box)
    status = {"ok": True, "reasons": []}
    by_period: dict[int, list[dict]] = {}
    for e in game["events"]:
        if isinstance(e.get("period"), int) and e["period"] >= 1:
            by_period.setdefault(e["period"], []).append(e)

    stints: list[dict] = []
    previous: dict[str, set[int]] = {t: set() for t in teams}
    score = (0, 0)
    for period in sorted(by_period):
        events = by_period[period]
        lineup = _period_starters(events, roster, teams, previous)
        if any(len(lineup[t]) != 5 for t in teams):
            status["ok"] = False
            status["reasons"].append(f"period {period}: starters {[len(lineup[t]) for t in teams]}")
            break
        stint_start = _period_start(period)
        stint_score = score
        for e in events:
            if e.get("score_home") is not None and e.get("score_away") is not None:
                score = (int(e["score_home"]), int(e["score_away"]))
            if e.get("action_type") != "Substitution":
                continue
            out_id = int(e["player_id"]) if e.get("player_id") else None
            team = roster.team_of.get(out_id)
            if team not in teams or out_id not in lineup[team]:
                status["ok"] = False
                status["reasons"].append(f"period {period}: sub out {out_id} not on court")
                continue
            on_court = lineup[team] | lineup[teams[1] if team == teams[0] else teams[0]]
            incoming = roster.candidates(team, _sub_in_name(e.get("description")) or "", on_court)
            if not incoming:
                status["ok"] = False
                status["reasons"].append(f"period {period}: sub in unresolved '{e.get('description')}'")
                continue
            now = _elapsed(period, e.get("clock"))
            if now > stint_start:
                stints.append(_stint(len(stints), period, stint_start, now, lineup, teams, stint_score, score))
                stint_start, stint_score = now, score
            lineup[team] = (lineup[team] - {out_id}) | {incoming[0]}
        end = _period_start(period) + _period_length(period)
        if end > stint_start:
            stints.append(_stint(len(stints), period, stint_start, end, lineup, teams, stint_score, score))
        previous = {t: set(lineup[t]) for t in teams}
    for s in stints:
        s["GAME_ID"] = str(game["game_id"]).zfill(10)
    return stints, status


def _stint(idx, period, start, end, lineup, teams, score_before, score_after) -> dict:
    return {
        "STINT": idx, "PERIOD": period, "START": start, "END": end, "SECONDS": end - start,
        "HOME_PTS": score_after[0] - score_before[0], "AWAY_PTS": score_after[1] - score_before[1],
        "HOME_PLAYERS": "|".join(str(p) for p in sorted(lineup[teams[0]])),
        "AWAY_PLAYERS": "|".join(str(p) for p in sorted(lineup[teams[1]])),
        "HOME_TEAM": teams[0], "AWAY_TEAM": teams[1],
    }


def player_games_from_stints(stints: pd.DataFrame) -> pd.DataFrame:
    """One row per (game, player): seconds on court and the team's points for and against while on."""
    rows = []
    for side, other, team_col in (("HOME", "AWAY", "HOME_TEAM"), ("AWAY", "HOME", "AWAY_TEAM")):
        part = stints[["GAME_ID", team_col, f"{side}_PLAYERS", "SECONDS", f"{side}_PTS", f"{other}_PTS"]].copy()
        part.columns = ["GAME_ID", "TEAM_ABBREVIATION", "PLAYERS", "SECONDS", "PTS_FOR", "PTS_AGAINST"]
        part["PLAYER_ID"] = part["PLAYERS"].str.split("|")
        rows.append(part.explode("PLAYER_ID").drop(columns="PLAYERS"))
    both = pd.concat(rows, ignore_index=True)
    both["PLAYER_ID"] = both["PLAYER_ID"].astype(int)
    out = both.groupby(["GAME_ID", "TEAM_ABBREVIATION", "PLAYER_ID"], as_index=False)[["SECONDS", "PTS_FOR", "PTS_AGAINST"]].sum()
    out["ON_COURT_MARGIN"] = out["PTS_FOR"] - out["PTS_AGAINST"]
    return out


def quality_check(player_games: pd.DataFrame, box: pd.DataFrame) -> pd.DataFrame:
    """Per player-game comparison with the box score (MIN, PLUS_MINUS)."""
    b = box[["GAME_ID", "PLAYER_ID", "MIN", "PLUS_MINUS"]].copy()
    b["GAME_ID"] = b["GAME_ID"].astype(str).str.zfill(10)
    m = player_games.merge(b, on=["GAME_ID", "PLAYER_ID"], how="inner")
    m["MIN_DIFF"] = m["SECONDS"] / 60.0 - pd.to_numeric(m["MIN"], errors="coerce")
    m["PM_DIFF"] = m["ON_COURT_MARGIN"] - pd.to_numeric(m["PLUS_MINUS"], errors="coerce")
    return m


def game_quality(qc: pd.DataFrame, max_pm_mae: float = 2.5, max_min_mae: float = 1.0) -> pd.DataFrame:
    """Per game mean absolute plus-minus and minutes error against the box score, with a ``USABLE`` flag.

    Timing of substitutions around free throws leaves about one point of noise per player-game even in a good rebuild;
    a game above the limits has a wrong lineup somewhere and should stay out of impact estimates.
    """
    q = qc.groupby("GAME_ID").agg(PM_MAE=("PM_DIFF", lambda x: x.abs().mean()), MIN_MAE=("MIN_DIFF", lambda x: x.abs().mean())).reset_index()
    q["USABLE"] = (q["PM_MAE"] <= max_pm_mae) & (q["MIN_MAE"] <= max_min_mae)
    return q


def build_season(season: str, limit: int | None = None) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """Stints, player-games and a coverage summary for every cached game of ``season``."""
    from src.core.data_paths import get_data_paths

    paths = get_data_paths(season)
    box = pd.read_csv(paths.raw_player_boxscores)
    box["GAME_ID"] = box["GAME_ID"].astype(str).str.zfill(10)
    files = sorted(Path(paths.raw_play_by_play_dir).glob("*.json"))
    if limit:
        files = files[:limit]
    all_stints, failed = [], {}
    for f in files:
        game = json.loads(f.read_text(encoding="utf-8"))
        gid = str(game["game_id"]).zfill(10)
        game_box = box[box["GAME_ID"] == gid]
        if game_box.empty:
            failed[gid] = ["no box score"]
            continue
        stints, status = extract_stints(game, game_box)
        if status["ok"] and stints:
            all_stints.extend(stints)
        else:
            failed[gid] = status["reasons"] or ["no stints"]
    stints_df = pd.DataFrame(all_stints)
    pg = player_games_from_stints(stints_df) if not stints_df.empty else pd.DataFrame()
    summary = {"season": season, "games_cached": len(files), "games_ok": len(files) - len(failed), "failed": failed}
    return stints_df, pg, summary


def build_and_write(season: str, limit: int | None = None, dry_run: bool = False) -> int:
    """Rebuild stints for ``season``, print coverage and the box score check, write the processed files unless ``dry_run``."""
    from src.core.data_paths import get_data_paths

    stints, pg, summary = build_season(season, limit)
    print(f"{season}: {summary['games_ok']}/{summary['games_cached']} games rebuilt")
    for gid, reasons in list(summary["failed"].items())[:10]:
        print(f"  failed {gid}: {reasons[0]}")
    if pg.empty:
        return 1

    box = pd.read_csv(get_data_paths(season).raw_player_boxscores)
    qc = quality_check(pg, box)
    print(f"player-games {len(qc)}: plus-minus exact {(qc['PM_DIFF'] == 0).mean():.3f}, "
          f"within 2 {(qc['PM_DIFF'].abs() <= 2).mean():.3f}, minutes MAE {qc['MIN_DIFF'].abs().mean():.3f}")
    quality = game_quality(qc)
    print(f"usable games {int(quality['USABLE'].sum())}/{len(quality)} (plus-minus and minutes within limits)")
    if dry_run:
        return 0

    out_dir = Path(get_data_paths(season).game_results).parent
    out_dir.mkdir(parents=True, exist_ok=True)
    stints.to_csv(out_dir / "pbp_stints.csv", index=False)
    pg.to_csv(out_dir / "pbp_player_games.csv", index=False)
    quality.to_csv(out_dir / "pbp_game_quality.csv", index=False)
    print(f"wrote pbp_stints.csv, pbp_player_games.csv and pbp_game_quality.csv under {out_dir}")
    return 0
