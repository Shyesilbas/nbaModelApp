import pandas as pd
from typing import Optional

def ingest_games(season: str, output_path: Optional[str] = None) -> pd.DataFrame:
    """
    Ingest raw games metadata for a specific season.

    Parameters:
    -----------
    season : str
        The season identifier (e.g., '2024-25', '2025-26').
    output_path : Optional[str]
        Path to save the canonical games DataFrame as CSV/Parquet.

    Returns:
    --------
    pd.DataFrame
        DataFrame conforming to the canonical games schema:
        - game_id (str, PK)
        - season (str)
        - season_type (str)
        - game_date (str/date)
        - home_team_id (str)
        - away_team_id (str)
        - home_score (int, nullable)
        - away_score (int, nullable)
        - is_playoff (bool)
        - extra (dict/json)
    """
    # TODO: Connect to NBA API client and retrieve scheduled and completed games.
    # TODO: Clean and format date strings into YYYY-MM-DD.
    # TODO: Handle missing score outcomes for future games.
    print(f"Executing ingest_games stub for season {season}")
    
    # Return empty representation matching expected schema
    columns = [
        "game_id", "season", "season_type", "game_date", 
        "home_team_id", "away_team_id", "home_score", 
        "away_score", "is_playoff", "extra"
    ]
    return pd.DataFrame(columns=columns)

if __name__ == "__main__":
    df = ingest_games("2024-25")
    print(df.info())
