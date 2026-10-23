"""ScorePredictor and the API score service must give the same total and margin from the same artifacts and features.

Documented differences that stay as they are:
- the API rounds every output to 0.1, ScorePredictor returns unrounded values;
- a missing model feature raises ValueError in the API, ScorePredictor fills it with 0.0;
- given a win probability, ScorePredictor flips the margin sign to agree with it (the API only warns).
"""
import json
import types

import joblib
import numpy as np
import pandas as pd
import pytest
from sklearn.linear_model import Ridge

from src.api import model_loader
from src.api.schemas import ScorePredictionRequest
from src.api.services import score_prediction, win_prediction
from src.inference import score_predictor

PACE = ["PACE_LAST_10", "OPP_PACE_LAST_10"]
RTG = ["OFF_RTG_LAST_10", "OPP_DEF_RTG_LAST_10", "ABS_DELTA", "OPP_ABS_DELTA"]
MARGIN = ["ELO_DIFF", "PACE_LAST_10"]
IND = ["is_playoff", "home_b2b", "away_b2b", "home_rest_advantage", "away_rest_advantage"]


def _fit(cols, target_mean, seed):
    rng = np.random.default_rng(seed)
    X = pd.DataFrame(rng.normal(100, 5, (200, len(cols))), columns=cols)
    return Ridge(alpha=1.0).fit(X, target_mean + X.sum(axis=1) * 0.01 + rng.normal(0, 1, 200))


@pytest.fixture
def artifacts(tmp_path, monkeypatch):
    rng = np.random.default_rng(0)
    ind = pd.DataFrame(rng.integers(0, 2, (300, len(IND))).astype(float), columns=IND)
    models = {
        "pace": _fit(PACE, 98.0, 1), "home_rtg": _fit(RTG, 112.0, 2), "away_rtg": _fit(RTG, 110.0, 3),
        "margin": _fit(MARGIN, 2.0, 4),
        "ridge_total": Ridge(alpha=1.0).fit(ind, -2.0 + 7.0 * ind["is_playoff"] + rng.normal(0, 1, 300)),
        "ridge_margin": Ridge(alpha=1.0).fit(ind, 0.5 * ind["home_rest_advantage"] + rng.normal(0, 1, 300)),
    }
    paths = {}
    for name, m in models.items():
        paths[name] = tmp_path / f"score_model_{name}.pkl"
        joblib.dump(m, paths[name])
    paths["metadata"] = tmp_path / "score_metadata.json"
    paths["metadata"].write_text(json.dumps({"version": "test", "pace_features": PACE, "home_off_rtg_features": RTG,
                                             "away_off_rtg_features": RTG, "margin_features": MARGIN}))
    keys = {"total_model_path": "pace", "home_model_path": "home_rtg", "away_model_path": "away_rtg",
            "margin_model_path": "margin", "ridge_total_path": "ridge_total", "ridge_margin_path": "ridge_margin",
            "metadata_path": "metadata"}

    def resolve(section, key, default):
        return paths[keys[key]]

    monkeypatch.setattr(model_loader, "resolve_artifact_path", resolve)
    monkeypatch.setattr(score_predictor, "resolve_artifact_path", resolve)
    return paths, models


def _features(playoff, home_b2b, rest, opp_rest, pace=(99.0, 101.0), seed=0):
    rng = np.random.default_rng(seed)
    home = {"PACE_LAST_10": pace[0], "OPP_PACE_LAST_10": pace[1], "OFF_RTG_LAST_10": 114.0 + rng.normal(),
            "OPP_DEF_RTG_LAST_10": 111.0 + rng.normal(), "ABS_DELTA": -3.0, "OPP_ABS_DELTA": 1.5, "ELO_DIFF": 40.0,
            "IS_PLAYOFF": playoff, "IS_B2B": home_b2b, "OPP_IS_B2B": 0, "DAYS_REST": rest, "OPP_DAYS_REST": opp_rest}
    away = dict(home, OFF_RTG_LAST_10=109.0 + rng.normal(), OPP_DEF_RTG_LAST_10=113.0, ABS_DELTA=1.5, OPP_ABS_DELTA=-3.0)
    return home, away


def _api(monkeypatch, f, fa):
    loader = model_loader.ScoreModelLoader()
    loader.load()
    monkeypatch.setattr(win_prediction, "score_loader", loader)
    req = ScorePredictionRequest(home_team="AAA", away_team="BBB", prediction_date="2026-04-25")
    return score_prediction.predict_score(req, features=f, away_features=fa, win_response=types.SimpleNamespace(predicted_winner="AAA"))


