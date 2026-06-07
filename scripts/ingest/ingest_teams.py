import pandas as pd
from typing import Optional

def ingest_teams(output_path: Optional[str] = None) -> pd.DataFrame:
    """
    Ingest and standardize NBA team franchise details.

    Parameters:
    -----------
    output_path : Optional[str]
        Path to save the canonical teams DataFrame.

    Returns:
    --------
    pd.DataFrame
        DataFrame conforming to the canonical teams schema:
        - team_id (str, PK)
        - abbreviation (str)
        - name (str)
        - city (str)
    """
    # TODO: Fetch static franchise mapping from NBA API.
    # TODO: Resolve name changes or historic team abbreviations.
    print("Executing ingest_teams stub")
    
    columns = ["team_id", "abbreviation", "name", "city"]
    return pd.DataFrame(columns=columns)

if __name__ == "__main__":
    df = ingest_teams()
    print(df.info())
