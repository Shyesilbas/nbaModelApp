from __future__ import annotations

from collections import defaultdict
from typing import Mapping

import numpy as np
import pandas as pd


from src.processing.season_type_normalizer import drop_preseason
from src.features.continuous_elo import ContinuousEloEngine, INITIAL_ELO, BASE_K_FACTOR, SEASON_REGRESSION, HOME_COURT_ADVANTAGE

K_FACTOR = BASE_K_FACTOR


ELO_COLUMNS = ["PRE_GAME_ELO", "OPP_PRE_GAME_ELO", "ELO_DIFF", "ABS_ELO_DIFF", "HOME_COURT_ELO_DIFF", "ELO_EXPECTED_WIN_PROB"]
_full_history_elo_cache: dict = {}


def _full_history_elo() -> pd.DataFrame:
    """Pre-game Elo of every completed game on disk, keyed by (GAME_ID, TEAM_ABBREVIATION).

    Built from the complete raw game log, the same chain live inference walks
    (season openings chained from earlier seasons, then this season's games).
    """
    from pathlib import Path
    from src.core.season_utils import discover_seasons
    from src.core.data_paths import get_data_paths
    from src.features.continuous_elo import build_continuous_elo_dataset

    seasons = sorted(discover_seasons())
    files = [Path(get_data_paths(s).team_games_raw) for s in seasons]
    key = tuple((str(p), p.stat().st_mtime_ns) for p in files if p.exists())
    if key not in _full_history_elo_cache:
        elo, _ = build_continuous_elo_dataset(seasons)
        elo["GAME_ID"] = elo["GAME_ID"].astype(str).str.split(".").str[0].str.zfill(10)
        _full_history_elo_cache.clear()
        _full_history_elo_cache[key] = (
            elo.drop_duplicates(["GAME_ID", "TEAM_ABBREVIATION"]).set_index(["GAME_ID", "TEAM_ABBREVIATION"])[ELO_COLUMNS]
        )
    return _full_history_elo_cache[key]


def add_pre_game_elo(df: pd.DataFrame) -> pd.DataFrame:
    """Compute leakage-safe pre-game Elo from chronological completed games using ContinuousEloEngine."""
    # Model-ready rows skip each team's first games of a season, so running the engine
    # over them alone left training Elo up to ~13 points off the live value. Use the
    # full raw log whenever every row is a completed game in it.
    if {"GAME_ID", "TEAM_ABBREVIATION"} <= set(df.columns):
        try:
            elo = _full_history_elo()
            gids = df["GAME_ID"].astype(str).str.split(".").str[0].str.zfill(10)
            matched = elo.reindex(pd.MultiIndex.from_arrays([gids, df["TEAM_ABBREVIATION"].astype(str)]))
            if len(df) and matched["PRE_GAME_ELO"].notna().all():
                out = df.copy()
                for col in ELO_COLUMNS:
                    out[col] = matched[col].to_numpy()
                return out
        except FileNotFoundError:
            pass

    df_copy = df.copy()
    added_pts = False
    added_wl = False
    
    if "PTS" not in df_copy.columns and "GAME_ID" in df_copy.columns and "TEAM_ABBREVIATION" in df_copy.columns:
        try:
            from src.core.season_utils import discover_seasons
            from src.core.data_paths import get_data_paths
            
            pts_map = {}
            for s in discover_seasons():
                dp = get_data_paths(s)
                try:
                    tg = pd.read_csv(dp.team_games_raw, usecols=["GAME_ID", "TEAM_ABBREVIATION", "PTS", "WL"])
                    for _, r in tg.iterrows():
                        gid = str(r["GAME_ID"]).split(".")[0].zfill(10)
                        pts_map[(gid, str(r["TEAM_ABBREVIATION"]))] = (r["PTS"], r["WL"])
                except Exception:
                    pass
            
            gids = df_copy["GAME_ID"].astype(str).str.split(".").str[0].str.zfill(10)
            teams = df_copy["TEAM_ABBREVIATION"].astype(str)
            mapped = [pts_map.get((g, t), (None, None)) for g, t in zip(gids, teams)]
            df_copy["PTS"] = [m[0] for m in mapped]
            df_copy["WL"] = [m[1] for m in mapped]
            added_pts = True
            added_wl = True
        except Exception:
            pass

    engine = ContinuousEloEngine()
    res = engine.transform_games(df_copy)
    
    if added_pts and "PTS" in res.columns:
        res = res.drop(columns=["PTS"])
    if added_wl and "WL" in res.columns:
        res = res.drop(columns=["WL"])
        
    return res


