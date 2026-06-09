import re
import pandas as pd
def normalize_season(season: str) -> str:
    """Normalize inputs like '2025_26', '2025-26', '202526' to standard form '2025-26'."""
    if not isinstance(season, str):
        raise ValueError("Season must be a string")
    m = re.search(r"(\d{4})[-_]?(\d{2})", season)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    raise ValueError(f"Invalid season format: {season}")

def season_to_file_token(season: str) -> str:
    """Convert standard season (e.g., '2025-26') to file token format (e.g., '2025_26')."""
    normalized = normalize_season(season)
    return normalized.replace("-", "_")

def file_token_to_season(token: str) -> str:
    """Convert file token format (e.g., '2025_26') to standard season (e.g., '2025-26')."""
    return normalize_season(token)

def validate_season_data(df, season: str):
    """
    Strict guard to prevent mixing season data in datasets.
    """
    if df.empty:
        raise ValueError(f"Validation failed: Dataframe is empty for season {season}")
    
    if "GAME_DATE" in df.columns:
        dates = pd.to_datetime(df["GAME_DATE"])
        min_date = dates.min()
        max_date = dates.max()
        
        if season == "2024-25":
            if min_date < pd.Timestamp("2024-10-01") or max_date > pd.Timestamp("2025-07-01"):
                raise ValueError(f"Validation failed: Dates {min_date.date()} to {max_date.date()} out of bounds for 2024-25")
        elif season == "2025-26":
            if min_date < pd.Timestamp("2025-10-01") or max_date > pd.Timestamp("2026-07-01"):
                raise ValueError(f"Validation failed: Dates {min_date.date()} to {max_date.date()} out of bounds for 2025-26")

    if "GAME_ID" in df.columns:
        prefixes = df["GAME_ID"].astype(str).str[:5].unique()
        
        if season == "2024-25":
            valid_prefixes = {"00224", "00424", "00524"}
            invalid_prefixes = {"00225", "00425", "00525"}
            if any(p in invalid_prefixes for p in prefixes):
                raise ValueError(f"Validation failed: 2025-26 GAME_ID prefixes found in 2024-25 dataset: {prefixes}")
            if not set(prefixes).issubset(valid_prefixes):
                print(f"Warning: Unexpected GAME_ID prefixes found for 2024-25: {prefixes}")
        elif season == "2025-26":
            valid_prefixes = {"00225", "00425", "00525"}
            invalid_prefixes = {"00224", "00424", "00524"}
            if any(p in invalid_prefixes for p in prefixes):
                raise ValueError(f"Validation failed: 2024-25 GAME_ID prefixes found in 2025-26 dataset: {prefixes}")
            if not set(prefixes).issubset(valid_prefixes):
                print(f"Warning: Unexpected GAME_ID prefixes found for 2025-26: {prefixes}")
