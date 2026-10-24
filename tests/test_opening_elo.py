import json
from pathlib import Path

from src.features.opening_elo import build_opening_elo

ROOT = Path(__file__).resolve().parents[1]


def test_published_2026_27_opening_elo_matches_builder():
    saved = json.loads((ROOT / "data/season=2026-27/analysis/team_elo_initial.json").read_text())
    built, adjustment, prev = build_opening_elo("2026-27")
    assert prev[-1] == "2025-26"
    assert set(built) == set(saved)
    assert max(abs(built[t] - saved[t]) for t in saved) < 0.01
    assert adjustment
