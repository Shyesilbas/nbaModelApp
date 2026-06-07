import pandas as pd
from typing import Optional

def ingest_team_game_logs(season: str, output_path: Optional[str] = None) -> pd.DataFrame:
    """
    Ingest team-level game logs for a given season.

    Parameters:
    -----------
    season : str
        The season identifier.
    output_path : Optional[str]
        Path to save the canonical team game logs.

    Returns:
    --------
    pd.DataFrame
        DataFrame conforming to the canonical team_game_logs schema:
        - log_id (str, PK)
        - game_id (str)
        - team_id (str)
        - game_date (str/date)
        - win (bool)
        - points (int)
        - opponent_id (str)
        - is_home (bool)
        - rest_days (int)
    """
    # TODO: Sync and clean team game logs from NBA API.
    # TODO: Calculate rest days dynamically based on chronological sequence.
    print(f"Executing ingest_team_game_logs stub for season {season}")
    
    columns = [
        "log_id", "game_id", "team_id", "game_date", 
        "win", "points", "opponent_id", "is_home", "rest_days"
    ]
    return pd.DataFrame(columns=columns)

if __name__ == "__main__":
    df = ingest_team_game_logs("2024-25")
    print(df.info())
