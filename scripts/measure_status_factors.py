"""Measure how often a player listed Questionable/Doubtful/Probable actually plays, from past reports.

For each regular season game day the report published about 15 minutes before each tip-off (the
moment the paper trading snapshot freezes a game) is read; every listed player is compared with
his box score: did he play, and how many minutes relative to his average over his previous games.
The result is the measured counterpart of nba_injury_report.STATUS_FACTOR.

Reports before the 2025-26 season are not retrievable, so one season is measured.
Usage: PYTHONPATH=. python3 scripts/measure_status_factors.py [--season 2025-26]
"""
from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd

from src.ingestion import nba_injury_report as inj

REPORT_DIR_URL = "https://ak-static.cms.nba.com/referee/injury/"
CACHE_DIR = Path("data/cache/injury_reports")
PAUSE_SECONDS = 0.15
SLOT_STEPS_BACK = 4
MIN_PRIOR_GAMES = 5
ROTATION_MINUTES = 15.0


def _slot_name(when: datetime) -> str:
    return when.strftime("Injury-Report_%Y-%m-%d_%I_%M%p.pdf")


def _entries_at(when: datetime) -> tuple[datetime, list] | None:
    """Entries of the newest report at or before ``when`` (up to a few quarter-hours back)."""
    for step in range(SLOT_STEPS_BACK + 1):
        slot = when - timedelta(minutes=15 * step)
        key = CACHE_DIR / (_slot_name(slot) + ".json")
        if key.exists():
            return slot, json.loads(key.read_text())
        time.sleep(PAUSE_SECONDS)
        try:
            resp = inj._get(REPORT_DIR_URL + _slot_name(slot))
        except Exception:
            continue
        if resp.status_code != 200:
            continue
        try:
            import pymupdf as fitz
        except ImportError:
            import fitz
        with fitz.open(stream=resp.content, filetype="pdf") as doc:
            report = inj.parse_report("\n".join(p.get_text() for p in doc))
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        key.write_text(json.dumps(report.entries))
        return slot, report.entries
    return None


def _quarter_floor(when: datetime) -> datetime:
    return when.replace(minute=when.minute // 15 * 15, second=0, microsecond=0)


def collect(season: str) -> pd.DataFrame:
    sched = pd.read_csv(f"data/season={season}/raw/schedule.csv", dtype=str)
    days = sorted(sched.loc[sched["SEASON_TYPE"] == "Regular Season", "GAME_DATE"].unique())
    rows = []
    for day in days:
        mdy = datetime.strptime(day, "%Y-%m-%d").strftime("%m/%d/%Y")
        probe = datetime.strptime(day + " 17:00", "%Y-%m-%d %H:%M").replace(tzinfo=inj.ET)
        first = _entries_at(probe)
        if first is None:
            continue
        times = sorted({e["game_time"] for e in first[1] if e["game_date"] == mdy and e["game_time"]})
        for t in times:
            tip = datetime.strptime(f"{day} {t.split(' ')[0]}", "%Y-%m-%d %H:%M").replace(tzinfo=inj.ET)
            got = _entries_at(_quarter_floor(tip - timedelta(minutes=15)))
            if got is None:
                continue
            for e in got[1]:
                if e["game_date"] == mdy and e["game_time"] == t:
                    rows.append({**e, "day": day, "slot": got[0].isoformat()})
        print(day, len(rows), flush=True)
    return pd.DataFrame(rows)


def measure(listed: pd.DataFrame, season: str) -> pd.DataFrame:
    games = pd.read_csv(f"data/season={season}/raw/player_games.csv",
                        usecols=["Player_ID", "PLAYER_NAME", "GAME_DATE", "MATCHUP", "MIN", "SEASON_TYPE"])
    games = games[games["SEASON_TYPE"] == "Regular Season"].copy()
    games["team"] = games["MATCHUP"].str.split(" ").str[0]
    games["key"] = games["team"] + "|" + games["PLAYER_NAME"].map(inj._plain)
    games["GAME_DATE"] = pd.to_datetime(games["GAME_DATE"])
    by_player = {k: g.sort_values("GAME_DATE") for k, g in games.groupby("key")}
    out = []
    for r in listed.itertuples():
        g = by_player.get(f"{r.team}|{inj._plain(r.player_name)}")
        if g is None:
            continue
        day = pd.Timestamp(r.day)
        prior = g[(g["GAME_DATE"] < day) & (g["MIN"] > 0)].tail(10)
        played = g[g["GAME_DATE"] == day]
        if len(prior) < MIN_PRIOR_GAMES:
            continue  # no baseline
        # A player who did not play has no box score row: that is a zero, not a missing value.
        base = prior["MIN"].mean()
        out.append({"status": r.status, "baseline": base, "min": float(played["MIN"].iloc[0]) if not played.empty else 0.0})
    df = pd.DataFrame(out)
    df = df[df["baseline"] >= ROTATION_MINUTES]
    df["played"] = (df["min"] > 0).astype(int)
    df["ratio"] = df["min"] / df["baseline"]
    return df.groupby("status").agg(n=("played", "size"), play_rate=("played", "mean"), minutes_ratio=("ratio", "mean"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", default="2025-26")
    args = parser.parse_args()
    listed = collect(args.season)
    out_path = Path(f"data/cache/injury_listed_{args.season}.csv")
    listed.to_csv(out_path, index=False)
    table = measure(listed, args.season)
    print(table.round(3).to_string())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
