"""Data contracts checked before a dataset is written.

Each ``check_*`` raises ``ContractViolation`` listing every broken rule, so a bad API
response or a merge bug stops the pipeline instead of silently landing in the raw or
training files (writes are atomic, so the previous file stays in place).
"""
from __future__ import annotations

from typing import Iterable, List

import pandas as pd


class ContractViolation(ValueError):
    pass


def _game_ids(series: pd.Series) -> pd.Series:
    return series.astype(str).str.split(".").str[0].str.zfill(10)


def _require_columns(df: pd.DataFrame, cols: Iterable[str], errors: List[str]) -> bool:
    missing = [c for c in cols if c not in df.columns]
    if missing:
        errors.append(f"missing columns {missing}")
    return not missing


def _duplicates(df: pd.DataFrame, keys: List[str], errors: List[str]) -> None:
    n = int(df.duplicated(keys).sum())
    if n:
        errors.append(f"{n} duplicate rows on {keys}")


def _no_nulls(df: pd.DataFrame, cols: Iterable[str], errors: List[str]) -> None:
    for col in cols:
        n = int(df[col].isna().sum())
        if n:
            errors.append(f"{n} null values in {col}")


def _dates(df: pd.DataFrame, col: str, errors: List[str]) -> None:
    bad = pd.to_datetime(df[col], errors="coerce").isna() & df[col].notna()
    if bad.any():
        errors.append(f"{int(bad.sum())} unparseable {col} values (e.g. {df.loc[bad, col].iloc[0]!r})")


def _raise(name: str, errors: List[str]) -> None:
    if errors:
        raise ContractViolation(f"{name} contract violated: " + "; ".join(errors))


def check_team_games(df: pd.DataFrame, name: str = "team_games") -> None:
    errors: List[str] = []
    if df.empty:
        return
    if _require_columns(df, ["GAME_ID", "TEAM_ID", "TEAM_ABBREVIATION", "GAME_DATE", "MATCHUP", "PTS"], errors):
        gid = _game_ids(df["GAME_ID"])
        bad_ids = ~gid.str.fullmatch(r"\d{10}")
        if bad_ids.any():
            errors.append(f"{int(bad_ids.sum())} malformed GAME_IDs")
        _duplicates(df.assign(GAME_ID=gid), ["GAME_ID", "TEAM_ID"], errors)
        per_game = gid.value_counts()
        if (per_game > 2).any():
            errors.append(f"{int((per_game > 2).sum())} games with more than two team rows")
        _no_nulls(df, ["TEAM_ID", "TEAM_ABBREVIATION", "GAME_DATE", "PTS"], errors)
        _dates(df, "GAME_DATE", errors)
    _raise(name, errors)


def check_player_games(df: pd.DataFrame, name: str = "player_games") -> None:
    errors: List[str] = []
    if df.empty:
        return
    if _require_columns(df, ["Game_ID", "Player_ID", "GAME_DATE", "MATCHUP", "MIN", "PTS"], errors):
        _duplicates(df.assign(Game_ID=_game_ids(df["Game_ID"])), ["Game_ID", "Player_ID"], errors)
        _no_nulls(df, ["Game_ID", "Player_ID", "GAME_DATE", "MATCHUP"], errors)
        _dates(df, "GAME_DATE", errors)
    _raise(name, errors)


def check_team_model_ready(df: pd.DataFrame, name: str = "team_model_ready") -> None:
    errors: List[str] = []
    if df.empty:
        return
    if _require_columns(df, ["GAME_ID", "TEAM_ID", "GAME_DATE", "WIN"], errors):
        gid = _game_ids(df["GAME_ID"])
        _duplicates(df.assign(GAME_ID=gid), ["GAME_ID", "TEAM_ID"], errors)
        wins = df.groupby(gid)["WIN"].agg(["sum", "count"])
        paired = wins[wins["count"] == 2]
        if (paired["sum"] != 1).any():
            errors.append(f"{int((paired['sum'] != 1).sum())} games where WIN does not sum to 1")
        _no_nulls(df, ["WIN"], errors)
        _dates(df, "GAME_DATE", errors)
    _raise(name, errors)
