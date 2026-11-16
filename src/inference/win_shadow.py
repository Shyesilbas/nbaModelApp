"""Shadow WIN candidates: scored next to production in the paper ledger, never served.

A candidate lives under models/experimental/ with a JSON sidecar naming its features. It sees
the same pregame feature row and the same early-season Elo blend as the production model, so
the two ledger columns differ only by the model.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Mapping

import pandas as pd

from src.inference.win_blend import blend_win_probability

ROOT = Path(__file__).resolve().parents[2]
SHADOW_MODELS = {
    "win_live_roster_v1": ROOT / "models/experimental/win_live_roster_shadow.pkl",
}


@lru_cache(maxsize=8)
def _load(path_str: str, _mtime_ns: int):
    import joblib

    path = Path(path_str)
    meta = json.loads(path.with_suffix(".json").read_text())
    return joblib.load(path), list(meta["features"])


def shadow_home_win_probabilities(features: Mapping[str, Any]) -> Dict[str, float]:
    out: Dict[str, float] = {}
    for name, path in SHADOW_MODELS.items():
        if not path.exists():
            continue
        model, cols = _load(str(path), path.stat().st_mtime_ns)
        row = pd.DataFrame([[features.get(c, float("nan")) for c in cols]], columns=cols)
        out[name] = round(float(blend_win_probability(float(model.predict_proba(row)[0][1]), features)), 4)
    return out
