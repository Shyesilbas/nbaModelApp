import math
from typing import Dict
import numpy as np
import pandas as pd

NBA_TEAMS_LOCATIONS: Dict[str, Dict[str, float]] = {
    "BOS": {"lat": 42.3662, "lon": -71.0621, "tz": -5},
    "BKN": {"lat": 40.6826, "lon": -73.9754, "tz": -5},
    "NYK": {"lat": 40.7505, "lon": -73.9934, "tz": -5},
    "PHI": {"lat": 39.9012, "lon": -75.1719, "tz": -5},
    "TOR": {"lat": 43.6435, "lon": -79.3791, "tz": -5},
    "CHI": {"lat": 41.8806, "lon": -87.6742, "tz": -6},
    "CLE": {"lat": 41.4965, "lon": -81.6881, "tz": -5},
    "DET": {"lat": 42.3411, "lon": -83.0550, "tz": -5},
    "IND": {"lat": 39.7641, "lon": -86.1555, "tz": -5},
    "MIL": {"lat": 43.0451, "lon": -87.9172, "tz": -6},
    "ATL": {"lat": 33.7573, "lon": -84.3963, "tz": -5},
    "CHA": {"lat": 35.2251, "lon": -80.8392, "tz": -5},
    "MIA": {"lat": 25.7814, "lon": -80.1870, "tz": -5},
    "ORL": {"lat": 28.5392, "lon": -81.3839, "tz": -5},
    "WAS": {"lat": 38.8981, "lon": -77.0209, "tz": -5},
    "DEN": {"lat": 39.7486, "lon": -105.0075, "tz": -7},
    "MIN": {"lat": 44.9795, "lon": -93.2761, "tz": -6},
    "OKC": {"lat": 35.4634, "lon": -97.5151, "tz": -6},
    "POR": {"lat": 45.5316, "lon": -122.6668, "tz": -8},
    "UTA": {"lat": 40.7683, "lon": -111.9011, "tz": -7},
    "GSW": {"lat": 37.7680, "lon": -122.3877, "tz": -8},
    "LAC": {"lat": 34.0430, "lon": -118.2673, "tz": -8},
    "LAL": {"lat": 34.0430, "lon": -118.2673, "tz": -8},
    "PHX": {"lat": 33.4457, "lon": -112.0712, "tz": -7},
    "SAC": {"lat": 38.5802, "lon": -121.4997, "tz": -8},
    "DAL": {"lat": 32.7905, "lon": -96.8103, "tz": -6},
    "HOU": {"lat": 29.7508, "lon": -95.3621, "tz": -6},
    "MEM": {"lat": 35.1381, "lon": -90.0506, "tz": -6},
    "NOP": {"lat": 29.9490, "lon": -90.0821, "tz": -6},
    "SAS": {"lat": 29.4270, "lon": -98.4375, "tz": -6},
}


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c


def compute_schedule_density_features(df: pd.DataFrame, team_col: str = "TEAM_ABBREVIATION") -> pd.DataFrame:
    out = df.copy()

    if team_col not in out.columns or "GAME_DATE" not in out.columns:
        return out

    out["GAME_DATE"] = pd.to_datetime(out["GAME_DATE"])
    out = out.sort_values([team_col, "GAME_DATE"]).reset_index(drop=True)

    games_7d_list = []
    games_14d_list = []
    travel_7d_list = []
    fatigue_index_list = []

    for team, group in out.groupby(team_col, sort=False):
        dates = group["GAME_DATE"].values
        is_home_vals = group["IS_HOME"].values if "IS_HOME" in group.columns else np.ones(len(group))
        opps = group["OPPONENT_ABBREVIATION"].values if "OPPONENT_ABBREVIATION" in group.columns else [""] * len(group)
        rest_vals = group["DAYS_REST"].values if "DAYS_REST" in group.columns else np.full(len(group), 2.0)
        b2b_vals = group["IS_B2B"].values if "IS_B2B" in group.columns else np.zeros(len(group))
        three_in_four_vals = group["IS_3_IN_4"].values if "IS_3_IN_4" in group.columns else np.zeros(len(group))

        # Determine venue city coordinates for each game
        coords = []
        for i in range(len(group)):
            venue = team if (is_home_vals[i] == 1 or is_home_vals[i] is True) else str(opps[i]).strip().upper()
            loc = NBA_TEAMS_LOCATIONS.get(venue, NBA_TEAMS_LOCATIONS.get(team, {"lat": 40.0, "lon": -80.0}))
            coords.append((loc["lat"], loc["lon"]))

        # Distance between consecutive games
        trip_dists = [0.0]
        for i in range(1, len(group)):
            d = haversine_km(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1])
            trip_dists.append(d)

        for i in range(len(group)):
            cur_date = pd.Timestamp(dates[i])
            cutoff_7d = cur_date - pd.Timedelta(days=7)
            cutoff_14d = cur_date - pd.Timedelta(days=14)

            # Strictly past games in window
            prior_indices_7d = [j for j in range(i) if cutoff_7d <= pd.Timestamp(dates[j]) < cur_date]
            prior_indices_14d = [j for j in range(i) if cutoff_14d <= pd.Timestamp(dates[j]) < cur_date]

            g_7d = len(prior_indices_7d)
            g_14d = len(prior_indices_14d)
            travel_7d = sum(trip_dists[j] for j in prior_indices_7d)

            rest_val = rest_vals[i] if pd.notna(rest_vals[i]) else 2.0
            b2b_val = 1.0 if (b2b_vals[i] == 1 or b2b_vals[i] is True) else 0.0
            three_in_four = 1.0 if (three_in_four_vals[i] == 1 or three_in_four_vals[i] is True) else 0.0

            fatigue = (
                (1.5 * g_7d)
                + (1.2 * b2b_val)
                + (1.0 * three_in_four)
                + (travel_7d / 2000.0)
                - (0.4 * min(float(rest_val), 4.0))
            )
            fatigue = max(0.0, min(10.0, fatigue))

            games_7d_list.append(g_7d)
            games_14d_list.append(g_14d)
            travel_7d_list.append(round(travel_7d, 1))
            fatigue_index_list.append(round(fatigue, 2))

    out["GAMES_LAST_7D"] = games_7d_list
    out["GAMES_LAST_14D"] = games_14d_list
    out["TRAVEL_KM_LAST_7D"] = travel_7d_list
    out["CUMULATIVE_FATIGUE_INDEX"] = fatigue_index_list

    return out
