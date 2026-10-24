"""Merge walk-forward WIN and SCORE predictions of all test seasons into one per-game CSV and print total-bias breakdowns."""
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[4]
B = ROOT / "reports" / "backtests"
SRC = {
    "2021-22": ("2026-10-23_win_metadata_check_early", "2021_22"),
    "2022-23": ("2026-10-23_win_metadata_check_early", "2022_23"),
    "2023-24": ("2026-10-23_win_metadata_check_prev", "2023_24"),
    "2024-25": ("2026-10-23_win_metadata_check_prev", "2024_25"),
    "2025-26": ("2026-10-23_win_metadata_check", "2025_26"),
}
frames = []
for season, (folder, tok) in SRC.items():
    w = pd.read_parquet(B / folder / f"win_{tok}.parquet")
    s = pd.read_parquet(B / folder / f"score_{tok}.parquet")
    m = w.merge(s, on="GAME_ID")
    m.insert(0, "SEASON", season)
    frames.append(m)
d = pd.concat(frames, ignore_index=True).sort_values(["GAME_DATE", "GAME_ID"])
d["PRED_HOME_WIN"] = (d.P_HOME_WIN > 0.5).astype(int)
d["WIN_CORRECT"] = (d.PRED_HOME_WIN == d.HOME_WIN).astype(int)
d["TOTAL_ERROR"] = d.PRED_TOTAL - d.REAL_TOTAL
d["MARGIN_ERROR"] = d.PRED_MARGIN - d.REAL_MARGIN
d.to_csv(B / "2026-10-23_all_seasons_per_game" / "per_game_predictions.csv", index=False)
print(d.shape, d.columns.tolist())

d["MONTH"] = pd.to_datetime(d.GAME_DATE).dt.to_period("M").astype(str)
print(d.groupby("SEASON").agg(n=("GAME_ID", "size"), real=("REAL_TOTAL", "mean"), pred=("PRED_TOTAL", "mean"), bias=("TOTAL_ERROR", "mean"), mae=("TOTAL_ERROR", lambda x: x.abs().mean()), pstd=("PRED_TOTAL", "std"), rstd=("REAL_TOTAL", "std")).round(2))
d["EARLY"] = d.groupby("SEASON").cumcount() < 150
print(d.groupby(["SEASON", d.MONTH.str[-2:]]).TOTAL_ERROR.mean().unstack(0).round(1))
d["PBIN"] = pd.qcut(d.PRED_TOTAL, 5)
print(d.groupby("PBIN", observed=True).agg(n=("GAME_ID", "size"), pred=("PRED_TOTAL", "mean"), real=("REAL_TOTAL", "mean")).round(1))
print("OT games bias", d.groupby("OVERTIME").TOTAL_ERROR.agg(["size", "mean"]).round(2))
print("slope real~pred", d.groupby("SEASON").apply(lambda g: g.REAL_TOTAL.cov(g.PRED_TOTAL) / g.PRED_TOTAL.var()).round(2).to_dict())
