import pandas as pd
from typing import Optional

def ingest_team_box_scores(season: str, output_path: Optional[str] = None) -> pd.DataFrame:
    """
    Ingest team granular box scores for a given season.

    Parameters:
    -----------
    season : str
        The season identifier.
    output_path : Optional[str]
        Path to save the canonical team box scores.

    Returns:
    --------
    pd.DataFrame
        DataFrame conforming to the canonical team_box_scores schema:
        - box_score_id (str, PK)
        - game_id (str)
        - team_id (str)
        - points (int)
        - rebounds (int)
        - assists (int)
        - steals (int)
        - blocks (int)
    """
    # TODO: Ingest detailed team-level box score statistics.
    # TODO: Verify totals match matching game log summaries.
    print(f"Executing ingest_team_box_scores stub for season {season}")
    
    columns = [
        "box_score_id", "game_id", "team_id", "points", 
        "rebounds", "assists", "steals", "blocks"
    ]
    return pd.DataFrame(columns=columns)

if __name__ == "__main__":
    df = ingest_team_box_scores("2024-25")
    print(df.info())
