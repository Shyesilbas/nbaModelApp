import pandas as pd
from typing import Optional

def build_player_team_affiliations(transactions_df: pd.DataFrame) -> pd.DataFrame:
    """
    Determine player-to-team affiliations throughout the season timeline from transactions.

    Parameters:
    -----------
    transactions_df : pd.DataFrame
        DataFrame of transaction logs. Expected columns:
        - tx_id (str)
        - player_id (str)
        - from_team_id (str, nullable)
        - to_team_id (str, nullable)
        - effective_date (str/date)
        - type (str)  # 'Trade', 'Signing', 'Waiver', etc.
        - metadata (dict/json)

    Returns:
    --------
    pd.DataFrame
        A map of player affiliations with validity windows.
        Columns: [player_id, team_id, start_date, end_date]
    """
    # TODO: Handle duplicate transaction rows.
    # TODO: Handle missing transaction dates or out-of-order logs.
    # TODO: Address mid-season trades where player is traded twice.
    # TODO: Account for waiver periods and 10-day contract lapses.
    
    if transactions_df.empty:
        return pd.DataFrame(columns=["player_id", "team_id", "start_date", "end_date"])

    # Ensure chronological sorting
    tx_sorted = transactions_df.sort_values(by="effective_date").copy()
    affiliations = []

    for player_id, p_tx in tx_sorted.groupby("player_id"):
        current_team = None
        start_date = None
        
        for idx, row in p_tx.iterrows():
            tx_type = row["type"]
            effective_date = row["effective_date"]
            to_team = row["to_team_id"]
            
            if tx_type in ["Signing", "Trade"]:
                if current_team is not None and start_date is not None:
                    # End previous affiliation
                    # End date is one day before the new trade/signing effective date
                    end_date = pd.to_datetime(effective_date) - pd.Timedelta(days=1)
                    affiliations.append({
                        "player_id": player_id,
                        "team_id": current_team,
                        "start_date": start_date,
                        "end_date": end_date.strftime("%Y-%m-%d")
                    })
                current_team = to_team
                start_date = effective_date
            elif tx_type in ["Waiver", "Release"]:
                if current_team is not None and start_date is not None:
                    # End current affiliation
                    affiliations.append({
                        "player_id": player_id,
                        "team_id": current_team,
                        "start_date": start_date,
                        "end_date": effective_date
                    })
                current_team = None
                start_date = None

        if current_team is not None and start_date is not None:
            # Open-ended affiliation
            affiliations.append({
                "player_id": player_id,
                "team_id": current_team,
                "start_date": start_date,
                "end_date": "2099-12-31"
            })

    return pd.DataFrame(affiliations)

