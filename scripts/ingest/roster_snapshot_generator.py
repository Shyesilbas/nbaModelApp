import pandas as pd
import numpy as np
import os
import sys
from typing import Optional
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.core.season_utils import get_default_season, normalize_season, season_to_file_token

def build_player_team_affiliations_from_observed_events(events_df: pd.DataFrame) -> pd.DataFrame:
    """
    Determine player-to-team affiliations throughout the season timeline from observed events.

    Parameters:
    -----------
    events_df : pd.DataFrame
        DataFrame of observed affiliation events. Expected columns:
        - player_id
        - team_id
        - start_date
        - end_date

    Returns:
    --------
    pd.DataFrame
        A map of player affiliations with validity windows.
        Columns: [player_id, team_id, start_date, end_date]
    """
    if events_df.empty:
        return pd.DataFrame(columns=["player_id", "team_id", "start_date", "end_date"])

    # Ensure required columns are present
    required = {"player_id", "team_id", "start_date", "end_date"}
    missing = required - set(events_df.columns)
    if missing:
        raise ValueError(f"Events DataFrame missing required columns: {missing}")

    # Clean and standardize dates
    df = events_df[["player_id", "team_id", "start_date", "end_date"]].copy()
    df["start_date"] = pd.to_datetime(df["start_date"]).dt.strftime("%Y-%m-%d")
    
    # Keep null end_dates as None/NaN
    df["end_date"] = df["end_date"].apply(
        lambda x: pd.to_datetime(x).strftime("%Y-%m-%d") if pd.notna(x) and str(x).strip() != "" and str(x) != "nan" else None
    )

    return df

def build_player_team_affiliations(transactions_df: pd.DataFrame, season: Optional[str] = None) -> pd.DataFrame:
    """
    Legacy compatible wrapper to determine player-to-team affiliations.
    Falls back to observed affiliation events if transactions are empty/stubbed.
    """
    if transactions_df.empty:
        # Resolve season token dynamically
        actual_season = normalize_season(season or get_default_season())
        token = season_to_file_token(actual_season)
        # Fallback to experimental observed events if available
        obs_path = f"data/experimental/observed_affiliation_events_{token}.csv"
        if os.path.exists(obs_path):
            obs_df = pd.read_csv(obs_path)
            return build_player_team_affiliations_from_observed_events(obs_df)
        return pd.DataFrame(columns=["player_id", "team_id", "start_date", "end_date"])

    # If transactions are provided, convert signed/trade/releases to windows
    tx_sorted = transactions_df.sort_values(by="effective_date").copy()
    affiliations = []

    for player_id, p_tx in tx_sorted.groupby("player_id"):
        current_team = None
        start_date = None
        
        for idx, row in p_tx.iterrows():
            tx_type = row["type"]
            effective_date = pd.to_datetime(row["effective_date"]).strftime("%Y-%m-%d")
            to_team = row["to_team_id"]
            
            if tx_type in ["Signing", "Trade"]:
                if current_team is not None and start_date is not None:
                    end_date = (pd.to_datetime(effective_date) - pd.Timedelta(days=1)).strftime("%Y-%m-%d")
                    affiliations.append({
                        "player_id": player_id,
                        "team_id": current_team,
                        "start_date": start_date,
                        "end_date": end_date
                    })
                current_team = to_team
                start_date = effective_date
            elif tx_type in ["Waiver", "Release"]:
                if current_team is not None and start_date is not None:
                    affiliations.append({
                        "player_id": player_id,
                        "team_id": current_team,
                        "start_date": start_date,
                        "end_date": effective_date
                    })
                current_team = None
                start_date = None

        if current_team is not None and start_date is not None:
            affiliations.append({
                "player_id": player_id,
                "team_id": current_team,
                "start_date": start_date,
                "end_date": None
            })

    return pd.DataFrame(affiliations)

