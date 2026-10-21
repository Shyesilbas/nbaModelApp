"""Role-conditional minutes learned from recorded starter flags.

Starting does not guarantee minutes (foul trouble, blowouts), so the role is a shift in the
expectation, not a floor or a cap. A reserve promoted to starter lands near 17 + 0.5 * baseline, a
usual starter benched near 5 + 0.65 * baseline (fitted lines), blended by how often he usually starts. Baseline is the same EWMA(span 10) of previous minutes the
player model uses as MIN_EMA_10.
"""
from dataclasses import dataclass, field
from typing import Dict, Optional, Sequence

import numpy as np
import pandas as pd

BASE_SPAN = 10
RATE_WINDOW = 10
MIN_ROLE_CHANGES = 200  # promoted / benched games needed per line; below this the fixed rule stays in charge
MAX_MINUTES = 44.0


def _rate_proxy(base) -> np.ndarray:
    """Start rate guessed from baseline minutes, for players with no recorded starter games."""
    return np.clip((np.asarray(base, dtype=float) - 20.0) / 12.0, 0.0, 1.0)


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


def _line(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    return np.linalg.lstsq(np.column_stack([np.ones_like(x), x]), y, rcond=None)[0]


def _rule_minutes(coef: np.ndarray, base, flag, rate):
    """Role-adjusted minutes: a usual starter keeps his baseline when he starts, a usual reserve when he
    does not; a promoted reserve / benched starter moves along his fitted line, blended by start rate."""
    base, flag, rate = (np.asarray(x, dtype=float) for x in (base, flag, rate))
    w = np.clip(rate, 0.0, 1.0)
    up, down = coef[0] + coef[1] * base, coef[2] + coef[3] * base
    out = np.where(flag == 1, w * base + (1 - w) * up, w * down + (1 - w) * base)
    return np.clip(out, 0.0, MAX_MINUTES)


@dataclass
class RoleMinutesModel:
    coef: Optional[np.ndarray] = None  # [a, b, c, d]: promoted = a + b*base, benched = c + d*base
    rates: Dict[int, float] = field(default_factory=dict)  # each player's current start rate
    n_train: int = 0

    def minutes(self, player_id, base: float, is_starter: bool) -> Optional[float]:
        """Expected minutes in the given role, or None when there is no fitted model (caller falls back)."""
        if self.coef is None:
            return None
        rate = self.rates.get(int(player_id))
        rate = float(_rate_proxy([base])[0]) if rate is None else rate
        return float(_rule_minutes(self.coef, [base], [1.0 if is_starter else 0.0], [rate])[0])


def _training_frame(starters: pd.DataFrame, player_games: pd.DataFrame) -> pd.DataFrame:
    m = _prepare(starters, player_games)
    rec = m[m["IS_STARTER"].notna() & m["BASE"].notna()].sort_values("GAME_DATE").copy()
    rec["RATE"] = rec["RATE"].fillna(pd.Series(_rate_proxy(rec["BASE"]), index=rec.index))
    return rec


def _fit_lines(rec: pd.DataFrame) -> Optional[np.ndarray]:
    promoted = rec[(rec["IS_STARTER"] == 1) & (rec["RATE"] < 0.5)]
    benched = rec[(rec["IS_STARTER"] == 0) & (rec["RATE"] >= 0.5)]
    if len(promoted) < MIN_ROLE_CHANGES or len(benched) < MIN_ROLE_CHANGES:
        return None
    return np.concatenate([_line(promoted["BASE"].to_numpy(float), promoted["MIN"].to_numpy(float)),
                           _line(benched["BASE"].to_numpy(float), benched["MIN"].to_numpy(float))])


def fit_role_model(starters: Optional[pd.DataFrame], player_games: Optional[pd.DataFrame]) -> RoleMinutesModel:
    """Fit on games with a recorded starter flag; an unfitted model if too few role changes were seen."""
    if starters is None or starters.empty or player_games is None or player_games.empty:
        return RoleMinutesModel()
    rec = _training_frame(starters, player_games)
    flagged = rec.groupby("Player_ID")["IS_STARTER"]
    last, count = flagged.apply(lambda x: x.tail(RATE_WINDOW).mean()), flagged.size()
    rates = {int(k): float(v) for k, v in last.items() if count[k] >= 3}
    return RoleMinutesModel(coef=_fit_lines(rec), rates=rates, n_train=len(rec))


def evaluate_role_model(starters: pd.DataFrame, player_games: pd.DataFrame, holdout_frac: float = 0.2) -> dict:
    """Out-of-time MAE of the role rule vs. the previous fixed floor/cap rule, on the latest games."""
    rec = _training_frame(starters, player_games)
    cut = int(len(rec) * (1 - holdout_frac))
    tr, te = rec.iloc[:cut], rec.iloc[cut:]
    coef = _fit_lines(tr)
    truth = te["MIN"].to_numpy(float)
    static = np.where(te["IS_STARTER"] == 1, np.maximum(te["BASE"], 26.0), np.minimum(te["BASE"], 22.0))
    out = {"n_train": len(tr), "n_test": len(te),
           "mae_baseline_only": float(np.abs(te["BASE"].to_numpy() - truth).mean()),
           "mae_static_rule": float(np.abs(static - truth).mean())}
    if coef is not None:
        pred = _rule_minutes(coef, te["BASE"], te["IS_STARTER"], te["RATE"])
        out.update(mae_role_rule=float(np.abs(pred - truth).mean()), coef=np.round(coef, 3).tolist())
    return out


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
