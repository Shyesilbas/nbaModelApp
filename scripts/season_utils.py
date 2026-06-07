import re

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
