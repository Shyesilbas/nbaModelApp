"""Flatten raw SportsGameOdds pages into one row per game and attach our GAME_ID.

    python -m scripts.ingest.build_odds_table

Output: data/odds/nba_market_lines.csv (HOME_/AWAY_ML, SPREAD, TOTAL, open + close, per book).
Field names follow the SGO docs; the first real response may need small tweaks (see CHECK).
"""
from __future__ import annotations

import glob
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
BOOKS = ["pinnacle", "circa", "draftkings", "fanduel"]
MARKETS = {  # column prefix -> (oddID, line-field-base)
    "ML_HOME": ("points-home-game-ml-home", None),
    "ML_AWAY": ("points-away-game-ml-away", None),
    "SPREAD_HOME": ("points-home-game-sp-home", "Spread"),
    "TOTAL": ("points-all-game-ou-over", "OverUnder"),
}


def american_to_prob(o) -> float:
    try:
        o = float(str(o).replace("+", ""))
    except (TypeError, ValueError):
        return np.nan
    return 100 / (o + 100) if o > 0 else -o / (-o + 100)


def num(x) -> float:
    try:
        return float(str(x).replace("+", ""))
    except (TypeError, ValueError):
        return np.nan


def flatten_event(ev: dict) -> dict:
    # CHECK: start time and team names per docs: status.startsAt, teams.<side>.names.long
    row = {
        "SGO_EVENT_ID": ev.get("eventID"),
        "STARTS_AT": (ev.get("status") or {}).get("startsAt"),
        "HOME_NAME": ev["teams"]["home"]["names"]["long"],
        "AWAY_NAME": ev["teams"]["away"]["names"]["long"],
    }
    odds = ev.get("odds") or {}
    for prefix, (oid, base) in MARKETS.items():
        o = odds.get(oid) or {}
        for book in BOOKS:
            b = (o.get("byBookmaker") or {}).get(book) or {}
            tag = f"{prefix}_{book.upper()}"
            row[f"{tag}_CLOSE_ODDS"] = num(b.get("closeOdds"))
            row[f"{tag}_OPEN_ODDS"] = num(b.get("openOdds"))
            if base:
                row[f"{tag}_CLOSE_LINE"] = num(b.get(f"close{base}"))
                row[f"{tag}_OPEN_LINE"] = num(b.get(f"open{base}"))
        if base:  # consensus (not per book)
            row[f"{prefix}_CONSENSUS_LINE"] = num(o.get(f"book{base}"))
    # CHECK: final score location; try results.game first, then the odd's own score
    res = (ev.get("results") or {}).get("game") or {}
    row["HOME_SCORE_SGO"] = num((res.get("home") or {}).get("points"))
    row["AWAY_SCORE_SGO"] = num((res.get("away") or {}).get("points"))
    return row


def main() -> None:
    files = sorted(glob.glob(str(ROOT / "data/raw/odds/sgo/*/page_*.json")))
    if not files:
        raise SystemExit("no raw pages; run ingest_sgo_odds first")
    rows = [flatten_event(e) for f in files for e in json.loads(Path(f).read_text()).get("data", [])]
    df = pd.DataFrame(rows).drop_duplicates("SGO_EVENT_ID")
    # UTC -> US/Eastern so late tip-offs land on the NBA game date
    df["GAME_DATE"] = (pd.to_datetime(df["STARTS_AT"], utc=True)
                       .dt.tz_convert("US/Eastern").dt.strftime("%Y-%m-%d"))

    gr = pd.concat([pd.read_csv(p, dtype={"GAME_ID": str}) for p in
                    glob.glob(str(ROOT / "data/season=*/processed/game_results.csv"))])
    gr = gr[["GAME_ID", "GAME_DATE", "HOME_TEAM_NAME", "AWAY_TEAM_NAME", "HOME_SCORE", "AWAY_SCORE"]]
    out = df.merge(gr, left_on=["GAME_DATE", "HOME_NAME", "AWAY_NAME"],
                   right_on=["GAME_DATE", "HOME_TEAM_NAME", "AWAY_TEAM_NAME"], how="left")
    unmatched = out["GAME_ID"].isna().sum()
    print(f"events {len(out)}, matched to GAME_ID {len(out) - unmatched}, unmatched {unmatched}")
    if unmatched:
        print(out.loc[out["GAME_ID"].isna(), ["GAME_DATE", "HOME_NAME", "AWAY_NAME"]].head(10).to_string())
    for book in BOOKS:
        h, a = (out[f"ML_{s}_{book.upper()}_CLOSE_ODDS"].map(american_to_prob) for s in ("HOME", "AWAY"))
        out[f"P_HOME_NOVIG_{book.upper()}"] = h / (h + a)  # vig removed by proportional scaling
    # sanity: SGO final score must equal ours where both exist
    both = out.dropna(subset=["HOME_SCORE_SGO", "HOME_SCORE"])
    if len(both):
        print("score mismatches vs game_results:", int((both["HOME_SCORE_SGO"] != both["HOME_SCORE"]).sum()), "of", len(both))
    path = ROOT / "data/odds/nba_market_lines.csv"
    path.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(path, index=False)
    print("wrote", path)


if __name__ == "__main__":
    main()
