"""Reconcile player projections with the team score.

Player projections assume the player plays, so a rotation's projected points add up to ~20% more than
the team scores: some of those players sit. The excess over the predicted team score is taken from each
player in proportion to (1 - P(he plays)) x his projection, so stars barely move and uncertain bench
players carry the cut; the same per-player factor applies to rebounds and assists.

2025-26 replay, 196 games (reports/audits/2026-10-22_player_pipeline_audit/): against no reconciliation,
PTS MAE on players who played 4.981 -> 4.980, on all active players (0 when they sat) 6.645 -> 5.983,
team sum vs actual points 25.9 -> 9.8; a uniform scale or splitting the team score by usage x minutes
biased the top scorer low (MAE 6.86 / 7.18 vs 6.78).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# P(a rotation candidate plays) by his EMA-10 minutes, regular seasons 2023-24..2025-26:
# (upper bound of the minutes bucket, share of games played).
PLAY_PROBABILITY_BY_MINUTES = [(5, 0.267), (8, 0.380), (12, 0.514), (16, 0.655), (20, 0.729), (25, 0.756), (30, 0.788), (float("inf"), 0.823)]


def play_probability(minutes: pd.Series) -> np.ndarray:
    m = pd.to_numeric(minutes, errors="coerce").fillna(0.0).to_numpy(dtype=float)
    bounds = np.array([b for b, _ in PLAY_PROBABILITY_BY_MINUTES])
    probs = np.array([p for _, p in PLAY_PROBABILITY_BY_MINUTES])
    return probs[np.searchsorted(bounds, m, side="left").clip(max=len(probs) - 1)]


def reconciliation_factors(points: pd.Series, minutes: pd.Series, team_score: float, play_prob=None) -> np.ndarray:
    """Per-player multipliers that bring the summed points down to ``team_score`` (never up).

    ``play_prob`` carries the reported probability for players listed Questionable or Doubtful (NaN
    elsewhere); everyone else uses the minutes-based rate."""
    p = pd.to_numeric(points, errors="coerce").fillna(0.0).to_numpy(dtype=float)
    excess = p.sum() - float(team_score)
    prob = play_probability(minutes)
    if play_prob is not None:
        given = pd.to_numeric(pd.Series(np.asarray(play_prob, dtype=object)), errors="coerce").to_numpy(dtype=float)
        prob = np.where(np.isnan(given), prob, given)
    weight = (1.0 - prob) * p
    if excess <= 0 or weight.sum() <= 0:
        return np.ones_like(p)
    cut = excess * weight / weight.sum()
    new = np.clip(p - cut, 0.0, None)
    return np.where(p > 0, new / np.where(p > 0, p, 1.0), 1.0)


def team_reconciliation(players_df: pd.DataFrame, team_score: float):
    """Per-player factors bringing the team's projected points down to its score (team-level ratio too)."""
    factors = np.ones(len(players_df))
    playing = players_df["STATUS"].astype(str).str.upper().isin(["ACTIVE", "RESTRICTED", "QUESTIONABLE", "DOUBTFUL"]).to_numpy() if "STATUS" in players_df.columns else np.ones(len(players_df), bool)
    if team_score is not None and playing.any():
        rows = players_df[playing]
        factors[playing] = reconciliation_factors(rows["RAW_PROJ_PTS"], rows["MIN_EMA_10"], team_score,
                                                  rows["PLAY_PROB"] if "PLAY_PROB" in rows.columns else None)
    pts = players_df["RAW_PROJ_PTS"].to_numpy(dtype=float) * playing
    scale = float((pts * factors).sum() / pts.sum()) if pts.sum() > 0 else 1.0
    return factors, scale
