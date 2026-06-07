"""
Build matchup features for the deployed win-probability model.
Usage (CLI):
  python scripts/build_matchup_features.py --home TEAM_ABBR --away TEAM_ABBR --prediction-date YYYY-MM-DD

Outputs a JSON mapping of feature_name -> value in the exact order defined by models/feature_columns.json

Requirements met:
 - Uses only games with GAME_DATE < prediction_date
 - Performs validation checks to prevent leakage
 - Returns all features in the order from feature_columns.json
"""
import argparse
import json
from pathlib import Path
from datetime import datetime
import pandas as pd
import numpy as np
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.data_paths import get_data_paths
from scripts.artifact_paths import resolve_artifact_path

MODEL_FEATURE_COLS = resolve_artifact_path("win_model", "feature_columns_path", "models/feature_columns.json")

def _load_team_features(season: str = None):
    paths = get_data_paths(season)
    p_parq = Path(paths.team_features.replace(".csv", ".parquet"))
    p_csv = Path(paths.team_features)
    for p in [p_parq, p_csv]:
        if p.exists():
            if p.suffix == ".parquet":
                return pd.read_parquet(p)
            else:
                return pd.read_csv(p)
    raise FileNotFoundError(f"team_games_features not found; expected at {p_parq} or {p_csv}")


def _load_game_results(season: str = None):
    paths = get_data_paths(season)
    p_parq = Path(paths.game_results.replace(".csv", ".parquet"))
    p_csv = Path(paths.game_results)
    for p in [p_parq, p_csv]:
        if p.exists():
            if p.suffix == ".parquet":
                return pd.read_parquet(p)
            else:
                return pd.read_csv(p)
    raise FileNotFoundError(f"game_results not found; expected at {p_parq} or {p_csv}")


def _ensure_datetime(df, col):
    if not pd.api.types.is_datetime64_any_dtype(df[col]):
        df[col] = pd.to_datetime(df[col], errors="coerce")


