"""Role-conditional minutes learned from recorded starter flags.

Starting does not guarantee minutes (foul trouble, blowouts), so the role is a shift in the
expectation, not a floor or a cap: minutes = f(baseline, started, usual start rate), fitted on
games with a recorded starter flag. Baseline is the same EWMA(span 10) of previous minutes the
player model uses as MIN_EMA_10.
"""
from dataclasses import dataclass, field
from typing import Dict, Optional, Sequence

import numpy as np
import pandas as pd

BASE_SPAN = 10
RATE_WINDOW = 10
MIN_TRAIN_ROWS = 5000  # below this the fixed rule stays in charge
RIDGE = 1.0
MAX_MINUTES = 44.0


def _rate_proxy(base) -> np.ndarray:
    """Start rate guessed from baseline minutes, for players with no recorded starter games."""
    return np.clip((np.asarray(base, dtype=float) - 20.0) / 12.0, 0.0, 1.0)


def _features(base, start, rate) -> np.ndarray:
    base, start, rate = (np.asarray(x, dtype=float) for x in (base, start, rate))
    return np.column_stack([np.ones_like(base), base, start, rate, start * rate])


def _prepare(starters: pd.DataFrame, player_games: pd.DataFrame) -> pd.DataFrame:
    """One row per played game: MIN, baseline before it, starter flag and start rate before it."""
    g = player_games[["Game_ID", "Player_ID", "GAME_DATE", "MIN"]].copy()
    g["Game_ID"] = g["Game_ID"].astype(str).str.zfill(10)
    g["GAME_DATE"] = pd.to_datetime(g["GAME_DATE"], errors="coerce", format="mixed")
    g["MIN"] = pd.to_numeric(g["MIN"], errors="coerce")
    g = g[g["MIN"] > 0].sort_values(["Player_ID", "GAME_DATE", "Game_ID"], kind="stable")
    g["BASE"] = g.groupby("Player_ID", sort=False)["MIN"].transform(
        lambda x: x.shift(1).ewm(span=BASE_SPAN, min_periods=1).mean()
    )
    s = starters[["Game_ID", "Player_ID", "IS_STARTER"]].copy()
    s["Game_ID"] = s["Game_ID"].astype(str).str.zfill(10)
    m = g.merge(s, on=["Game_ID", "Player_ID"], how="left")
    # rate over the previous recorded games only: unrecorded games are NaN and skipped by min_periods
    m["RATE"] = m.groupby("Player_ID", sort=False)["IS_STARTER"].transform(
        lambda x: x.shift(1).rolling(RATE_WINDOW, min_periods=3).mean()
    )
    return m


@dataclass
class RoleMinutesModel:
    coef: Optional[np.ndarray] = None
    rates: Dict[int, float] = field(default_factory=dict)  # each player's current start rate
    n_train: int = 0

    def minutes(self, player_id, base: float, is_starter: bool) -> Optional[float]:
        """Expected minutes in the given role, or None when there is no fitted model (caller falls back)."""
        if self.coef is None:
            return None
        rate = self.rates.get(int(player_id))
        rate = float(_rate_proxy([base])[0]) if rate is None else rate
        pred = float((_features([base], [1.0 if is_starter else 0.0], [rate]) @ self.coef)[0])
        return float(np.clip(pred, 0.0, MAX_MINUTES))


def fit_role_model(starters: Optional[pd.DataFrame], player_games: Optional[pd.DataFrame]) -> RoleMinutesModel:
    """Fit on every game with a recorded starter flag; an empty model if there is too little data."""
    if starters is None or starters.empty or player_games is None or player_games.empty:
        return RoleMinutesModel()
    m = _prepare(starters, player_games)
    rec = m[m["IS_STARTER"].notna() & m["BASE"].notna()].copy()
    # a player's current rate: his last RATE_WINDOW recorded games
    flagged = m[m["IS_STARTER"].notna()].groupby("Player_ID")["IS_STARTER"]
    last, count = flagged.apply(lambda x: x.tail(RATE_WINDOW).mean()), flagged.size()
    rates = {int(k): float(v) for k, v in last.items() if count[k] >= 3}
    rec["RATE"] = rec["RATE"].fillna(pd.Series(_rate_proxy(rec["BASE"]), index=rec.index))
    if len(rec) < MIN_TRAIN_ROWS:
        return RoleMinutesModel(rates=rates, n_train=len(rec))
    X = _features(rec["BASE"], rec["IS_STARTER"], rec["RATE"])
    y = rec["MIN"].to_numpy(dtype=float)
    pen = RIDGE * np.eye(X.shape[1])
    pen[0, 0] = 0.0
    coef = np.linalg.solve(X.T @ X + pen, X.T @ y)
    return RoleMinutesModel(coef=coef, rates=rates, n_train=len(rec))


def evaluate_role_model(starters: pd.DataFrame, player_games: pd.DataFrame, holdout_frac: float = 0.2) -> dict:
    """Out-of-time MAE of the role model vs. the previous fixed floor/cap rule, on the latest games."""
    m = _prepare(starters, player_games)
    rec = m[m["IS_STARTER"].notna() & m["BASE"].notna()].sort_values("GAME_DATE").copy()
    rec["RATE"] = rec["RATE"].fillna(pd.Series(_rate_proxy(rec["BASE"]), index=rec.index))
    cut = int(len(rec) * (1 - holdout_frac))
    tr, te = rec.iloc[:cut], rec.iloc[cut:]
    X, y = _features(tr["BASE"], tr["IS_STARTER"], tr["RATE"]), tr["MIN"].to_numpy(dtype=float)
    pen = RIDGE * np.eye(X.shape[1])
    pen[0, 0] = 0.0
    coef = np.linalg.solve(X.T @ X + pen, X.T @ y)
    pred = np.clip(_features(te["BASE"], te["IS_STARTER"], te["RATE"]) @ coef, 0.0, MAX_MINUTES)
    static = np.where(te["IS_STARTER"] == 1, np.maximum(te["BASE"], 26.0), np.minimum(te["BASE"], 22.0))
    truth = te["MIN"].to_numpy(dtype=float)
    return {
        "n_train": len(tr), "n_test": len(te),
        "mae_baseline_only": float(np.abs(te["BASE"].to_numpy() - truth).mean()),
        "mae_static_rule": float(np.abs(static - truth).mean()),
        "mae_role_model": float(np.abs(pred - truth).mean()),
        "coef": dict(zip(["const", "base", "start", "rate", "start_x_rate"], np.round(coef, 3).tolist())),
    }


def load_role_inputs(seasons: Sequence[str]):
    """(starters, player_games) concatenated over the seasons that have files."""
    from scripts.data_paths import get_data_paths
    from src.ingestion.starters_fetcher import starters_path
    st, pg = [], []
    for s in seasons:
        p = starters_path(s)
        g = get_data_paths(s).player_games_raw
        if p.exists():
            st.append(pd.read_csv(p, dtype={"Game_ID": str}))
        try:
            pg.append(pd.read_csv(g, dtype={"Game_ID": str}, usecols=["Game_ID", "Player_ID", "GAME_DATE", "MIN"]))
        except FileNotFoundError:
            pass
    return (pd.concat(st, ignore_index=True) if st else None, pd.concat(pg, ignore_index=True) if pg else None)
