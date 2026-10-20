"""Add ABS_DELTA / OPP_ABS_DELTA / ABS_DIFF to the existing team_model_ready_v3 files.

    python -m scripts.features.add_roster_absence

Equivalent to what scripts/rebuild_training_data.py now does per season, without
rebuilding every other feature. Idempotent.
"""
from __future__ import annotations

import glob
from pathlib import Path

import pandas as pd

from src.features.roster_absence import add_absence_columns

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    logs = pd.concat(
        [pd.read_csv(p, dtype={"Game_ID": str}) for p in sorted(glob.glob(str(ROOT / "data/season=*/raw/player_games.csv")))],
        ignore_index=True,
    )
    for path in sorted(glob.glob(str(ROOT / "data/processed/team_model_ready_v3_*.csv"))):
        df = pd.read_csv(path, dtype={"GAME_ID": str})
        out = add_absence_columns(df, logs)
        out.to_csv(path, index=False)
        if Path(path).with_suffix('.parquet').exists():
            out.to_parquet(Path(path).with_suffix('.parquet'), index=False)
        print(f"{Path(path).name}: {len(out)} rows, ABS_DIFF std {out['ABS_DIFF'].std():.2f}, non-zero {(out['ABS_DIFF'] != 0).mean():.0%}")


if __name__ == "__main__":
    main()