def build_roster_snapshots_from_affiliations(
    affiliations_df: pd.DataFrame, 
    start_date: str,
    end_date: str,
    season: Optional[str] = None
) -> pd.DataFrame:
    """
    Build daily roster snapshots from affiliation windows.

    Parameters:
    -----------
    affiliations_df : pd.DataFrame
        DataFrame containing player-team affiliation windows.
    start_date : str
        Start date of range (YYYY-MM-DD).
    end_date : str
        End date of range (YYYY-MM-DD).
    season : Optional[str]
        Season token or hyphenated format.

    Returns:
    --------
    pd.DataFrame
        Daily roster snapshots.
    """
    date_range = pd.date_range(start=start_date, end=end_date)
    snapshots = []

    actual_season = normalize_season(season or get_default_season())
    token = season_to_file_token(actual_season)

    # Load player registry or core players for role & minutes mapping if available
    metadata_map = {}
    for path in [f"data/experimental/player_registry_{token}.csv", "data/production/core_players.csv"]:
        if os.path.exists(path):
            meta_df = pd.read_csv(path)
            # Find columns
            cols = meta_df.columns
            pid_col = "player_id" if "player_id" in cols else "PLAYER_ID"
            top3_col = "is_top3_core" if "is_top3_core" in cols else "IS_TOP3_CORE"
            top5_col = "is_top5_core" if "is_top5_core" in cols else "IS_TOP5_CORE"
            
            for _, row in meta_df.iterrows():
                pid = row[pid_col]
                is_top3 = row.get(top3_col, False)
                is_top5 = row.get(top5_col, False)
                
                role = "Bench"
                exp_min = 10.0
                if is_top3:
                    role = "Starter"
                    exp_min = 30.0
                elif is_top5:
                    role = "Rotation"
                    exp_min = 20.0
                    
                metadata_map[pid] = (role, exp_min)
            break

    # To optimize, filter affiliations overlapping the range
    aff_df = affiliations_df.copy()
    aff_df["start_dt"] = pd.to_datetime(aff_df["start_date"])
    aff_df["end_dt"] = pd.to_datetime(aff_df["end_date"].fillna("2099-12-31"))

    for current_date in date_range:
        current_date_str = current_date.strftime("%Y-%m-%d")
        
        # Find active players on this date
        active = aff_df[
            (aff_df["start_dt"] <= current_date) & 
            (aff_df["end_dt"] >= current_date)
        ]
        
        # Check if any player has multiple active teams on this date
        duplicates = active[active.duplicated(subset=["player_id"], keep=False)]
        if not duplicates.empty:
            dup_players = duplicates["player_id"].unique()
            # If they belong to multiple teams on the same day, raise ValueError unless flagged
            raise ValueError(f"Player(s) {dup_players} belong to multiple teams on {current_date_str}")

        for _, row in active.iterrows():
            pid = row["player_id"]
            tid = row["team_id"]
            
            role, exp_min = metadata_map.get(pid, ("Bench", 10.0))
            
            snapshots.append({
                "snapshot_date": current_date_str,
                "team_id": tid,
                "player_id": pid,
                "role": role,
                "expected_minutes": exp_min
            })

    return pd.DataFrame(snapshots)

def build_roster_snapshots(
    transactions_df: pd.DataFrame, 
    initial_rosters_df: pd.DataFrame,
    start_date: str,
    end_date: str,
    season: Optional[str] = None
) -> pd.DataFrame:
    """
    Legacy signature compatible daily roster snapshot generator.
    """
    affiliations_df = build_player_team_affiliations(transactions_df, season=season)
    return build_roster_snapshots_from_affiliations(affiliations_df, start_date, end_date, season=season)

def get_roster_as_of(team_id: str, prediction_date: str, roster_snapshots_df: pd.DataFrame) -> pd.DataFrame:
    """
    Retrieve the active roster snapshot for a specific team as of a given prediction date.
    Strictly checks snapshot_date <= prediction_date to prevent future leakage.
    """
    if roster_snapshots_df.empty:
        return pd.DataFrame(columns=["snapshot_date", "team_id", "player_id", "role", "expected_minutes"])
        
    team_snapshots = roster_snapshots_df[
        (roster_snapshots_df["team_id"] == team_id) & 
        (roster_snapshots_df["snapshot_date"] <= prediction_date)
    ]
    
    if team_snapshots.empty:
        return pd.DataFrame(columns=["snapshot_date", "team_id", "player_id", "role", "expected_minutes"])
        
    latest_snapshot_date = team_snapshots["snapshot_date"].max()
    return team_snapshots[team_snapshots["snapshot_date"] == latest_snapshot_date].copy()

def validate_roster_snapshots(roster_snapshots_df: pd.DataFrame) -> bool:
    """
    Verify structural validity, integrity and format of the generated roster snapshots.
    """
    required_cols = {"snapshot_date", "team_id", "player_id", "role", "expected_minutes"}
    missing = required_cols - set(roster_snapshots_df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")
        
    duplicates = roster_snapshots_df.duplicated(subset=["snapshot_date", "player_id"]).sum()
    if duplicates > 0:
        raise ValueError(f"Found {duplicates} duplicate player snapshot rows across different teams on the same date")
        
    for col in ["snapshot_date", "team_id", "player_id"]:
        if roster_snapshots_df[col].isnull().any():
            raise ValueError(f"Null values found in primary column: {col}")
            
    return True