CASES = [
    dict(playoff=1, home_b2b=0, rest=2.0, opp_rest=2.0),
    dict(playoff=0, home_b2b=1, rest=1.0, opp_rest=3.0),
    dict(playoff=0, home_b2b=0, rest=3.0, opp_rest=1.0),
    dict(playoff=1, home_b2b=0, rest=4.0, opp_rest=2.0, pace=(104.0, 95.0)),
]


@pytest.mark.parametrize("case", CASES)
def test_same_correction_raw_and_total(artifacts, monkeypatch, case):
    _, models = artifacts
    f, fa = _features(**case)
    sp = score_predictor.ScorePredictor().predict("AAA", "BBB", "2026-04-25", features=f, away_features=fa)
    api = _api(monkeypatch, f, fa)

    raw = models["pace"].predict(pd.DataFrame([[f[c] for c in PACE]], columns=PACE))[0] * (
        models["home_rtg"].predict(pd.DataFrame([[f[c] for c in RTG]], columns=RTG))[0]
        + models["away_rtg"].predict(pd.DataFrame([[fa[c] for c in RTG]], columns=RTG))[0]) / 100.0
    ind = pd.DataFrame([[float(f["IS_PLAYOFF"] == 1), float(f["IS_B2B"] == 1), float(f["OPP_IS_B2B"] == 1),
                         float(f["DAYS_REST"] > f["OPP_DAYS_REST"]), float(f["OPP_DAYS_REST"] > f["DAYS_REST"])]], columns=IND)
    corrected = raw - models["ridge_total"].predict(ind)[0]

    # raw stage and correction are shared: ScorePredictor's unrounded total is raw minus the same correction
    assert abs(sp["predicted_pace"] * (sp["home_off_rtg"] + sp["away_off_rtg"]) / 100.0 - raw) < 1e-9
    assert abs(sp["predicted_total"] - corrected) < 1e-9
    # the API differs only by its documented rounding to 0.1
    assert api.predicted_total_points == round(corrected, 1)
    assert abs(api.predicted_total_points - sp["predicted_total"]) <= 0.05 + 1e-9

    margin = models["margin"].predict(pd.DataFrame([[f[c] for c in MARGIN]], columns=MARGIN))[0] - models["ridge_margin"].predict(ind)[0]
    assert abs(sp["predicted_margin"] - margin) < 1e-9
    assert api.predicted_margin == round(margin, 1)
    assert abs(sp["predicted_home_score"] - (corrected + margin) / 2.0) < 1e-9
    assert api.predicted_home_score == round((corrected + margin) / 2.0, 1)


def test_correction_is_skipped_by_both_when_ridge_models_are_missing(artifacts, monkeypatch):
    paths, _ = artifacts
    paths["ridge_total"].unlink()
    f, fa = _features(playoff=1, home_b2b=0, rest=2.0, opp_rest=2.0)
    sp = score_predictor.ScorePredictor()
    assert sp.ridge_total_model is None
    out = sp.predict("AAA", "BBB", "2026-04-25", features=f, away_features=fa)
    raw = out["predicted_pace"] * (out["home_off_rtg"] + out["away_off_rtg"]) / 100.0
    assert abs(out["predicted_total"] - raw) < 1e-9
    api = _api(monkeypatch, f, fa)
    assert api.predicted_total_points == round(raw, 1)


def test_missing_model_feature_policy(artifacts, monkeypatch):
    f, fa = _features(playoff=0, home_b2b=0, rest=2.0, opp_rest=2.0)
    del f["OPP_PACE_LAST_10"]
    with pytest.raises(ValueError, match="Missing features"):
        _api(monkeypatch, f, fa)
    out = score_predictor.ScorePredictor().predict("AAA", "BBB", "2026-04-25", features=f, away_features=fa)
    assert np.isfinite(out["predicted_total"])  # ScorePredictor keeps its zero-fill policy


def test_missing_indicator_inputs_default_the_same_way(artifacts, monkeypatch):
    f, fa = _features(playoff=1, home_b2b=1, rest=3.0, opp_rest=1.0)
    for k in ("IS_PLAYOFF", "IS_B2B", "OPP_IS_B2B", "DAYS_REST", "OPP_DAYS_REST"):
        f.pop(k)  # both paths default a missing indicator input to 0
    sp = score_predictor.ScorePredictor().predict("AAA", "BBB", "2026-04-25", features=f, away_features=fa)
    api = _api(monkeypatch, f, fa)
    assert api.predicted_total_points == round(sp["predicted_total"], 1)
