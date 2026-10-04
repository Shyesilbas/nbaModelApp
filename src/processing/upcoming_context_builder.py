"""
upcoming_context_builder.py
----------------------------
Builds an enriched upcoming-games context dataset by joining:

  1. Upcoming games (GAME_DATE > today) from the combined schedule.
  2. Latest available pre-game team features from the V2 model-ready dataset
     (WINRATE_LAST_5/10, PTS_LAST_5/10, DAYS_REST, IS_B2B) for both home and away teams.
  3. Core player lists (Top 3 and Top 5) from the core_players analysis dataset.

Outputs
-------
  season-aware upcoming_games_context CSV and Parquet outputs

No model training.  No predictions.  No betting language.
"""

import os
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from scripts.data_paths import get_data_paths
from scripts.season_utils import get_default_season, season_to_file_token

# ─────────────────────────────────────────────
def _get_latest_team_features(v2_df: pd.DataFrame) -> pd.DataFrame:
    """
    For each TEAM_ABBREVIATION, return the single row with the most recent GAME_DATE.
    This represents the best available pre-game context for that team.
    """
    v2_df = v2_df.copy()
    v2_df["GAME_DATE"] = pd.to_datetime(v2_df["GAME_DATE"], errors="coerce")
    latest = (
        v2_df.sort_values("GAME_DATE")
             .groupby("TEAM_ABBREVIATION", as_index=False)
             .last()
    )
    feature_cols = [
        "TEAM_ABBREVIATION",
        "WINRATE_LAST_5",
        "WINRATE_LAST_10",
        "PTS_LAST_5",
        "PTS_LAST_10",
        "DAYS_REST",
        "IS_B2B",
    ]
    existing = [c for c in feature_cols if c in latest.columns]
    return latest[existing]


