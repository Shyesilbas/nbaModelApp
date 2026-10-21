import re
import os
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]

# Single season boundary for every date -> season mapping (no games are played in Aug-Sep).
SEASON_START_MONTH = 8


def date_to_season(dt) -> str:
    """Season label ("2026-27") a date belongs to."""
    start = dt.year if dt.month >= SEASON_START_MONTH else dt.year - 1
    return f"{start}-{(start + 1) % 100:02d}"


def season_labels(dates: pd.Series) -> pd.Series:
    """Vectorized date_to_season; unparseable dates give NA."""
    parsed = pd.to_datetime(dates, errors="coerce")
    years = parsed.dt.year.where(parsed.dt.month >= SEASON_START_MONTH, parsed.dt.year - 1)
    return years.astype("Int64").astype(str) + "-" + ((years + 1) % 100).astype("Int64").astype(str).str.zfill(2)


def get_default_season() -> str:
    env_value = os.getenv("NBA_CURRENT_SEASON")
    if env_value:
        return normalize_season(env_value)
    config_path = ROOT / "config" / "data_sources.yaml"
    if config_path.exists():
        import yaml  # type: ignore

        with open(config_path, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}
        current = config.get("current_season")
        if current:
            return normalize_season(str(current))
    raise ValueError("No default season configured. Set NBA_CURRENT_SEASON or config/data_sources.yaml current_season.")
def normalize_season(season: str) -> str:
    """Normalize season inputs like token, hyphenated, or compact forms to standard form."""
    if not isinstance(season, str):
        raise ValueError("Season must be a string")
    m = re.search(r"(?<!\d)(\d{4})[-_]?(\d{4}|\d{2})(?!\d)", season)
    if m and int(m.group(2)[-2:]) == (int(m.group(1)) + 1) % 100:
        return f"{m.group(1)}-{m.group(2)[-2:]}"
    raise ValueError(f"Invalid season format: {season}")

def season_to_file_token(season: str) -> str:
    """Convert a normalized season string to file token format."""
    normalized = normalize_season(season)
    return normalized.replace("-", "_")

def file_token_to_season(token: str) -> str:
    """Convert file token format back to normalized season format."""
    return normalize_season(token)

def validate_season_data(df, season: str):
    """
    Strict guard to prevent mixing season data in datasets.
    """
    season = normalize_season(season)
    start_year = int(season.split("-")[0])
    next_year = start_year + 1
    if df.empty:
        raise ValueError(f"Validation failed: Dataframe is empty for season {season}")
    
    if "GAME_DATE" in df.columns:
        dates = pd.to_datetime(df["GAME_DATE"])
        min_date = dates.min()
        max_date = dates.max()
        lower_bound = pd.Timestamp(f"{start_year}-{SEASON_START_MONTH:02d}-01")
        upper_bound = pd.Timestamp(f"{next_year}-07-01")
        if min_date < lower_bound or max_date > upper_bound:
            raise ValueError(f"Validation failed: Dates {min_date.date()} to {max_date.date()} out of bounds for {season}")

    if "GAME_ID" in df.columns:
        prefixes = df["GAME_ID"].astype(str).str[:5].unique()
        suffix = str(start_year)[-2:]
        valid_prefixes = {f"002{suffix}", f"004{suffix}", f"005{suffix}"}
        if not set(prefixes).issubset(valid_prefixes):
            print(f"Warning: Unexpected GAME_ID prefixes found for {season}: {prefixes}")

def discover_seasons() -> dict:
    """Discover all available seasons under data/ directory matching season=YYYY-YY."""
    import glob
    import re
    seasons = {}
    data_dir = ROOT / "data"
    for path in glob.glob(str(data_dir / "season=*")):
        m = re.search(r"season=(\d{4}-\d{2})", path)
        if m:
            seasons[m.group(1)] = path
    return dict(sorted(seasons.items()))