def attach_actual_points(df: pd.DataFrame) -> pd.DataFrame:
    """Add ACTUAL_PTS / ACTUAL_OPP_PTS from the raw box scores.

    Never rebuild scores as PACE * OFF_RTG / 100: PACE is per 48 minutes, so that
    formula undercounts overtime games by ~13 points each.
    """
    from pathlib import Path
    from src.core.season_utils import discover_seasons
    from src.core.data_paths import get_data_paths

    frames = [
        pd.read_csv(p, usecols=["GAME_ID", "TEAM_ABBREVIATION", "PTS"])
        for p in (Path(get_data_paths(s).team_games_raw) for s in discover_seasons())
        if p.exists()
    ]
    if not frames:
        raise FileNotFoundError("No raw team_games.csv found; actual points are required.")
    raw = pd.concat(frames, ignore_index=True)
    raw["GAME_ID"] = raw["GAME_ID"].astype(str).str.split(".").str[0].str.zfill(10)
    pts = raw.drop_duplicates(["GAME_ID", "TEAM_ABBREVIATION"]).set_index(["GAME_ID", "TEAM_ABBREVIATION"])["PTS"]

    out = df.copy()
    gids = out["GAME_ID"].astype(str).str.split(".").str[0].str.zfill(10)
    for col, team_col in [("ACTUAL_PTS", "TEAM_ABBREVIATION"), ("ACTUAL_OPP_PTS", "OPPONENT_ABBREVIATION")]:
        out[col] = pts.reindex(pd.MultiIndex.from_arrays([gids, out[team_col].astype(str)])).to_numpy()
    return out


def add_win_strength_features(df: pd.DataFrame) -> pd.DataFrame:
    df = add_pre_game_elo(df)
    
    winrate = df.get("WINRATE_LAST_10", 0.5)
    opp_winrate = df.get("OPP_WINRATE_LAST_10", 0.5)
    df["WINRATE_DIFF_LAST_10"] = winrate - opp_winrate
    df["ABS_WINRATE_DIFF_LAST_10"] = df["WINRATE_DIFF_LAST_10"].abs()
    
    days_rest = df.get("DAYS_REST", 2.0)
    opp_days_rest = df.get("OPP_DAYS_REST", 2.0)
    df["REST_DIFF"] = days_rest - opp_days_rest
    
    df["IS_CLOSE_STRENGTH"] = ((df["ABS_ELO_DIFF"] < 60) & (df["ABS_WINRATE_DIFF_LAST_10"] < 0.15)).astype(int)
    
    is_playoff = df.get("IS_PLAYOFF", 0).astype(int)
    df["PLAYOFF_ELO_DIFF"] = is_playoff * df["ELO_DIFF"]
    df["PLAYOFF_ABS_ELO_DIFF"] = is_playoff * df["ABS_ELO_DIFF"]
    df["PLAYOFF_REST_DIFF"] = is_playoff * df["REST_DIFF"]
    df["CLOSE_STRENGTH_REST_DIFF"] = df["IS_CLOSE_STRENGTH"] * df["REST_DIFF"]
    
    net_rtg = df.get("NET_RTG_LAST_10", 0.0)
    opp_net_rtg = df.get("OPP_NET_RTG_LAST_10", 0.0)
    df["NET_RTG_DIFF_LAST_10"] = net_rtg - opp_net_rtg

    clean_net = df.get("CLEAN_NET_RTG_LAST_10")
    if clean_net is None or (isinstance(clean_net, pd.Series) and clean_net.isna().all()):
        clean_net = net_rtg
    elif isinstance(clean_net, pd.Series):
        clean_net = clean_net.fillna(net_rtg)

    opp_clean_net = df.get("OPP_CLEAN_NET_RTG_LAST_10")
    if opp_clean_net is None or (isinstance(opp_clean_net, pd.Series) and opp_clean_net.isna().all()):
        opp_clean_net = opp_net_rtg
    elif isinstance(opp_clean_net, pd.Series):
        opp_clean_net = opp_clean_net.fillna(opp_net_rtg)

    df["CLEAN_NET_RTG_DIFF_LAST_10"] = clean_net - opp_clean_net

    clutch_net = df.get("CLUTCH_NET_RTG_LAST_10")
    if clutch_net is None or (isinstance(clutch_net, pd.Series) and clutch_net.isna().all()):
        clutch_net = net_rtg
    elif isinstance(clutch_net, pd.Series):
        clutch_net = clutch_net.fillna(net_rtg)

    opp_clutch_net = df.get("OPP_CLUTCH_NET_RTG_LAST_10")
    if opp_clutch_net is None or (isinstance(opp_clutch_net, pd.Series) and opp_clutch_net.isna().all()):
        opp_clutch_net = opp_net_rtg
    elif isinstance(opp_clutch_net, pd.Series):
        opp_clutch_net = opp_clutch_net.fillna(opp_net_rtg)

    df["CLUTCH_NET_RTG_DIFF_LAST_10"] = clutch_net - opp_clutch_net

    efg = df.get("EFG_PCT_LAST_10", 0.53)
    def_efg = df.get("DEF_EFG_PCT_LAST_10", 0.53)
    df["EFG_DIFF_LAST_10"] = efg - def_efg

    fg3a_rate = df.get("FG3A_RATE_LAST_10", 0.38)
    def_fg3a_rate = df.get("DEF_FG3A_RATE_LAST_10", 0.38)
    df["THREE_POINT_RATE_DIFF"] = fg3a_rate - def_fg3a_rate

    tov_pct = df.get("TOV_PCT_LAST_10", 0.13)
    def_tov_pct = df.get("DEF_TOV_PCT_LAST_10", 0.13)
    df["TOV_FORCED_DIFF"] = def_tov_pct - tov_pct

    orb_pct = df.get("ORB_PCT_LAST_10", 0.25)
    def_orb_pct = df.get("DEF_ORB_PCT_LAST_10", 0.25)
    df["REBOUND_CONTROL_DIFF"] = orb_pct - def_orb_pct

    pace = df.get("PACE_LAST_5", 100.0)
    opp_pace = df.get("OPP_PACE_LAST_5", 100.0)
    df["PACE_COLLISION"] = (pace * opp_pace) / 100.0

    ast_to_tov = df.get("AST_TO_TOV_LAST_5", 1.8)
    opp_ast_to_tov = df.get("OPP_AST_TO_TOV_LAST_5", 1.8)
    df["AST_TO_TOV_DIFF_LAST_5"] = ast_to_tov - opp_ast_to_tov

    havoc = df.get("HAVOC_RATE_LAST_5", 0.12)
    opp_havoc = df.get("OPP_HAVOC_RATE_LAST_5", 0.12)
    df["HAVOC_RATE_DIFF_LAST_5"] = havoc - opp_havoc

    ft_margin = df.get("FT_MARGIN_LAST_5", 0.0)
    opp_ft_margin = df.get("OPP_FT_MARGIN_LAST_5", 0.0)
    df["FT_MARGIN_DIFF_LAST_5"] = ft_margin - opp_ft_margin

    fg3_reg = df.get("FG3_REGRESSION_DELTA", 0.0)
    opp_fg3_reg = df.get("OPP_FG3_REGRESSION_DELTA", 0.0)
    df["FG3_REGRESSION_DIFF"] = fg3_reg - opp_fg3_reg
    return df