def _build_core_player_strings(core_df: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate core player names into comma-separated strings per team.

    Returns a DataFrame with:
        TEAM_ABBREVIATION | TOP3_CORE_PLAYERS | TOP5_CORE_PLAYERS
    """
    rows = []
    for team, grp in core_df.groupby("TEAM_ABBREVIATION"):
        grp = grp.sort_values("CORE_RANK")
        top3 = grp[grp["IS_TOP3_CORE"] == True]["PLAYER_NAME"].tolist()
        top5 = grp[grp["IS_TOP5_CORE"] == True]["PLAYER_NAME"].tolist()
        rows.append({
            "TEAM_ABBREVIATION": team,
            "TOP3_CORE_PLAYERS": ", ".join(top3),
            "TOP5_CORE_PLAYERS": ", ".join(top5),
        })
    return pd.DataFrame(rows)


def build_upcoming_games_context(save: bool = True) -> pd.DataFrame:
    """
    Build the upcoming games context dataset.

    Parameters
    ----------
    save : bool
        If True, writes output to disk (CSV + Parquet).

    Returns
    -------
    pd.DataFrame — one row per upcoming game, enriched with team features
    and core player strings.
    """
    season = get_default_season()
    paths = get_data_paths(season)
    combined_schedule_path = paths.schedule_combined
    v2_model_path = paths.team_model_ready_v2
    game_results_path = paths.game_results
    core_players_path = "data/analysis/core_players.csv"
    out_csv = paths.upcoming_context
    out_parq = paths.upcoming_context.replace(".csv", ".parquet")

    # ── 1. Load combined schedule ──────────────────────────────────────────
    if not os.path.exists(combined_schedule_path):
        raise FileNotFoundError(
            f"Combined schedule not found at {combined_schedule_path}.\n"
            "Run `python3 main.py --build-schedule-context` first (or call "
            "load_combined_schedule() to generate it)."
        )

    schedule_df = pd.read_csv(combined_schedule_path, dtype={"GAME_ID": str})
    schedule_df["GAME_DATE"] = pd.to_datetime(schedule_df["GAME_DATE"], errors="coerce")

    today = pd.Timestamp(date.today())
    upcoming = schedule_df[schedule_df["GAME_DATE"] >= today].copy()
    print(f"\n  📅 Upcoming games found: {len(upcoming)} (from {today.date()} onwards)")

    if upcoming.empty:
        print("  ⚠️  No upcoming games found in the combined schedule.")
        return upcoming

    # ── 2. Load V2 team features and get latest per team ──────────────────
    if not os.path.exists(v2_model_path):
        token = season_to_file_token(season or get_default_season())
        alt_path = os.path.join("data", "processed", f"team_model_ready_v2_{token}.csv")
        if os.path.exists(alt_path):
            v2_model_path = alt_path
        else:
            raise FileNotFoundError(
                f"V2 model-ready dataset not found at {v2_model_path}.\n"
                "Run `python3 main.py --build-model-dataset` first."
            )

    v2_df = pd.read_csv(v2_model_path)
    latest_features = _get_latest_team_features(v2_df)
    print(f"  📊 Loaded V2 team features for {len(latest_features)} teams")

    # ── 3. Join home team features ─────────────────────────────────────────
    home_features = latest_features.rename(columns={
        "TEAM_ABBREVIATION": "HOME_TEAM_ABBREVIATION",
        "WINRATE_LAST_5":    "HOME_TEAM_WINRATE_LAST_5",
        "WINRATE_LAST_10":   "HOME_TEAM_WINRATE_LAST_10",
        "PTS_LAST_5":        "HOME_TEAM_PTS_LAST_5",
        "PTS_LAST_10":       "HOME_TEAM_PTS_LAST_10",
        "DAYS_REST":         "HOME_TEAM_DAYS_REST",
        "IS_B2B":            "HOME_TEAM_IS_B2B",
    })

    away_features = latest_features.rename(columns={
        "TEAM_ABBREVIATION": "AWAY_TEAM_ABBREVIATION",
        "WINRATE_LAST_5":    "AWAY_TEAM_WINRATE_LAST_5",
        "WINRATE_LAST_10":   "AWAY_TEAM_WINRATE_LAST_10",
        "PTS_LAST_5":        "AWAY_TEAM_PTS_LAST_5",
        "PTS_LAST_10":       "AWAY_TEAM_PTS_LAST_10",
        "DAYS_REST":         "AWAY_TEAM_DAYS_REST",
        "IS_B2B":            "AWAY_TEAM_IS_B2B",
    })

    ctx = upcoming.merge(home_features, on="HOME_TEAM_ABBREVIATION", how="left")
    ctx = ctx.merge(away_features, on="AWAY_TEAM_ABBREVIATION", how="left")

    # ── 4. Add core player strings ─────────────────────────────────────────
    if not os.path.exists(core_players_path):
        print(f"  ⚠️  Core players file not found at {core_players_path}. Skipping player context.")
        ctx["HOME_TOP3_CORE_PLAYERS"] = None
        ctx["HOME_TOP5_CORE_PLAYERS"] = None
        ctx["AWAY_TOP3_CORE_PLAYERS"] = None
        ctx["AWAY_TOP5_CORE_PLAYERS"] = None
    else:
        core_df  = pd.read_csv(core_players_path)
        core_str = _build_core_player_strings(core_df)

        home_core = core_str.rename(columns={
            "TEAM_ABBREVIATION": "HOME_TEAM_ABBREVIATION",
            "TOP3_CORE_PLAYERS": "HOME_TOP3_CORE_PLAYERS",
            "TOP5_CORE_PLAYERS": "HOME_TOP5_CORE_PLAYERS",
        })
        away_core = core_str.rename(columns={
            "TEAM_ABBREVIATION": "AWAY_TEAM_ABBREVIATION",
            "TOP3_CORE_PLAYERS": "AWAY_TOP3_CORE_PLAYERS",
            "TOP5_CORE_PLAYERS": "AWAY_TOP5_CORE_PLAYERS",
        })
        ctx = ctx.merge(home_core, on="HOME_TEAM_ABBREVIATION", how="left")
        ctx = ctx.merge(away_core, on="AWAY_TEAM_ABBREVIATION", how="left")
        print(f"  🏀 Core player strings added for {len(core_str)} teams")

    # ── 5. Playoff series context ──────────────────────────────────────────
    # For each upcoming playoff/Finals game, count wins from completed h2h games
    # in the same season before the game date.
    ctx["HOME_SERIES_WINS"] = None
    ctx["AWAY_SERIES_WINS"] = None
    ctx["IS_ELIMINATION_GAME"] = None
    ctx["CAN_CLINCH_SERIES"] = None

    playoff_season_types = {"Playoffs", "PlayIn", "NBA Finals"}

    if Path(game_results_path).exists():
        results_df = pd.read_csv(game_results_path, dtype={"GAME_ID": str}, low_memory=False)
        results_df["GAME_DATE"] = pd.to_datetime(results_df["GAME_DATE"], errors="coerce")
        completed_playoffs = results_df[
            results_df["SEASON_TYPE"].isin(playoff_season_types)
        ].copy()

        for idx, row in ctx.iterrows():
            if row.get("SEASON_TYPE") not in playoff_season_types:
                continue

            home = row["HOME_TEAM_ABBREVIATION"]
            away = row["AWAY_TEAM_ABBREVIATION"]
            game_dt = row["GAME_DATE"]

            h2h_prior = completed_playoffs[
                (
                    ((completed_playoffs["HOME_TEAM_ABBREVIATION"] == home) & (completed_playoffs["AWAY_TEAM_ABBREVIATION"] == away)) |
                    ((completed_playoffs["HOME_TEAM_ABBREVIATION"] == away) & (completed_playoffs["AWAY_TEAM_ABBREVIATION"] == home))
                ) &
                (completed_playoffs["GAME_DATE"] < game_dt)
            ]

            wins = {home: 0, away: 0}
            for _, gr in h2h_prior.iterrows():
                g_home = gr["HOME_TEAM_ABBREVIATION"]
                g_away = gr["AWAY_TEAM_ABBREVIATION"]
                winner = gr.get("WINNER_TEAM_ABBREVIATION")
                h_score = gr.get("HOME_SCORE")
                a_score = gr.get("AWAY_SCORE")
                if pd.notna(winner) and winner in wins:
                    wins[winner] += 1
                elif pd.notna(h_score) and pd.notna(a_score):
                    if h_score > a_score:
                        wins[g_home] += 1
                    elif a_score > h_score:
                        wins[g_away] += 1

            home_wins = wins[home]
            away_wins = wins[away]
            # In a Best-of-7: 3 wins == clinch/elimination threshold
            can_clinch_val = int(home_wins == 3 or away_wins == 3)
            is_elim_val = can_clinch_val

            ctx.at[idx, "HOME_SERIES_WINS"] = int(home_wins)
            ctx.at[idx, "AWAY_SERIES_WINS"] = int(away_wins)
            ctx.at[idx, "IS_ELIMINATION_GAME"] = is_elim_val
            ctx.at[idx, "CAN_CLINCH_SERIES"] = can_clinch_val

        print(f"  Playoff series context computed for {ctx['IS_ELIMINATION_GAME'].notna().sum()} playoff games")
    else:
        print(f"  Warning: game_results not found at {game_results_path}, skipping series context")

    # ── 6. Sort and reset index ────────────────────────────────────────────
    ctx = ctx.sort_values("GAME_DATE").reset_index(drop=True)

    # ── 7. Save ────────────────────────────────────────────────────────────
    if save:
        season_dir = Path(out_csv).parent
        season_dir.mkdir(parents=True, exist_ok=True)
        ctx.to_csv(out_csv, index=False)
        ctx.to_parquet(out_parq, index=False, engine="pyarrow")
        print(f"  Saved: {out_csv}")
        print(f"  Saved: {out_parq}")

    return ctx