def build_features(home_team: str, away_team: str, prediction_date: str, season: str = None):
    """Return Ordered dict (feature_name -> value) matching models/feature_columns.json.
    home_team and away_team should be team abbreviations (e.g., "LAL"). prediction_date is YYYY-MM-DD.
    """
    pred_dt = pd.to_datetime(prediction_date)

    feat_cols = json.loads(MODEL_FEATURE_COLS.read_text())

    team_df = _load_team_features(season)
    games_df = _load_game_results(season)

    # Normalize datetimes
    _ensure_datetime(team_df, "GAME_DATE")
    _ensure_datetime(games_df, "GAME_DATE")

    # Filtering to games strictly before prediction date to prevent leakage
    team_df = team_df[team_df["GAME_DATE"] < pred_dt].copy()
    games_df = games_df[games_df["GAME_DATE"] < pred_dt].copy()

    # Basic validation
    if team_df.empty:
        raise RuntimeError("No team-level games found before prediction_date; check data or date range")

    def last_row_for(team_abbr: str):
        df = team_df[team_df["TEAM_ABBREVIATION"] == team_abbr]
        if df.empty:
            return None
        df = df.sort_values("GAME_DATE")
        return df.iloc[-1]

    home_row = last_row_for(home_team)
    away_row = last_row_for(away_team)

    # Leakage checks: ensure the last rows used are strictly prior
    checks = []
    if home_row is None:
        checks.append(f"No historical games found for home team {home_team} before {prediction_date}")
    else:
        if home_row["GAME_DATE"] >= pred_dt:
            checks.append(f"Home team last game date {home_row['GAME_DATE']} is not before prediction_date {prediction_date}")
    if away_row is None:
        checks.append(f"No historical games found for away team {away_team} before {prediction_date}")
    else:
        if away_row["GAME_DATE"] >= pred_dt:
            checks.append(f"Away team last game date {away_row['GAME_DATE']} is not before prediction_date {prediction_date}")
    if checks:
        raise RuntimeError("Leakage/coverage check failed: " + "; ".join(checks))

    # Head-to-head aggregation (last 5 H2H games) computed from game_results to double-check
    # games_df has columns HOME_TEAM_ABBREVIATION, AWAY_TEAM_ABBREVIATION, HOME_SCORE, AWAY_SCORE
    mask_h2h = ((games_df["HOME_TEAM_ABBREVIATION"] == home_team) & (games_df["AWAY_TEAM_ABBREVIATION"] == away_team)) | \
               ((games_df["HOME_TEAM_ABBREVIATION"] == away_team) & (games_df["AWAY_TEAM_ABBREVIATION"] == home_team))
    h2h_games = games_df[mask_h2h].sort_values("GAME_DATE", ascending=False).head(5)

    def safe_get(row, col, default=0.0):
        if row is None:
            return default
        return row.get(col, default) if col in row.index else default

    # Compose features in order
    out = {}

    # IS_HOME: 1 for home team row
    out["IS_HOME"] = 1

    # IS_PLAYOFF: use home_row if exists else False
    out["IS_PLAYOFF"] = int(bool(safe_get(home_row, "IS_PLAYOFF", False)))

    # DAYS_REST / IS_B2B: compute from last game date for each team
    def compute_rest_and_b2b(row):
        last_game_date = pd.to_datetime(row["GAME_DATE"]) if row is not None else None
        if last_game_date is None:
            return (np.nan, 0)
        days = (pred_dt - last_game_date).days
        is_b2b = 1 if days == 1 else 0
        return (float(days), is_b2b)

    days_rest_home, is_b2b_home = compute_rest_and_b2b(home_row)
    days_rest_away, is_b2b_away = compute_rest_and_b2b(away_row)

    out["DAYS_REST"] = days_rest_home if not pd.isna(days_rest_home) else np.nan
    out["IS_B2B"] = is_b2b_home

    # PTS_LAST_5, PTS_LAST_10, WINRATE_LAST_5, WINRATE_LAST_10 for home
    out["PTS_LAST_5"] = float(safe_get(home_row, "PTS_LAST_5", np.nan))
    out["PTS_LAST_10"] = float(safe_get(home_row, "PTS_LAST_10", np.nan))
    out["WINRATE_LAST_5"] = float(safe_get(home_row, "WINRATE_LAST_5", np.nan))
    out["WINRATE_LAST_10"] = float(safe_get(home_row, "WINRATE_LAST_10", np.nan))

    # Opponent equivalents (OPP_...): use away_row as opponent viewpoint
    out["OPP_DAYS_REST"] = days_rest_away if not pd.isna(days_rest_away) else np.nan
    out["OPP_IS_B2B"] = is_b2b_away
    out["OPP_PTS_LAST_5"] = float(safe_get(away_row, "PTS_LAST_5", np.nan))
    out["OPP_PTS_LAST_10"] = float(safe_get(away_row, "PTS_LAST_10", np.nan))
    out["OPP_WINRATE_LAST_5"] = float(safe_get(away_row, "WINRATE_LAST_5", np.nan))
    out["OPP_WINRATE_LAST_10"] = float(safe_get(away_row, "WINRATE_LAST_10", np.nan))

    # PTS_ALLOWED_LAST_5, PTS_ALLOWED_LAST_10
    out["PTS_ALLOWED_LAST_5"] = float(safe_get(home_row, "PTS_ALLOWED_LAST_5", np.nan))
    out["PTS_ALLOWED_LAST_10"] = float(safe_get(home_row, "PTS_ALLOWED_LAST_10", np.nan))
    out["OPP_PTS_ALLOWED_LAST_5"] = float(safe_get(away_row, "PTS_ALLOWED_LAST_5", np.nan))
    out["OPP_PTS_ALLOWED_LAST_10"] = float(safe_get(away_row, "PTS_ALLOWED_LAST_10", np.nan))

    # Home/Away splits and opponent splits
    out["HOME_WINRATE_LAST_5"] = float(safe_get(home_row, "HOME_WINRATE_LAST_5", np.nan))
    out["HOME_PTS_LAST_5"] = float(safe_get(home_row, "HOME_PTS_LAST_5", np.nan))
    out["HOME_PTS_ALLOWED_LAST_5"] = float(safe_get(home_row, "HOME_PTS_ALLOWED_LAST_5", np.nan))

    out["AWAY_WINRATE_LAST_5"] = float(safe_get(home_row, "AWAY_WINRATE_LAST_5", np.nan))
    out["AWAY_PTS_LAST_5"] = float(safe_get(home_row, "AWAY_PTS_LAST_5", np.nan))
    out["AWAY_PTS_ALLOWED_LAST_5"] = float(safe_get(home_row, "AWAY_PTS_ALLOWED_LAST_5", np.nan))

    # Opponent home/away splits (from away_row perspective)
    out["OPP_HOME_WINRATE_LAST_5"] = float(safe_get(away_row, "HOME_WINRATE_LAST_5", np.nan))
    out["OPP_HOME_PTS_LAST_5"] = float(safe_get(away_row, "HOME_PTS_LAST_5", np.nan))
    out["OPP_HOME_PTS_ALLOWED_LAST_5"] = float(safe_get(away_row, "HOME_PTS_ALLOWED_LAST_5", np.nan))

    out["OPP_AWAY_WINRATE_LAST_5"] = float(safe_get(away_row, "AWAY_WINRATE_LAST_5", np.nan))
    out["OPP_AWAY_PTS_LAST_5"] = float(safe_get(away_row, "AWAY_PTS_LAST_5", np.nan))
    out["OPP_AWAY_PTS_ALLOWED_LAST_5"] = float(safe_get(away_row, "AWAY_PTS_ALLOWED_LAST_5", np.nan))

    # H2H (from precomputed home_row H2H columns when available) -- fallback to aggregation above
    out["H2H_GAMES_LAST_5"] = float(safe_get(home_row, "H2H_GAMES_LAST_5", np.nan)) if not pd.isna(safe_get(home_row, "H2H_GAMES_LAST_5", np.nan)) else float(len(h2h_games))
    out["H2H_WINRATE_LAST_5"] = float(safe_get(home_row, "H2H_WINRATE_LAST_5", np.nan)) if not pd.isna(safe_get(home_row, "H2H_WINRATE_LAST_5", np.nan)) else (float((h2h_games.apply(lambda r: (r['WINNER_TEAM_ABBREVIATION']==home_team), axis=1).sum()) / max(1, len(h2h_games))))
    # last 5 h2h points for home and allowed
    if not h2h_games.empty:
        h2h_pts = []
        h2h_allowed = []
        for _, g in h2h_games.iterrows():
            if g["HOME_TEAM_ABBREVIATION"] == home_team:
                h2h_pts.append(g.get("HOME_SCORE", np.nan))
                h2h_allowed.append(g.get("AWAY_SCORE", np.nan))
            else:
                h2h_pts.append(g.get("AWAY_SCORE", np.nan))
                h2h_allowed.append(g.get("HOME_SCORE", np.nan))
        out["H2H_PTS_LAST_5"] = float(np.mean(h2h_pts))
        out["H2H_PTS_ALLOWED_LAST_5"] = float(np.mean(h2h_allowed))
    else:
        out["H2H_PTS_LAST_5"] = float(safe_get(home_row, "H2H_PTS_LAST_5", np.nan))
        out["H2H_PTS_ALLOWED_LAST_5"] = float(safe_get(home_row, "H2H_PTS_ALLOWED_LAST_5", np.nan))

    # Opponent H2H fields (mirror)
    out["OPP_H2H_GAMES_LAST_5"] = float(safe_get(away_row, "H2H_GAMES_LAST_5", np.nan)) if not pd.isna(safe_get(away_row, "H2H_GAMES_LAST_5", np.nan)) else float(len(h2h_games))
    out["OPP_H2H_WINRATE_LAST_5"] = float(safe_get(away_row, "H2H_WINRATE_LAST_5", np.nan)) if not pd.isna(safe_get(away_row, "H2H_WINRATE_LAST_5", np.nan)) else (float((h2h_games.apply(lambda r: (r['WINNER_TEAM_ABBREVIATION']==away_team), axis=1).sum()) / max(1, len(h2h_games))))
    # Opponent h2h points
    if not h2h_games.empty:
        opp_pts = []
        opp_allowed = []
        for _, g in h2h_games.iterrows():
            if g["HOME_TEAM_ABBREVIATION"] == away_team:
                opp_pts.append(g.get("HOME_SCORE", np.nan))
                opp_allowed.append(g.get("AWAY_SCORE", np.nan))
            else:
                opp_pts.append(g.get("AWAY_SCORE", np.nan))
                opp_allowed.append(g.get("HOME_SCORE", np.nan))
        out["OPP_H2H_PTS_LAST_5"] = float(np.mean(opp_pts))
        out["OPP_H2H_PTS_ALLOWED_LAST_5"] = float(np.mean(opp_allowed))
    else:
        out["OPP_H2H_PTS_LAST_5"] = float(safe_get(away_row, "H2H_PTS_LAST_5", np.nan))
        out["OPP_H2H_PTS_ALLOWED_LAST_5"] = float(safe_get(away_row, "H2H_PTS_ALLOWED_LAST_5", np.nan))

    # Final ordering and missing-column handling
    ordered = []
    missing_cols = []
    for c in feat_cols:
        if c in out:
            ordered.append(out[c])
        else:
            # If a required model feature is not computed above, attempt to pull from home_row
            val = safe_get(home_row, c, np.nan)
            if pd.isna(val):
                missing_cols.append(c)
            ordered.append(float(val) if pd.notna(val) else np.nan)

    if missing_cols:
        # warn but continue; downstream code should impute as the model pipeline expects
        print("Warning: the following features could not be directly computed and are NaN:", missing_cols)

    # Validation: ensure all values derived from rows have GAME_DATE < prediction_date
    # (we filtered at top; assert again)
    if any(team_df["GAME_DATE"] >= pred_dt):
        raise RuntimeError("Leakage detected: team features contain games on/after prediction_date")

    base_dict = dict(zip(feat_cols, ordered))
    
    # Dynamically compute player-level features
    try:
        player_feats = compute_player_features_for_inference(home_team, away_team, prediction_date, season=season)
        base_dict.update(player_feats)
    except Exception as e:
        print(f"Warning: failed to compute player features for inference: {e}")
        
    return base_dict


