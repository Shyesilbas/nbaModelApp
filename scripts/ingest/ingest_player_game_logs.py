import pandas as pd
from typing import Optional

def ingest_player_game_logs(season: str, output_path: Optional[str] = None) -> pd.DataFrame:
    """
    Ingest player-level game logs for a given season.

    Parameters:
    -----------
    season : str
        The season identifier.
    output_path : Optional[str]
        Path to save the canonical player game logs.

    Returns:
    --------
    pd.DataFrame
        DataFrame conforming to the canonical player_game_logs schema:
        - log_id (str, PK)
        - game_id (str)
        - player_id (str)
        - team_id (str)
        - minutes (float)
        - pts (int)
        - ast (int)
        - reb (int)
    """
    # TODO: Sync and clean player game logs from NBA API.
    # TODO: Handle DNPs, active/inactive states and minutes parsing.
    print(f"Executing ingest_player_game_logs stub for season {season}")
    
    columns = [
        "log_id", "game_id", "player_id", "team_id", 
        "minutes", "pts", "ast", "reb"
    ]
    return pd.DataFrame(columns=columns)

if __name__ == "__main__":
    df = ingest_player_game_logs("2024-25")
    print(df.info())
