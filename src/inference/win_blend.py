"""Early-season blend of the WIN model probability with the pure Elo probability."""

from typing import Any, Mapping

from src.features.continuous_elo import HOME_COURT_ADVANTAGE


def elo_home_probability(home_elo: float, away_elo: float) -> float:
    return 1.0 / (1.0 + 10.0 ** (-((home_elo + HOME_COURT_ADVANTAGE) - away_elo) / 400.0))


def blend_win_probability(p_model: float, features: Mapping[str, Any]) -> float:
    """Return P(home wins) after the early-season Elo blend (identity once the weight is 0)."""
    weight = float(features.get("EARLY_SEASON_ELO_BLEND_WEIGHT", 0.0))
    if weight <= 0.0:
        return p_model
    p_elo = elo_home_probability(
        float(features.get("PRE_GAME_ELO", 1500.0)),
        float(features.get("OPP_PRE_GAME_ELO", 1500.0)),
    )
    return (1.0 - weight) * p_model + weight * p_elo
