from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
FILES = sorted(ROOT.glob("data/season=*/analysis/team_rosters*.csv"))


@pytest.mark.parametrize("path", FILES, ids=lambda p: f"{p.parent.parent.name}/{p.name}")
def test_importance_score_matches_formula(path):
    df = pd.read_csv(path)
    expected = df.AVG_MIN * 0.5 + df.AVG_PTS + df.AVG_AST * 0.8 + df.AVG_REB * 0.6
    assert ((df.IMPORTANCE_SCORE - expected).abs() <= 0.1).all()
