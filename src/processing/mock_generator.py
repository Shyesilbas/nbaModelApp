import pandas as pd
import numpy as np

def generate_mock_team_games() -> pd.DataFrame:
    """
    Generates a mock dataset of team game logs for 2025-26.
    Includes 2 teams, some back-to-back games, and playoff games.
    """
    # 2 teams: BOS (Boston Celtics) and LAL (Los Angeles Lakers)
    dates_bos = pd.to_datetime([
        "2025-10-22", "2025-10-24", "2025-10-25", # B2B
        "2025-10-28", "2025-10-30", "2025-11-01", 
        "2025-11-04", "2025-11-05", # B2B
        "2025-11-08", "2025-11-10", "2026-05-01", # Playoff game
        "2026-05-03" # Playoff game
    ])
    
    dates_lal = pd.to_datetime([
        "2025-10-22", "2025-10-23", # B2B
        "2025-10-26", "2025-10-29", "2025-10-31", 
        "2025-11-02", "2025-11-04", "2025-11-07", 
        "2025-11-08", # B2B
        "2025-11-11", "2026-05-02", # Playoff game
        "2026-05-04" # Playoff game
    ])
    
    rows = []
    
    # Generate Boston logs
    for idx, dt in enumerate(dates_bos):
        is_playoff = "Playoffs" if dt.year == 2026 else "Regular Season"
        wl = "W" if idx % 3 != 0 else "L"
        pts = 100 + (idx * 2) + np.random.randint(-10, 10)
        opp = "LAL" if idx % 2 == 0 else "MIA"
        matchup = f"BOS vs. {opp}" if idx % 2 == 0 else f"BOS @ {opp}"
        
        rows.append({
            "SEASON_ID": "22025" if is_playoff == "Regular Season" else "42025",
            "TEAM_ID": 1610612738,
            "TEAM_ABBREVIATION": "BOS",
            "TEAM_NAME": "Boston Celtics",
            "GAME_ID": f"002250000{idx}",
            "GAME_DATE": dt.strftime("%Y-%m-%d"),
            "MATCHUP": matchup,
            "WL": wl,
            "MIN": 240.0,
            "PTS": pts,
            "FGM": 40,
            "FGA": 90,
            "FG_PCT": 0.444,
            "FG3M": 12,
            "FG3A": 35,
            "FG3_PCT": 0.342,
            "FTM": 15,
            "FTA": 20,
            "FT_PCT": 0.750,
            "OREB": 10,
            "DREB": 32,
            "REB": 42,
            "AST": 25,
            "STL": 7,
            "BLK": 5,
            "TOV": 12,
            "PF": 18,
            "PLUS_MINUS": 10 if wl == "W" else -10,
            "SEASON_TYPE": is_playoff
        })

    # Generate LA logs
    for idx, dt in enumerate(dates_lal):
        is_playoff = "Playoffs" if dt.year == 2026 else "Regular Season"
        wl = "W" if idx % 2 == 0 else "L"
        pts = 105 + idx + np.random.randint(-8, 8)
        opp = "BOS" if idx % 2 == 0 else "GSW"
        matchup = f"LAL @ {opp}" if idx % 2 == 0 else f"LAL vs. {opp}"
        
        rows.append({
            "SEASON_ID": "22025" if is_playoff == "Regular Season" else "42025",
            "TEAM_ID": 1610612747,
            "TEAM_ABBREVIATION": "LAL",
            "TEAM_NAME": "Los Angeles Lakers",
            "GAME_ID": f"002250001{idx}",
            "GAME_DATE": dt.strftime("%Y-%m-%d"),
            "MATCHUP": matchup,
            "WL": wl,
            "MIN": 240.0,
            "PTS": pts,
            "FGM": 38,
            "FGA": 85,
            "FG_PCT": 0.447,
            "FG3M": 10,
            "FG3A": 30,
            "FG3_PCT": 0.333,
            "FTM": 18,
            "FTA": 25,
            "FT_PCT": 0.720,
            "OREB": 8,
            "DREB": 35,
            "REB": 43,
            "AST": 22,
            "STL": 6,
            "BLK": 4,
            "TOV": 14,
            "PF": 20,
            "PLUS_MINUS": 5 if wl == "W" else -5,
            "SEASON_TYPE": is_playoff
        })
        
    return pd.DataFrame(rows)