_elo_state_cache: dict[tuple, dict[str, float]] = {}


_opening_cache: dict[str, dict[str, float]] = {}


def season_opening_ratings(season: str) -> dict[str, float]:
    """Opening Elo for ``season``: the published file if there is one, otherwise
    the ratings carried over from every earlier season on disk (same procedure
    as ``scripts/feature_engineering/build_initial_season_elo.py``)."""
    from pathlib import Path
    import json

    if season in _opening_cache:
        return _opening_cache[season]
    root = Path(__file__).resolve().parents[2]
    for init_path in [root / f"data/season={season}/analysis/team_elo_initial.json"]:
        if init_path.exists():
            try:
                _opening_cache[season] = json.loads(init_path.read_text())
                return _opening_cache[season]
            except Exception:
                pass
    prior = sorted(
        p.parent.parent.name.split("=", 1)[1]
        for p in root.glob("data/season=*/raw/team_games.csv")
        if p.parent.parent.name.split("=", 1)[1] < season
    )
    ratings = {}
    if prior:
        from src.features.continuous_elo import build_season_opening_elo
        try:
            ratings = build_season_opening_elo(prior)
        except Exception:
            ratings = {}
    _opening_cache[season] = ratings
    return ratings


def compute_current_elo_state(team_games: pd.DataFrame, season: str = None) -> dict[str, float]:
    initial_ratings = None
    from pathlib import Path
    import json

    root = Path(__file__).resolve().parents[2]
    team_games = drop_preseason(team_games)

    if not season and not team_games.empty and "GAME_DATE" in team_games.columns:
        try:
            sample_dt = pd.to_datetime(team_games["GAME_DATE"].dropna().iloc[-1])
            yr = sample_dt.year
            mo = sample_dt.month
            start_yr = yr if mo >= 10 else yr - 1
            season = f"{start_yr}-{str(start_yr + 1)[-2:]}"
        except Exception:
            season = None

    if team_games.empty:
        return dict(season_opening_ratings(season)) if season else {}

    last_game_token = None
    if "GAME_DATE" in team_games.columns:
        valid_dates = team_games["GAME_DATE"].dropna()
        if not valid_dates.empty:
            last_game_token = str(valid_dates.iloc[-1])

    cache_key = (season, len(team_games), last_game_token)
    if cache_key in _elo_state_cache:
        return dict(_elo_state_cache[cache_key])

    if season:
        initial_ratings = season_opening_ratings(season) or None

    engine = ContinuousEloEngine(initial_ratings=initial_ratings)
    engine.transform_games(team_games)
    ratings = dict(engine.ratings)
    _elo_state_cache[cache_key] = ratings
    return dict(ratings)



