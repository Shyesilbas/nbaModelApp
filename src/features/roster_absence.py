"""Pre-game roster absence feature shared by training and live inference.

``ABS_DELTA`` is how much a team's strength tonight differs from what its recent
form (last-10 ratings) already reflects, because of who is on the floor:

    ABS_DELTA = sum over rotation players p of (availability_p - presence_p) * GS_p

* rotation: players who averaged at least ``MIN_ROTATION_MINUTES`` in the games they
  played over the team's previous ``WINDOW`` games (a long-term absentee has already
  left the window, so only fresh absences and returns move the feature; a star who
  just came back counts, his presence being small so his return adds a lot);
* presence_p: share of those games p played, i.e. how much form already counts p;
* GS_p: p's Hollinger game score per game played, a one-number production proxy;
* availability_p: 1 if p plays tonight, 0 if out, in between if restricted.

Training uses the actual box score for availability. Live inference takes it from
the status overrides (OUT = 0, RESTRICTED = factor) and, for players nobody
mentioned, assumes whoever played the team's previous game plays again.
"""
from __future__ import annotations

import os
from functools import lru_cache
from typing import Mapping, Optional

import numpy as np
import pandas as pd

WINDOW = 15
MIN_ROTATION_MINUTES = 20.0
MIN_HISTORY_GAMES = 5


def game_score(df: pd.DataFrame) -> pd.Series:
    return (
        df["PTS"] + 0.4 * df["FGM"] - 0.7 * df["FGA"] - 0.4 * (df["FTA"] - df["FTM"])
        + 0.7 * df["OREB"] + 0.3 * df["DREB"] + df["STL"] + 0.7 * df["AST"]
        + 0.7 * df["BLK"] - 0.4 * df["PF"] - df["TOV"]
    )


def _prepare(player_games: pd.DataFrame) -> pd.DataFrame:
    d = player_games.copy()
    d["GAME_ID"] = d["Game_ID"].astype(str).str.zfill(10)
    d["TEAM_ABBREVIATION"] = d["MATCHUP"].str.split().str[0]
    d["_season"] = d["GAME_ID"].str[3:5]  # game ids embed the season start year; history never crosses a season
    d["GAME_DATE"] = pd.to_datetime(d["GAME_DATE"])
    d["MIN"] = pd.to_numeric(d["MIN"], errors="coerce").fillna(0.0)
    for c in ("PTS", "FGM", "FGA", "FTA", "FTM", "OREB", "DREB", "STL", "AST", "BLK", "PF", "TOV"):
        d[c] = pd.to_numeric(d[c], errors="coerce").fillna(0.0)
    d["GS"] = game_score(d)
    return d[d["MIN"] > 0]


def build_absence_deltas(player_games: pd.DataFrame) -> pd.DataFrame:
    """Actual-availability ABS_DELTA for every (GAME_ID, TEAM_ABBREVIATION) in the logs."""
    d = _prepare(player_games)
    out = []
    for (_, team), g in d.groupby(["_season", "TEAM_ABBREVIATION"]):
        order = g.groupby("GAME_ID")["GAME_DATE"].first().sort_values(kind="stable")
        ids = order.index
        played = g.pivot_table(index="GAME_ID", columns="Player_ID", values="MIN", aggfunc="sum").reindex(ids)
        gs = g.pivot_table(index="GAME_ID", columns="Player_ID", values="GS", aggfunc="sum").reindex(ids)
        on = played.notna().astype(float).fillna(0.0)
        mins, gsv = played.fillna(0.0), gs.fillna(0.0)
        # previous WINDOW games, excluding the current one
        roll = lambda f: f.shift(1).rolling(WINDOW, min_periods=1).sum()
        n = pd.Series(np.minimum(np.arange(len(ids)), WINDOW), index=ids, dtype=float)
        gp, msum, gssum = roll(on), roll(mins), roll(gsv)
        presence = gp.div(n.replace(0, np.nan), axis=0)
        rotation = msum.div(gp.replace(0, np.nan)) >= MIN_ROTATION_MINUTES
        gs_avg = gssum.div(gp.replace(0, np.nan))
        delta = ((on - presence) * gs_avg).where(rotation).sum(axis=1)
        delta[n < MIN_HISTORY_GAMES] = 0.0
        out.append(pd.DataFrame({"GAME_ID": ids, "TEAM_ABBREVIATION": team, "ABS_DELTA": delta.values}))
    return pd.concat(out, ignore_index=True)