def generate_mock_player_games() -> pd.DataFrame:
    """
    Generates a mock dataset of player game logs for 2025-26.
    Includes logs for 2 players (e.g. Jayson Tatum, LeBron James).
    """
    dates_tatum = pd.to_datetime([
        "2025-10-22", "2025-10-24", "2025-10-25", 
        "2025-10-28", "2025-10-30", "2025-11-01", 
        "2025-11-04", "2025-11-05", "2025-11-08", 
        "2025-11-10", "2026-05-01", "2026-05-03"
    ])
    
    dates_lebron = pd.to_datetime([
        "2025-10-22", "2025-10-23", 
        "2025-10-26", "2025-10-29", "2025-10-31", 
        "2025-11-02", "2025-11-04", "2025-11-07", 
        "2025-11-08", "2025-11-11", "2026-05-02", 
        "2026-05-04"
    ])
    
    rows = []
    
    # Generate Tatum logs
    for idx, dt in enumerate(dates_tatum):
        is_playoff = "Playoffs" if dt.year == 2026 else "Regular Season"
        wl = "W" if idx % 3 != 0 else "L"
        pts = 25 + idx + np.random.randint(-5, 5)
        reb = 7 + np.random.randint(-3, 3)
        ast = 4 + np.random.randint(-2, 2)
        opp = "LAL" if idx % 2 == 0 else "MIA"
        matchup = f"BOS vs. {opp}" if idx % 2 == 0 else f"BOS @ {opp}"
        
        rows.append({
            "SEASON_ID": "22025" if is_playoff == "Regular Season" else "42025",
            "Player_ID": 1628369,
            "PLAYER_NAME": "Jayson Tatum",
            "Game_ID": f"002250000{idx}",
            "GAME_DATE": dt.strftime("%Y-%m-%d"),
            "MATCHUP": matchup,
            "WL": wl,
            "MIN": "35:12" if idx % 2 == 0 else 34.5,  # Mixing string MM:SS and float
            "PTS": pts,
            "FGM": 9,
            "FGA": 20,
            "FG_PCT": 0.450,
            "FG3M": 3,
            "FG3A": 8,
            "FG3_PCT": 0.375,
            "FTM": 4,
            "FTA": 6,
            "FT_PCT": 0.667,
            "OREB": 1,
            "DREB": reb - 1,
            "REB": reb,
            "AST": ast,
            "STL": 1,
            "BLK": 1,
            "TOV": 3,
            "PF": 2,
            "PLUS_MINUS": 8 if wl == "W" else -6,
            "VIDEO_AVAILABLE": 1,
            "SEASON_TYPE": is_playoff
        })

    # Generate LeBron logs
    for idx, dt in enumerate(dates_lebron):
        is_playoff = "Playoffs" if dt.year == 2026 else "Regular Season"
        wl = "W" if idx % 2 == 0 else "L"
        pts = 22 + idx + np.random.randint(-4, 4)
        reb = 6 + np.random.randint(-2, 3)
        ast = 7 + np.random.randint(-3, 3)
        opp = "BOS" if idx % 2 == 0 else "GSW"
        matchup = f"LAL @ {opp}" if idx % 2 == 0 else f"LAL vs. {opp}"
        
        rows.append({
            "SEASON_ID": "22025" if is_playoff == "Regular Season" else "42025",
            "Player_ID": 2544,
            "PLAYER_NAME": "LeBron James",
            "Game_ID": f"002250001{idx}",
            "GAME_DATE": dt.strftime("%Y-%m-%d"),
            "MATCHUP": matchup,
            "WL": wl,
            "MIN": "33:45" if idx % 2 == 0 else 35.0,  # Mixing string and float
            "PTS": pts,
            "FGM": 8,
            "FGA": 16,
            "FG_PCT": 0.500,
            "FG3M": 2,
            "FG3A": 5,
            "FG3_PCT": 0.400,
            "FTM": 4,
            "FTA": 5,
            "FT_PCT": 0.800,
            "OREB": 1,
            "DREB": reb - 1,
            "REB": reb,
            "AST": ast,
            "STL": 2,
            "BLK": 1,
            "TOV": 4,
            "PF": 1,
            "PLUS_MINUS": 4 if wl == "W" else -4,
            "VIDEO_AVAILABLE": 1,
            "SEASON_TYPE": is_playoff
        })
        
    return pd.DataFrame(rows)