def compute_player_features_for_inference(home_team: str, away_team: str, prediction_date: str, season: str = None):
    player_features_list = [
        "HOME_CORE_PLAYERS_AVAILABLE_COUNT", "HOME_CORE_PLAYERS_MISSING_COUNT",
        "HOME_TOP1_AVAILABLE", "HOME_TOP2_AVAILABLE", "HOME_TOP3_AVAILABLE",
        "HOME_CORE_EXPECTED_MIN_SUM", "HOME_TOP3_EXPECTED_MIN_SUM", "HOME_CORE_MINUTES_SHARE",
        "HOME_CORE_EXPECTED_PTS_SUM", "HOME_CORE_EXPECTED_AST_SUM", "HOME_CORE_EXPECTED_REB_SUM", "HOME_CORE_EXPECTED_PRA_SUM",
        "HOME_TOP3_EXPECTED_PTS_SUM", "HOME_TOP3_EXPECTED_AST_SUM", "HOME_TOP3_EXPECTED_REB_SUM", "HOME_TOP3_EXPECTED_PRA_SUM",
        "HOME_MISSING_CORE_EXPECTED_MIN", "HOME_MISSING_CORE_EXPECTED_PTS", "HOME_MISSING_CORE_EXPECTED_AST", "HOME_MISSING_CORE_EXPECTED_REB", "HOME_MISSING_CORE_EXPECTED_PRA",
        "AWAY_CORE_PLAYERS_AVAILABLE_COUNT", "AWAY_CORE_PLAYERS_MISSING_COUNT",
        "AWAY_TOP1_AVAILABLE", "AWAY_TOP2_AVAILABLE", "AWAY_TOP3_AVAILABLE",
        "AWAY_CORE_EXPECTED_MIN_SUM", "AWAY_TOP3_EXPECTED_MIN_SUM", "AWAY_CORE_MINUTES_SHARE",
        "AWAY_CORE_EXPECTED_PTS_SUM", "AWAY_CORE_EXPECTED_AST_SUM", "AWAY_CORE_EXPECTED_REB_SUM", "AWAY_CORE_EXPECTED_PRA_SUM",
        "AWAY_TOP3_EXPECTED_PTS_SUM", "AWAY_TOP3_EXPECTED_AST_SUM", "AWAY_TOP3_EXPECTED_REB_SUM", "AWAY_TOP3_EXPECTED_PRA_SUM",
        "AWAY_MISSING_CORE_EXPECTED_MIN", "AWAY_MISSING_CORE_EXPECTED_PTS", "AWAY_MISSING_CORE_EXPECTED_AST", "AWAY_MISSING_CORE_EXPECTED_REB", "AWAY_MISSING_CORE_EXPECTED_PRA"
    ]

    paths = get_data_paths(season)
    player_games_path = Path(paths.player_games_raw)
    team_games_path = Path(paths.team_games_raw)

    if not player_games_path.exists() or not team_games_path.exists():
        return {f: 0.0 for f in player_features_list}

    df_player_games = pd.read_csv(player_games_path)
    df_team_games = pd.read_csv(team_games_path)

    pred_dt = pd.to_datetime(prediction_date)
    df_player_games["GAME_DATE"] = pd.to_datetime(df_player_games["GAME_DATE"], errors="coerce")
    df_team_games["GAME_DATE"] = pd.to_datetime(df_team_games["GAME_DATE"], errors="coerce")

    # Filter strictly before to prevent leakage
    df_player_hist = df_player_games[df_player_games["GAME_DATE"] < pred_dt]
    df_team_hist = df_team_games[df_team_games["GAME_DATE"] < pred_dt]

    is_24_25 = (season == "2024-25" or (season and "2024_25" in season) or (paths.team_games_raw and "2024_25" in paths.team_games_raw))

    if is_24_25:
        # Load experimental player registry and observed stints
        registry_path = ROOT / "data/experimental/player_registry_2024_25.csv"
        events_path = ROOT / "data/experimental/observed_affiliation_events_2024_25.csv"

        if not registry_path.exists() or not events_path.exists():
            return {f: 0.0 for f in player_features_list}

        df_reg = pd.read_csv(registry_path)
        df_ev = pd.read_csv(events_path)

        # Build dynamic core player ranks based on highest importance score per team
        expanded_rows = []
        for _, row in df_reg.iterrows():
            teams_str = row["known_teams_2024_25"]
            if pd.isna(teams_str):
                continue
            teams = [t.strip() for t in str(teams_str).split(",")]
            for t in teams:
                expanded_rows.append({
                    "PLAYER_ID": int(row["player_id"]),
                    "PLAYER_NAME": row["player_name"],
                    "TEAM_ABBREVIATION": t,
                    "IMPORTANCE_SCORE": row["highest_importance_score"]
                })
        df_expanded = pd.DataFrame(expanded_rows)

        df_expanded = df_expanded.sort_values(by=["TEAM_ABBREVIATION", "IMPORTANCE_SCORE"], ascending=[True, False])
        df_expanded["CORE_RANK"] = df_expanded.groupby("TEAM_ABBREVIATION").cumcount() + 1

        # Check active players for prediction_date
        pred_date_str = prediction_date
        df_ev["end_date_clean"] = df_ev["end_date"].fillna("2099-12-31")
        active_ev = df_ev[(df_ev["start_date"] <= pred_date_str) & (df_ev["end_date_clean"] >= pred_date_str)]

        df_core = df_expanded.merge(
            active_ev[["player_id", "team_abbreviation"]].rename(columns={"player_id": "PLAYER_ID", "team_abbreviation": "TEAM_ABBREVIATION"}),
            on=["PLAYER_ID", "TEAM_ABBREVIATION"],
            how="inner"
        )
    else:
        core_path = ROOT / "data/production/core_players.csv"
        if not core_path.exists():
            core_path = ROOT / "data/canonical/core_players.csv"
        if not core_path.exists():
            return {f: 0.0 for f in player_features_list}
        df_core = pd.read_csv(core_path)

    features = {}

    for prefix, team in [("HOME", home_team), ("AWAY", away_team)]:
        team_core = df_core[df_core["TEAM_ABBREVIATION"] == team]
        if team_core.empty:
            for f in player_features_list:
                if f.startswith(prefix):
                    features[f] = 0.0
            continue

        t_games = df_team_hist[df_team_hist["TEAM_ABBREVIATION"] == team]
        if not t_games.empty:
            t_games = t_games.sort_values("GAME_DATE", ascending=False)
            last_3_game_ids = t_games["GAME_ID"].head(3).astype(str).tolist()
        else:
            last_3_game_ids = []

        avail_count = 0
        missing_count = 0

        top1_avail = 0
        top2_avail = 0
        top3_avail = 0

        core_expected_min = []
        top3_expected_min = []

        core_expected_pts = []
        core_expected_ast = []
        core_expected_reb = []
        core_expected_pra = []

        top3_expected_pts = []
        top3_expected_ast = []
        top3_expected_reb = []
        top3_expected_pra = []

        missing_expected_min = []
        missing_expected_pts = []
        missing_expected_ast = []
        missing_expected_reb = []
        missing_expected_pra = []

        for _, cp_row in team_core.iterrows():
            pid = int(cp_row["PLAYER_ID"])
            rank = int(cp_row["CORE_RANK"])

            # 1. Determine availability using proxy
            if len(last_3_game_ids) == 0:
                is_available = True
            else:
                p_games = df_player_hist[df_player_hist["Player_ID"] == pid]
                p_games_last_3 = p_games[p_games["Game_ID"].astype(str).isin(last_3_game_ids)] if not p_games.empty else pd.DataFrame()
                if p_games_last_3.empty:
                    is_available = False
                else:
                    is_available = (p_games_last_3["MIN"].fillna(0) > 0).any()

            if is_available:
                avail_count += 1
                if rank == 1:
                    top1_avail = 1
                elif rank == 2:
                    top2_avail = 1
                elif rank == 3:
                    top3_avail = 1
            else:
                missing_count += 1

            # 2. Expected Stats (10-game rolling averages)
            p_games = df_player_hist[df_player_hist["Player_ID"] == pid]
            if not p_games.empty:
                p_recent = p_games.sort_values("GAME_DATE", ascending=True).tail(10)
                exp_min = float(p_recent["MIN"].mean())
                exp_pts = float(p_recent["PTS"].mean())
                exp_ast = float(p_recent["AST"].mean())
                exp_reb = float(p_recent["REB"].mean())
                exp_pra = float((p_recent["PTS"] + p_recent["REB"] + p_recent["AST"]).mean())
            else:
                exp_min = 0.0
                exp_pts = 0.0
                exp_ast = 0.0
                exp_reb = 0.0
                exp_pra = 0.0

            core_expected_min.append(exp_min)
            core_expected_pts.append(exp_pts)
            core_expected_ast.append(exp_ast)
            core_expected_reb.append(exp_reb)
            core_expected_pra.append(exp_pra)

            if rank <= 3:
                top3_expected_min.append(exp_min)
                top3_expected_pts.append(exp_pts)
                top3_expected_ast.append(exp_ast)
                top3_expected_reb.append(exp_reb)
                top3_expected_pra.append(exp_pra)

            if not is_available:
                missing_expected_min.append(exp_min)
                missing_expected_pts.append(exp_pts)
                missing_expected_ast.append(exp_ast)
                missing_expected_reb.append(exp_reb)
                missing_expected_pra.append(exp_pra)

        # Aggregate
        min_sum = sum(core_expected_min)
        features.update({
            f"{prefix}_CORE_PLAYERS_AVAILABLE_COUNT": avail_count,
            f"{prefix}_CORE_PLAYERS_MISSING_COUNT": missing_count,
            f"{prefix}_TOP1_AVAILABLE": top1_avail,
            f"{prefix}_TOP2_AVAILABLE": top2_avail,
            f"{prefix}_TOP3_AVAILABLE": top3_avail,
            f"{prefix}_CORE_EXPECTED_MIN_SUM": min_sum,
            f"{prefix}_TOP3_EXPECTED_MIN_SUM": sum(top3_expected_min),
            f"{prefix}_CORE_MINUTES_SHARE": min_sum / 240.0,
            f"{prefix}_CORE_EXPECTED_PTS_SUM": sum(core_expected_pts),
            f"{prefix}_CORE_EXPECTED_AST_SUM": sum(core_expected_ast),
            f"{prefix}_CORE_EXPECTED_REB_SUM": sum(core_expected_reb),
            f"{prefix}_CORE_EXPECTED_PRA_SUM": sum(core_expected_pra),
            f"{prefix}_TOP3_EXPECTED_PTS_SUM": sum(top3_expected_pts),
            f"{prefix}_TOP3_EXPECTED_AST_SUM": sum(top3_expected_ast),
            f"{prefix}_TOP3_EXPECTED_REB_SUM": sum(top3_expected_reb),
            f"{prefix}_TOP3_EXPECTED_PRA_SUM": sum(top3_expected_pra),
            f"{prefix}_MISSING_CORE_EXPECTED_MIN": sum(missing_expected_min),
            f"{prefix}_MISSING_CORE_EXPECTED_PTS": sum(missing_expected_pts),
            f"{prefix}_MISSING_CORE_EXPECTED_AST": sum(missing_expected_ast),
            f"{prefix}_MISSING_CORE_EXPECTED_REB": sum(missing_expected_reb),
            f"{prefix}_MISSING_CORE_EXPECTED_PRA": sum(missing_expected_pra)
        })

    return features


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--home", required=True, help="Home team abbreviation (e.g., LAL)")
    parser.add_argument("--away", required=True, help="Away team abbreviation (e.g., BOS)")
    parser.add_argument("--prediction-date", required=True, help="YYYY-MM-DD (tip-off date)")
    parser.add_argument("--out-json", help="Optional output path; prints to stdout if omitted")
    parser.add_argument("--season", help="Optional season string (e.g., 2025-26)")
    args = parser.parse_args()

    feats = build_features(args.home.upper(), args.away.upper(), args.prediction_date, season=args.season)
    out_text = json.dumps(feats, indent=2)
    if args.out_json:
        Path(args.out_json).write_text(out_text)
    else:
        print(out_text)


if __name__ == '__main__':
    main()
