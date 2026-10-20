import pytest

from scripts.data_paths import get_data_paths
from scripts.season_utils import normalize_season


@pytest.mark.parametrize("raw,want", [
    ("2026-27", "2026-27"), ("2026_27", "2026-27"), ("2026-2027", "2026-27"),
    ("season=2026-27", "2026-27"), ("202627", "2026-27"),
])
def test_normalize_ok(raw, want):
    assert normalize_season(raw) == want


@pytest.mark.parametrize("raw", ["2026-20", "2026/27", "26-27", "2026-2030", "2026-27-x1"[:0] or "abc"])
def test_normalize_rejects(raw):
    with pytest.raises(ValueError):
        normalize_season(raw)


def test_env_overrides_yaml(monkeypatch):
    monkeypatch.setenv("NBA_CURRENT_SEASON", "2025-26")
    assert get_data_paths().season_dir.endswith("season=2025-26")


def test_date_to_season_boundary():
    import pandas as pd
    from scripts.season_utils import date_to_season, season_labels
    cases = {"2026-07-31": "2025-26", "2026-08-01": "2026-27", "2026-09-30": "2026-27", "2027-01-05": "2026-27"}
    for d, want in cases.items():
        assert date_to_season(pd.Timestamp(d)) == want
    assert list(season_labels(pd.Series(list(cases)))) == list(cases.values())
