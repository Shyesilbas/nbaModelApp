"""Pre-game core player availability features (``TEAM_CORE_*`` / ``OPP_CORE_*``).

A team's core players for a game are chosen only from what was known before tip-off:

* candidates: players who played at least ``MIN_GAMES`` of the team's previous ``WINDOW``
  games, and whose most recent appearance before tonight was for this team (a player
  who has since played for another team was traded and drops out);
* importance: ``0.5*MIN + PTS + 0.8*AST + 0.6*REB`` averaged over those games played;
* CORE_RANK 1-3 is the top 3, 1-5 the top 5.

``*_PLAYED_COUNT`` uses whether a core player plays tonight, the same convention as
``ABS_DELTA`` in ``roster_absence.py`` (pre-game it comes from injury reports).
``*_MINUTES_SUM`` is the expected minutes (window average) of the core players who play,
never tonight's actual minutes, and the ``*_LAST_5_SUM`` columns sum the shift(1) rolling
stats of those players.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

WINDOW = 20
MIN_GAMES = 3
TOP_N = (3, 5)
STAT_WEIGHTS = {"MIN": 0.5, "PTS": 1.0, "AST": 0.8, "REB": 0.6}
ROLLING_COLS = ["PTS_LAST_5", "AST_LAST_5", "REB_LAST_5", "MIN_LAST_5", "PLUS_MINUS_LAST_5"]


def _prepare_player_games(player_features_df: pd.DataFrame) -> pd.DataFrame:
    df = player_features_df.copy()
    df["Game_ID"] = df["Game_ID"].astype(str)
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"])
    df["TEAM_ABBREVIATION"] = df["MATCHUP"].str.split().str[0]
    for col in list(STAT_WEIGHTS) + ROLLING_COLS:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)
    return df


def _team_core_candidates(team_games: pd.DataFrame, team_players: pd.DataFrame) -> pd.DataFrame:
    """Window importance and expected minutes per (team game, player), from earlier games only."""
    games = team_games.sort_values("GAME_DATE").reset_index(drop=True)
    pos = pd.Series(np.arange(len(games)), index=games["GAME_ID"])
    tp = team_players[team_players["Game_ID"].isin(pos.index)]
    if tp.empty:
        return pd.DataFrame()

    players = np.sort(tp["Player_ID"].unique())
    rows = pos.loc[tp["Game_ID"]].to_numpy()
    cols = np.searchsorted(players, tp["Player_ID"].to_numpy())

    def window_sums(values: np.ndarray) -> np.ndarray:
        mat = np.zeros((len(games), len(players)))
        mat[rows, cols] = values
        cum = np.vstack([np.zeros(len(players)), np.cumsum(mat, axis=0)])
        idx = np.arange(len(games))
        return cum[idx] - cum[np.maximum(idx - WINDOW, 0)]  # games [i-WINDOW, i), tonight excluded

    gp = window_sums(np.ones(len(tp)))
    with np.errstate(divide="ignore", invalid="ignore"):
        avgs = {stat: window_sums(tp[stat].to_numpy()) / gp for stat in STAT_WEIGHTS}
    importance = sum(w * avgs[stat] for stat, w in STAT_WEIGHTS.items())

    gi, pj = np.nonzero(gp >= MIN_GAMES)
    return pd.DataFrame({
        "GAME_ID": games["GAME_ID"].to_numpy()[gi],
        "GAME_DATE": games["GAME_DATE"].to_numpy()[gi],
        "Player_ID": players[pj],
        "IMPORTANCE_SCORE": importance[gi, pj],
        "EXPECTED_MIN": avgs["MIN"][gi, pj],
    })


def build_core_rosters(team_features_df: pd.DataFrame, player_games: pd.DataFrame) -> pd.DataFrame:
    """Pre-game top-5 core players per team game: GAME_ID, TEAM_ABBREVIATION, Player_ID, CORE_RANK, EXPECTED_MIN."""
    team_games = team_features_df[["GAME_ID", "TEAM_ABBREVIATION", "GAME_DATE"]].copy()
    team_games["GAME_ID"] = team_games["GAME_ID"].astype(str)
    team_games["GAME_DATE"] = pd.to_datetime(team_games["GAME_DATE"])

    parts = []
    for team, tg in team_games.groupby("TEAM_ABBREVIATION"):
        cand = _team_core_candidates(tg, player_games[player_games["TEAM_ABBREVIATION"] == team])
        if not cand.empty:
            parts.append(cand.assign(TEAM_ABBREVIATION=team))
    if not parts:
        return pd.DataFrame(columns=["GAME_ID", "TEAM_ABBREVIATION", "Player_ID", "CORE_RANK", "EXPECTED_MIN"])
    cand = pd.concat(parts, ignore_index=True)

    # Drop players whose latest appearance before tonight was for another team (traded away).
    appearances = (
        player_games[["Player_ID", "GAME_DATE", "TEAM_ABBREVIATION"]]
        .rename(columns={"TEAM_ABBREVIATION": "LAST_TEAM"})
        .sort_values("GAME_DATE")
    )
    cand = pd.merge_asof(
        cand.sort_values("GAME_DATE"), appearances,
        on="GAME_DATE", by="Player_ID", allow_exact_matches=False,
    )
    cand = cand[cand["LAST_TEAM"] == cand["TEAM_ABBREVIATION"]]

    cand["CORE_RANK"] = cand.groupby(["GAME_ID", "TEAM_ABBREVIATION"])["IMPORTANCE_SCORE"].rank(
        ascending=False, method="first"
    ).astype(int)
    cand = cand[cand["CORE_RANK"] <= max(TOP_N)]
    return cand[["GAME_ID", "TEAM_ABBREVIATION", "Player_ID", "CORE_RANK", "EXPECTED_MIN"]].reset_index(drop=True)


def build_core_player_availability_features(
    team_features_df: pd.DataFrame,
    player_features_df: pd.DataFrame,
) -> pd.DataFrame:
    """Adds pre-game TEAM_CORE_* features for each team game and their OPP_CORE_* counterparts."""
    team_features_df = team_features_df.copy()
    team_features_df["GAME_ID"] = team_features_df["GAME_ID"].astype(str)
    player_games = _prepare_player_games(player_features_df)

    core = build_core_rosters(team_features_df, player_games)
    tonight = player_games[["Game_ID", "Player_ID"] + ROLLING_COLS].rename(columns={"Game_ID": "GAME_ID"})
    core = core.merge(tonight, on=["GAME_ID", "Player_ID"], how="left", indicator=True)
    core["PLAYED"] = (core.pop("_merge") == "both").astype(int)
    core["PLAYED_MIN"] = core["EXPECTED_MIN"] * core["PLAYED"]
    core[ROLLING_COLS] = core[ROLLING_COLS].fillna(0.0)

    df_out = team_features_df
    team_core_cols = []
    for n in TOP_N:
        p = f"TEAM_CORE_TOP{n}_"
        agg = (
            core[core["CORE_RANK"] <= n]
            .groupby(["GAME_ID", "TEAM_ABBREVIATION"])
            .agg(
                **{
                    f"{p}EXPECTED_COUNT": ("Player_ID", "count"),
                    f"{p}PLAYED_COUNT": ("PLAYED", "sum"),
                    f"{p}MINUTES_SUM": ("PLAYED_MIN", "sum"),
                },
                **{f"{p}{col}_SUM": (col, "sum") for col in ROLLING_COLS},
            )
            .reset_index()
        )
        df_out = df_out.merge(agg, on=["GAME_ID", "TEAM_ABBREVIATION"], how="left")
        count_cols = [f"{p}EXPECTED_COUNT", f"{p}PLAYED_COUNT"]
        sum_cols = [f"{p}MINUTES_SUM"] + [f"{p}{col}_SUM" for col in ROLLING_COLS]
        df_out[count_cols] = df_out[count_cols].fillna(0).astype(int)
        df_out[sum_cols] = df_out[sum_cols].fillna(0.0)
        df_out[f"{p}MISSING_COUNT"] = df_out[f"{p}EXPECTED_COUNT"] - df_out[f"{p}PLAYED_COUNT"]
        # No core history yet (first games of a season) counts as fully available.
        df_out[f"{p}AVAILABLE_RATE"] = (
            df_out[f"{p}PLAYED_COUNT"] / df_out[f"{p}EXPECTED_COUNT"].replace(0, np.nan)
        ).fillna(1.0)
        team_core_cols += count_cols + [f"{p}MISSING_COUNT", f"{p}AVAILABLE_RATE"] + sum_cols

    # Bring the opponent's core features side by side as OPP_CORE_*.
    df_self = df_out[["GAME_ID", "TEAM_ID"] + team_core_cols]
    df_merged = df_out.merge(df_self, on="GAME_ID", suffixes=("", "_opp"))
    df_merged = df_merged[df_merged["TEAM_ID"] != df_merged["TEAM_ID_opp"]].reset_index(drop=True)
    df_result = df_merged.rename(
        columns={f"{col}_opp": col.replace("TEAM_CORE_", "OPP_CORE_") for col in team_core_cols}
    )
    return df_result[[c for c in df_result.columns if not c.endswith("_opp")]].copy()
