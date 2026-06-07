import pandas as pd
from typing import Optional

def ingest_players(season: str, output_path: Optional[str] = None) -> pd.DataFrame:
    """
    Ingest and standardize NBA player biographical details.

    Parameters:
    -----------
    season : str
        The season identifier.
    output_path : Optional[str]
        Path to save the canonical players DataFrame.

    Returns:
    --------
    pd.DataFrame
        DataFrame conforming to the canonical players schema:
        - player_id (str, PK)
        - display_name (str)
        - draft_year (int)
        - attributes (dict/json)
    """
    # TODO: Load active player indexes from NBA API for the specified season.
    # TODO: Parse biographical details (height, weight, college) into an attributes JSON object.
    print(f"Executing ingest_players stub for season {season}")
    
    columns = ["player_id", "display_name", "draft_year", "attributes"]
    return pd.DataFrame(columns=columns)

if __name__ == "__main__":
    df = ingest_players("2024-25")
    print(df.info())