def add_absence_columns(model_df: pd.DataFrame, player_games: pd.DataFrame) -> pd.DataFrame:
    """Add ABS_DELTA, OPP_ABS_DELTA and ABS_DIFF to a team-game model dataset."""
    deltas = build_absence_deltas(player_games)
    df = model_df.drop(columns=[c for c in ("ABS_DELTA", "OPP_ABS_DELTA", "ABS_DIFF") if c in model_df.columns]).copy()
    key = df["GAME_ID"].astype(str).str.zfill(10)
    df["_gid"] = key
    d = deltas.rename(columns={"GAME_ID": "_gid"})
    df = df.merge(d, on=["_gid", "TEAM_ABBREVIATION"], how="left")
    opp = d.rename(columns={"TEAM_ABBREVIATION": "OPPONENT_ABBREVIATION", "ABS_DELTA": "OPP_ABS_DELTA"})
    df = df.merge(opp, on=["_gid", "OPPONENT_ABBREVIATION"], how="left")
    for c in ("ABS_DELTA", "OPP_ABS_DELTA"):
        df[c] = df[c].fillna(0.0)
    df["ABS_DIFF"] = df["ABS_DELTA"] - df["OPP_ABS_DELTA"]
    return df.drop(columns="_gid")


STALE_DAYS = 21  # a previous game older than this says nothing about who is hurt now


def _live_rotation(player_games: pd.DataFrame, team: str, pred_date, preseason: bool = False):
    """(rotation table, ids assumed to play, stale) from the team's last WINDOW games, or None.

    Preseason games (rested starters) are ignored unless ``preseason``. When the previous
    game is stale (offseason), the rotation spans the team's whole history in the logs, so a
    player hurt for the end of last season can still be marked out, and only overrides move
    the feature (opening games 2021-22..2025-26: WIN Brier 0.2294 -> 0.2227)."""
    if player_games is None or player_games.empty:
        return None
    d = _prepare(player_games)
    d = d[d["GAME_DATE"] < pd.to_datetime(pred_date)].sort_values("GAME_DATE", kind="stable")
    if not preseason:
        d = d[~d["GAME_ID"].str.startswith("001")]
    current = d.groupby("Player_ID")["TEAM_ABBREVIATION"].last()  # drops players traded/signed away since
    d = d[(d["TEAM_ABBREVIATION"] == team) & d["Player_ID"].map(current).eq(team)]
    if d.empty:
        return None
    order = d.groupby("GAME_ID")["GAME_DATE"].first().sort_values(kind="stable")
    # Only the offseason gap is treated as stale. Zeroing the default for a team's games 2-5 as
    # well (training rows carry 0 there) was worse: WIN Brier 0.2256 -> 0.2306 over 324 games of
    # 2021-22..2025-26, because who skipped the previous game is still informative.
    stale = (pd.to_datetime(pred_date) - order.iloc[-1]).days > STALE_DAYS
    hist_ids = list(order.index if stale else order.index[-WINDOW:])
    n = len(hist_ids)
    if n < MIN_HISTORY_GAMES:
        return None
    h = d[d["GAME_ID"].isin(hist_ids)]
    st = h.groupby("Player_ID").agg(gp=("MIN", "size"), msum=("MIN", "sum"), gs=("GS", "mean"), name=("PLAYER_NAME", "last"))
    st["presence"] = st["gp"] / n
    rot = st[st["msum"] / st["gp"] >= MIN_ROTATION_MINUTES]
    if stale:
        return rot, set(rot.index), True
    last = d[d["GAME_ID"] == hist_ids[-1]]
    return rot, set(last["Player_ID"]), False