def build_matchup_strength_features(
    *,
    home_team: str,
    away_team: str,
    home_row: Mapping[str, object],
    away_row: Mapping[str, object],
    is_playoff: int,
    days_rest_home: float,
    days_rest_away: float,
    elo_state: Mapping[str, float],
) -> dict[str, float]:
    home_elo = float(elo_state.get(home_team, INITIAL_ELO))
    away_elo = float(elo_state.get(away_team, INITIAL_ELO))
    elo_diff = home_elo - away_elo
    winrate_diff = float(home_row.get("WINRATE_LAST_10", np.nan)) - float(away_row.get("WINRATE_LAST_10", np.nan))
    rest_diff = float(days_rest_home) - float(days_rest_away)
    abs_elo_diff = abs(elo_diff)
    abs_winrate_diff = abs(winrate_diff)
    is_close = int(abs_elo_diff < 60 and abs_winrate_diff < 0.15)
    playoff = int(is_playoff)
    
    net_rtg_diff = float(home_row.get("NET_RTG_LAST_10", 0.0)) - float(away_row.get("NET_RTG_LAST_10", 0.0))
    efg_diff = float(home_row.get("EFG_PCT_LAST_10", 0.53)) - float(away_row.get("DEF_EFG_PCT_LAST_10", 0.53))
    three_point_diff = float(home_row.get("FG3A_RATE_LAST_10", 0.38)) - float(away_row.get("DEF_FG3A_RATE_LAST_10", 0.38))
    tov_forced_diff = float(home_row.get("DEF_TOV_PCT_LAST_10", 0.13)) - float(away_row.get("TOV_PCT_LAST_10", 0.13))
    reb_control_diff = float(home_row.get("ORB_PCT_LAST_10", 0.25)) - float(away_row.get("DEF_ORB_PCT_LAST_10", 0.25))
    pace_collision = (float(home_row.get("PACE_LAST_5", 100.0)) * float(away_row.get("PACE_LAST_5", 100.0))) / 100.0
    ast_to_tov_diff = float(home_row.get("AST_TO_TOV_LAST_5", 1.8)) - float(away_row.get("AST_TO_TOV_LAST_5", 1.8))
    havoc_diff = float(home_row.get("HAVOC_RATE_LAST_5", 0.12)) - float(away_row.get("HAVOC_RATE_LAST_5", 0.12))
    ft_margin_diff = float(home_row.get("FT_MARGIN_LAST_5", 0.0)) - float(away_row.get("FT_MARGIN_LAST_5", 0.0))
    fg3_reg_diff = float(home_row.get("FG3_REGRESSION_DELTA", 0.0)) - float(away_row.get("FG3_REGRESSION_DELTA", 0.0))

    return {
        "PRE_GAME_ELO": home_elo,
        "OPP_PRE_GAME_ELO": away_elo,
        "ELO_DIFF": elo_diff,
        "ABS_ELO_DIFF": abs_elo_diff,
        "WINRATE_DIFF_LAST_10": winrate_diff,
        "ABS_WINRATE_DIFF_LAST_10": abs_winrate_diff,
        "REST_DIFF": rest_diff,
        "IS_CLOSE_STRENGTH": float(is_close),
        "PLAYOFF_ELO_DIFF": playoff * elo_diff,
        "PLAYOFF_ABS_ELO_DIFF": playoff * abs_elo_diff,
        "PLAYOFF_REST_DIFF": playoff * rest_diff,
        "CLOSE_STRENGTH_REST_DIFF": is_close * rest_diff,
        "NET_RTG_DIFF_LAST_10": net_rtg_diff,
        "EFG_DIFF_LAST_10": efg_diff,
        "THREE_POINT_RATE_DIFF": three_point_diff,
        "TOV_FORCED_DIFF": tov_forced_diff,
        "REBOUND_CONTROL_DIFF": reb_control_diff,
        "PACE_COLLISION": pace_collision,
        "AST_TO_TOV_DIFF_LAST_5": ast_to_tov_diff,
        "HAVOC_RATE_DIFF_LAST_5": havoc_diff,
        "FT_MARGIN_DIFF_LAST_5": ft_margin_diff,
        "FG3_REGRESSION_DIFF": fg3_reg_diff,
    }