def build_roster_snapshots(
    transactions_df: pd.DataFrame, 
    initial_rosters_df: pd.DataFrame,
    start_date: str,
    end_date: str
) -> pd.DataFrame:
    """
    Build daily roster snapshots by applying transaction logs sequentially to initial team rosters.

    Parameters:
    -----------
    transactions_df : pd.DataFrame
        DataFrame containing player transactions/trades/injury logs with an effective date.
    initial_rosters_df : pd.DataFrame
        DataFrame containing the base active rosters at the start of the season.
        Columns: [team_id, player_id, role, expected_minutes]
    start_date : str
        Start date of the simulation range (YYYY-MM-DD).
    end_date : str
        End date of the simulation range (YYYY-MM-DD).

    Returns:
    --------
    pd.DataFrame
        A DataFrame of roster snapshots mapped per team and day.
        Columns: [snapshot_date, team_id, player_id, role, expected_minutes]
    """
    # TODO: Integrate player injury ledger return dates to adjust active roster snapshots.
    # TODO: Handle two-way contracts status switches.
    # TODO: Calculate expected minutes dynamically based on sliding windows or historical priors.

    date_range = pd.date_range(start=start_date, end=end_date)
    affiliations_df = build_player_team_affiliations(transactions_df)
    
    snapshots = []
    
    for current_date in date_range:
        current_date_str = current_date.strftime("%Y-%m-%d")
        
        # Determine affiliations active on this day
        if not affiliations_df.empty:
            active_aff = affiliations_df[
                (affiliations_df["start_date"] <= current_date_str) & 
                (affiliations_df["end_date"] >= current_date_str)
            ]
        else:
            active_aff = pd.DataFrame(columns=["player_id", "team_id"])
            
        # Build rosters for this date using initial rosters as base modified by active affiliations
        # For simplicity, start with initial roster and merge new affiliations
        base_roster = initial_rosters_df.copy()
        
        # Apply affiliations: if player has a new active affiliation, update their team
        # Players released or waived are dropped from their team
        # Start by building map
        player_to_team = base_roster.set_index("player_id")["team_id"].to_dict()
        
        # Apply changes up to current_date
        for _, aff in active_aff.iterrows():
            p_id = aff["player_id"]
            t_id = aff["team_id"]
            if pd.isna(t_id) or t_id is None:
                if p_id in player_to_team:
                    del player_to_team[p_id]
            else:
                player_to_team[p_id] = t_id
                
        # Build snapshot rows
        for p_id, t_id in player_to_team.items():
            # Find metadata from initial roster or default
            role = "Bench"
            exp_min = 10.0
            
            init_match = base_roster[base_roster["player_id"] == p_id]
            if not init_match.empty:
                role = init_match.iloc[0]["role"]
                exp_min = init_match.iloc[0]["expected_minutes"]
                
            snapshots.append({
                "snapshot_date": current_date_str,
                "team_id": t_id,
                "player_id": p_id,
                "role": role,
                "expected_minutes": exp_min
            })
            
    return pd.DataFrame(snapshots)

def get_roster_as_of(team_id: str, prediction_date: str, roster_snapshots_df: pd.DataFrame) -> pd.DataFrame:
    """
    Retrieve the active roster snapshot for a specific team as of a given prediction date.
    Strictly checks snapshot_date <= prediction_date to prevent future leakage.

    Parameters:
    -----------
    team_id : str
        The team identifier.
    prediction_date : str
        Prediction tip-off date (YYYY-MM-DD). Roster snapshot retrieved must have snapshot_date <= prediction_date.
    roster_snapshots_df : pd.DataFrame
        DataFrame of historical roster snapshots.

    Returns:
    --------
    pd.DataFrame
        The roster state for the specified team on the target date.
    """
    if roster_snapshots_df.empty:
        return pd.DataFrame(columns=["snapshot_date", "team_id", "player_id", "role", "expected_minutes"])
        
    # Filter by team and enforce leakage prevention rule
    team_snapshots = roster_snapshots_df[
        (roster_snapshots_df["team_id"] == team_id) & 
        (roster_snapshots_df["snapshot_date"] <= prediction_date)
    ]
    
    if team_snapshots.empty:
        return pd.DataFrame(columns=["snapshot_date", "team_id", "player_id", "role", "expected_minutes"])
        
    # Get the latest snapshot date available up to prediction_date
    latest_snapshot_date = team_snapshots["snapshot_date"].max()
    
    return team_snapshots[team_snapshots["snapshot_date"] == latest_snapshot_date].copy()

def validate_roster_snapshots(roster_snapshots_df: pd.DataFrame) -> bool:
    """
    Verify structural validity, integrity and format of the generated roster snapshots.

    Parameters:
    -----------
    roster_snapshots_df : pd.DataFrame
        DataFrame containing daily roster snapshot states.

    Returns:
    --------
    bool
        True if the DataFrame is valid, raises ValueError otherwise.
    """
    required_cols = {"snapshot_date", "team_id", "player_id", "role", "expected_minutes"}
    missing = required_cols - set(roster_snapshots_df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")
        
    # Check for duplicate team-player allocations on the same date
    duplicates = roster_snapshots_df.duplicated(subset=["snapshot_date", "team_id", "player_id"]).sum()
    if duplicates > 0:
        raise ValueError(f"Found {duplicates} duplicate team-player snapshot rows for the same date")
        
    # Check for invalid nulls in primary identifiers
    for col in ["snapshot_date", "team_id", "player_id"]:
        if roster_snapshots_df[col].isnull().any():
            raise ValueError(f"Null values found in primary column: {col}")
            
    return True