# Minutes a benched (is_starter=False) player is capped at; shared with the player minutes engine.
BENCH_MIN_CAP = 22.0


def _override_availability(hit, avg_min):
    """Availability for an override: its factor, lowered to the bench-minutes share when the user benches the player."""
    avail = float(hit["factor"])
    if hit.get("is_starter") is False:
        avail = min(avail, BENCH_MIN_CAP / max(float(avg_min), 1.0))
    return avail


def _override_for(overrides, pid, name):
    if not overrides:
        return None
    hit = overrides.get(int(pid))
    return hit if hit is not None else overrides.get(str(name).strip().lower())


def _on_roster(rot: pd.DataFrame, roster_ids: Optional[set]) -> pd.DataFrame:
    """Drop players no longer on the team (released, traded or signed elsewhere but not yet seen
    in a box score): their absence is a roster change, not tonight's availability."""
    if not roster_ids:
        return rot
    return rot[rot.index.isin(roster_ids)]


def current_roster_ids(team: str, pred_date) -> Optional[set]:
    """Player ids on ``team``'s roster as of ``pred_date`` (bootstrap roster plus movements), or None."""
    from src.analysis.roster_transactions import roster_as_of
    from src.core.data_paths import get_data_paths
    from src.core.season_utils import date_to_season

    try:
        dt = pd.to_datetime(pred_date)
        season = date_to_season(dt)
        path = get_data_paths(season).team_rosters
        roster = roster_as_of(_read_roster(path, os.path.getmtime(path)), season, dt.strftime("%Y-%m-%d"))
        ids = set(roster.loc[roster["TEAM_ABBREVIATION"] == team, "PLAYER_ID"].astype(int))
        return ids or None
    except Exception:
        return None


@lru_cache(maxsize=4)
def _read_roster(path: str, _mtime: float) -> pd.DataFrame:
    return pd.read_csv(path)


def live_absence_delta(
    player_games: pd.DataFrame,
    team: str,
    pred_date,
    overrides: Optional[Mapping] = None,
    preseason: bool = False,
    roster_ids: Optional[set] = None,
) -> float:
    """ABS_DELTA for ``team`` before ``pred_date``.

    ``overrides`` is the dict from ``_parse_player_overrides``: player id or lower-case
    name -> {"factor": availability in [0, 1]}.
    """
    live = _live_rotation(player_games, team, pred_date, preseason)
    if live is None:
        return 0.0
    rot, last_game, stale = live
    rot = _on_roster(rot, roster_ids)
    total = 0.0
    for pid, row in rot.iterrows():
        hit = _override_for(overrides, pid, row["name"])
        if hit is None and stale:
            continue
        avail = _override_availability(hit, row["msum"] / row["gp"]) if hit is not None else (1.0 if pid in last_game else 0.0)
        total += (avail - row["presence"]) * row["gs"]
    return float(total)


def assumed_out_players(
    player_games: pd.DataFrame,
    team: str,
    pred_date,
    overrides: Optional[Mapping] = None,
    preseason: bool = False,
    roster_ids: Optional[set] = None,
) -> set:
    """Rotation player ids the team models treat as absent only by default (they skipped the
    previous game and nobody said otherwise), so the UI can show that assumption."""
    live = _live_rotation(player_games, team, pred_date, preseason)
    if live is None:
        return set()
    rot, last_game, _ = live
    rot = _on_roster(rot, roster_ids)
    return {int(pid) for pid, row in rot.iterrows() if pid not in last_game and _override_for(overrides, pid, row["name"]) is None}
