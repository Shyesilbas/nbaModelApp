import pandas as pd
from typing import Optional

def ingest_player_box_scores(season: str, output_path: Optional[str] = None) -> pd.DataFrame:
    """
    Ingest player granular box scores for a given season.

    Parameters:
    -----------
    season : str
        The season identifier.
    output_path : Optional[str]
        Path to save the canonical player box scores.

    Returns:
    --------
    pd.DataFrame
        DataFrame conforming to the canonical player_box_scores schema:
        - box_score_id (str, PK)
        - game_id (str)
        - player_id (str)
        - team_id (str)
        - minutes (float)
        - points (int)
        - rebounds (int)
        - assists (int)
        - steals (int)
        - blocks (int)
        - plus_minus (float)
        - roster_role (str)
        - source_meta (dict/json)
    """
    # TODO: Ingest granular player-level box score data from raw trackers.
    # TODO: Classify role as 'Starter' or 'Bench'.
    print(f"Executing ingest_player_box_scores stub for season {season}")
    
    columns = [
        "box_score_id", "game_id", "player_id", "team_id", 
        "minutes", "points", "rebounds", "assists", 
        "steals", "blocks", "plus_minus", "roster_role", "source_meta"
    ]
    return pd.DataFrame(columns=columns)

if __name__ == "__main__":
    df = ingest_player_box_scores("2024-25")
    print(df.info())
