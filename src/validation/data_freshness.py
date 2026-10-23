"""
data_freshness.py
-----------------
Module for validating local NBA dataset freshness, checking if game logs
are up to date with the schedule, and detecting sync issues between team
and player datasets.

It implements:
  - load_local_datasets()
  - get_latest_team_game_date()
  - get_latest_player_game_date()
  - get_latest_schedule_date()
  - detect_missing_completed_games()
  - detect_team_player_date_mismatch()
  - generate_data_freshness_report()
"""

import os
import json
from datetime import date
from typing import Tuple, List, Dict, Any, Optional
import pandas as pd

from src.ingestion.data_loader import load_team_games, load_player_games
from src.ingestion.schedule_loader import load_combined_schedule


def load_local_datasets(
    refresh_schedule: bool = True,
    season: Optional[str] = None,
    save_schedule: bool = True
) -> Tuple[Optional[pd.DataFrame], Optional[pd.DataFrame], Optional[pd.DataFrame]]:
    """
    Loads raw team games, raw player games, and the combined schedule dataset.
    When refresh_schedule is True, the combined schedule is rebuilt from the
    raw schedule sources so freshness checks always see the latest schedule.
    With save_schedule=False a rebuilt schedule is kept in memory only.
    """
    df_team = None
    df_player = None
    df_schedule = None

    try:
        df_team = load_team_games(season=season)
    except Exception as e:
        print(f"⚠️ Error loading team games for season {season}: {e}")

    try:
        df_player = load_player_games(season=season)
    except Exception as e:
        print(f"⚠️ Error loading player games for season {season}: {e}")

    try:
        if refresh_schedule:
            df_schedule = load_combined_schedule(save=save_schedule, season=season)
        else:
            from src.core.data_paths import get_data_paths
            paths = get_data_paths(season)
            schedule_csv = paths.schedule_combined
            if os.path.exists(schedule_csv):
                df_schedule = pd.read_csv(schedule_csv, dtype={"GAME_ID": str})
            else:
                df_schedule = load_combined_schedule(save=save_schedule, season=season)
    except Exception as e:
        print(f"⚠️ Error loading combined schedule: {e}")

    return df_team, df_player, df_schedule


def get_latest_team_game_date(df_team: pd.DataFrame) -> Optional[str]:
    """Returns the latest game date in the team games dataset as YYYY-MM-DD."""
    if df_team is None or df_team.empty or "GAME_DATE" not in df_team.columns:
        return None
    dates = pd.to_datetime(df_team["GAME_DATE"], errors="coerce")
    max_date = dates.max()
    return max_date.strftime("%Y-%m-%d") if pd.notna(max_date) else None


def get_latest_player_game_date(df_player: pd.DataFrame) -> Optional[str]:
    """Returns the latest game date in the player games dataset as YYYY-MM-DD."""
    if df_player is None or df_player.empty or "GAME_DATE" not in df_player.columns:
        return None
    dates = pd.to_datetime(df_player["GAME_DATE"], errors="coerce")
    max_date = dates.max()
    return max_date.strftime("%Y-%m-%d") if pd.notna(max_date) else None


def get_latest_schedule_date(df_schedule: pd.DataFrame) -> Optional[str]:
    """Returns the latest game date in the combined schedule as YYYY-MM-DD."""
    if df_schedule is None or df_schedule.empty or "GAME_DATE" not in df_schedule.columns:
        return None
    dates = pd.to_datetime(df_schedule["GAME_DATE"], errors="coerce")
    max_date = dates.max()
    return max_date.strftime("%Y-%m-%d") if pd.notna(max_date) else None


def get_inferred_finals_games(df_schedule: pd.DataFrame) -> List[Dict[str, Any]]:
    """
    Detects gaps in Finals game IDs (0042500401 to 0042500407) in the schedule
    and infers their dates and matchups based on typical schedule spacings.
    """
    inferred_games = []
    if df_schedule is None or df_schedule.empty:
        return inferred_games

    df_copy = df_schedule.copy()
    df_copy["GAME_ID_NORM"] = df_copy["GAME_ID"].astype(str).str.zfill(10)
    df_copy["GAME_DATE_DT"] = pd.to_datetime(df_copy["GAME_DATE"], errors="coerce")

    finals_mask = df_copy["GAME_ID_NORM"].str.startswith("00425004")
    finals_present = df_copy[finals_mask]
    if finals_present.empty:
        return inferred_games

    present_ids = set(finals_present["GAME_ID_NORM"])

    for i in range(1, 8):
        game_id_norm = f"00425004{i:02d}"
        if game_id_norm not in present_ids:
            # Find surrounding games to interpolate date
            prev_games = finals_present[finals_present["GAME_ID_NORM"] < game_id_norm]
            next_games = finals_present[finals_present["GAME_ID_NORM"] > game_id_norm]

            inferred_date = None
            if not prev_games.empty and not next_games.empty:
                prev_date = prev_games["GAME_DATE_DT"].max()
                next_date = next_games["GAME_DATE_DT"].min()
                # Use midpoint date
                inferred_date = prev_date + (next_date - prev_date) / 2
            elif not prev_games.empty:
                inferred_date = prev_games["GAME_DATE_DT"].max() + pd.Timedelta(days=2)
            elif not next_games.empty:
                inferred_date = next_games["GAME_DATE_DT"].min() - pd.Timedelta(days=2)

            # Matchup inference
            # Games 1, 2, 5, 7 have home court at team A. Games 3, 4, 6 at team B.
            game1 = finals_present[finals_present["GAME_ID_NORM"] == "0042500401"]
            if not game1.empty:
                team_a = game1.iloc[0]["HOME_TEAM_ABBREVIATION"]
                team_b = game1.iloc[0]["AWAY_TEAM_ABBREVIATION"]
            else:
                any_game = finals_present.iloc[0]
                g_num = int(any_game["GAME_ID_NORM"][-2:])
                if g_num in [1, 2, 5, 7]:
                    team_a = any_game["HOME_TEAM_ABBREVIATION"]
                    team_b = any_game["AWAY_TEAM_ABBREVIATION"]
                else:
                    team_a = any_game["AWAY_TEAM_ABBREVIATION"]
                    team_b = any_game["HOME_TEAM_ABBREVIATION"]

            if i in [1, 2, 5, 7]:
                home_team = team_a
                away_team = team_b
            else:
                home_team = team_b
                away_team = team_a

            matchup = f"{away_team} @ {home_team}"

            inferred_games.append({
                "GAME_ID": game_id_norm,
                "GAME_ID_NORM": game_id_norm,
                "GAME_DATE": inferred_date.strftime("%Y-%m-%d") if inferred_date else None,
                "GAME_DATE_DT": inferred_date,
                "HOME_TEAM_ABBREVIATION": home_team,
                "AWAY_TEAM_ABBREVIATION": away_team,
                "matchup": matchup,
                "SEASON_TYPE": "NBA Finals"
            })

    return inferred_games


def _filter_completed_schedule_games(df_schedule: pd.DataFrame, today: date) -> pd.DataFrame:
    """
    Return schedule rows that should have final box scores.

    NBA schedule feeds can contain future or placeholder games whose dates are
    already behind the local clock in test/future-season workflows. When the
    feed includes GAME_STATUS, trust explicit Final status instead of probing
    every dated row with BoxScoreTraditionalV2.
    """
    if df_schedule is None or df_schedule.empty:
        return df_schedule

    df_copy = df_schedule.copy()
    if "GAME_DATE_DT" not in df_copy.columns:
        df_copy["GAME_DATE_DT"] = pd.to_datetime(df_copy["GAME_DATE"], errors="coerce")

    if _schedule_has_meaningful_status(df_copy):
        status = df_copy["GAME_STATUS"].fillna("").astype(str).str.strip().str.lower()
        return df_copy[(status == "final") & df_copy["GAME_DATE_DT"].notna()]

    today_ts = pd.Timestamp(today)
    return df_copy[(df_copy["GAME_DATE_DT"] <= today_ts) & df_copy["GAME_DATE_DT"].notna()]


def _schedule_has_meaningful_status(df_schedule: pd.DataFrame) -> bool:
    if df_schedule is None or df_schedule.empty or "GAME_STATUS" not in df_schedule.columns:
        return False
    status = df_schedule["GAME_STATUS"].fillna("").astype(str).str.strip()
    return status.ne("").any()


def detect_missing_completed_games(
    df_team: pd.DataFrame,
    df_schedule: pd.DataFrame,
    today: Optional[date] = None
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Compares completed scheduled games (including inferred ones) against team games.
    Reports:
      - missing game IDs (0 rows in team games)
      - incomplete game IDs (e.g. 1 row instead of 2 in team games)
    """
    if today is None:
        today = date.today()

    missing_reports = []
    warnings = []

    if df_schedule is None or df_schedule.empty:
        return missing_reports, warnings

    # Normalize GAME_ID in schedule
    df_sched_copy = df_schedule.copy()
    df_sched_copy["GAME_ID_NORM"] = df_sched_copy["GAME_ID"].astype(str).str.zfill(10)
    df_sched_copy["GAME_DATE_DT"] = pd.to_datetime(df_sched_copy["GAME_DATE"], errors="coerce")

    # Inject inferred Finals games to detect gaps
    inferred = get_inferred_finals_games(df_schedule)
    if inferred:
        df_inferred = pd.DataFrame(inferred)
        df_sched_copy = pd.concat([df_sched_copy, df_inferred], ignore_index=True)

    completed_sched = _filter_completed_schedule_games(df_sched_copy, today)
    if not _schedule_has_meaningful_status(df_sched_copy) and df_team is not None and not df_team.empty:
        latest_team_date = get_latest_team_game_date(df_team)
        if latest_team_date:
            incremental_floor = pd.to_datetime(latest_team_date) - pd.Timedelta(days=3)
            completed_sched = completed_sched[completed_sched["GAME_DATE_DT"] >= incremental_floor]

    # Normalize team game IDs
    team_counts = {}
    if df_team is not None and not df_team.empty and "GAME_ID" in df_team.columns:
        df_team_copy = df_team.copy()
        df_team_copy["GAME_ID_NORM"] = df_team_copy["GAME_ID"].astype(str).str.zfill(10)
        team_counts = df_team_copy["GAME_ID_NORM"].value_counts().to_dict()

    for _, row in completed_sched.iterrows():
        game_id_norm = row["GAME_ID_NORM"]
        game_date_str = row["GAME_DATE_DT"].strftime("%Y-%m-%d")
        
        # Determine matchup
        away = row.get("AWAY_TEAM_ABBREVIATION")
        home = row.get("HOME_TEAM_ABBREVIATION")
        if "matchup" in row and pd.notna(row["matchup"]):
            matchup = row["matchup"]
        elif pd.notna(away) and pd.notna(home):
            matchup = f"{away} @ {home}"
        else:
            matchup = "Unknown Matchup"

        count = team_counts.get(game_id_norm, 0)
        if count == 0:
            missing_reports.append({
                "game_id": game_id_norm,
                "game_date": game_date_str,
                "matchup": matchup,
                "row_count": 0
            })
            warnings.append(
                f"Missing completed game: {game_id_norm} | {game_date_str} | {matchup} (0 rows in team_games)"
            )
        elif count != 2:
            missing_reports.append({
                "game_id": game_id_norm,
                "game_date": game_date_str,
                "matchup": matchup,
                "row_count": count
            })
            warnings.append(
                f"Incomplete team game row count: {game_id_norm} | {game_date_str} | {matchup} has {count} rows (expected 2)"
            )

    return missing_reports, warnings


def detect_team_player_date_mismatch(
    df_team: pd.DataFrame,
    df_player: pd.DataFrame
) -> Tuple[Optional[str], Optional[str], List[str], List[str], List[str]]:
    """
    Compares the latest dates and GAME_ID coverage between team and player games.
    """
    warnings = []
    team_only_ids = []
    player_only_ids = []

    latest_team_date = get_latest_team_game_date(df_team)
    latest_player_date = get_latest_player_game_date(df_player)

    if latest_team_date and latest_player_date:
        if latest_team_date != latest_player_date:
            warnings.append(
                f"Dataset sync mismatch: Latest team game date ({latest_team_date}) "
                f"does not match latest player game date ({latest_player_date})."
            )

    # GAME_ID coverage checks
    team_ids = set()
    if df_team is not None and not df_team.empty and "GAME_ID" in df_team.columns:
        team_ids = set(df_team["GAME_ID"].astype(str).str.zfill(10))

    player_ids = set()
    if df_player is not None and not df_player.empty and "Game_ID" in df_player.columns:
        player_ids = set(df_player["Game_ID"].astype(str).str.zfill(10))

    team_only_ids = sorted(list(team_ids - player_ids))
    player_only_ids = sorted(list(player_ids - team_ids))

    if team_only_ids:
        warnings.append(
            f"Sync anomaly: Found {len(team_only_ids)} game IDs in team_games but not in player_games."
        )
    if player_only_ids:
        warnings.append(
            f"Sync anomaly: Found {len(player_only_ids)} game IDs in player_games but not in team_games."
        )

    return latest_team_date, latest_player_date, team_only_ids, player_only_ids, warnings


def generate_data_freshness_report(
    df_team: pd.DataFrame,
    df_player: pd.DataFrame,
    df_schedule: pd.DataFrame,
    today: Optional[date] = None,
    output_dir: str = "reports/operations",
    write_files: bool = True
) -> Dict[str, Any]:
    """
    Generates validation reports (JSON + Markdown) and writes them to disk.
    Determines status ("OK" | "WARNING" | "ERROR") based on discrepancies.
    With write_files=False only the results dict is returned.
    """
    if today is None:
        today = date.today()

    warnings = []
    status = "OK"

    # Validate loads
    if df_team is None or df_team.empty:
        warnings.append("Critical: Team games dataset could not be loaded or is empty.")
        status = "ERROR"
    if df_player is None or df_player.empty:
        warnings.append("Critical: Player games dataset could not be loaded or is empty.")
        status = "ERROR"
    if df_schedule is None or df_schedule.empty:
        warnings.append("Critical: Combined schedule could not be loaded or is empty.")
        status = "ERROR"

    latest_team_date = get_latest_team_game_date(df_team)
    latest_player_date = get_latest_player_game_date(df_player)
    latest_schedule_date = get_latest_schedule_date(df_schedule)

    # 1. Latest Date Checks & Behind Schedule Checks
    latest_upcoming_date = None
    if df_schedule is not None and not df_schedule.empty:
        df_sched_copy = df_schedule.copy()
        df_sched_copy["GAME_DATE_DT"] = pd.to_datetime(df_sched_copy["GAME_DATE"], errors="coerce")
        today_ts = pd.Timestamp(today)
        
        upcoming_games = df_sched_copy[df_sched_copy["GAME_DATE_DT"] >= today_ts]
        if not upcoming_games.empty:
            latest_upcoming_date = upcoming_games["GAME_DATE_DT"].max().strftime("%Y-%m-%d")

        completed_games = _filter_completed_schedule_games(df_sched_copy, today)
        if not completed_games.empty:
            max_completed_sched_date = completed_games["GAME_DATE_DT"].max()
            max_completed_sched_str = max_completed_sched_date.strftime("%Y-%m-%d")

            if latest_team_date:
                latest_team_dt = pd.to_datetime(latest_team_date)
                if latest_team_dt < max_completed_sched_date:
                    warnings.append(
                        f"Team games dataset is behind completed schedule games. "
                        f"Latest team game: {latest_team_date}, Latest completed schedule: {max_completed_sched_str}."
                    )
                    if status != "ERROR":
                        status = "WARNING"

            if latest_player_date:
                latest_player_dt = pd.to_datetime(latest_player_date)
                if latest_player_dt < max_completed_sched_date:
                    warnings.append(
                        f"Player games dataset is behind completed schedule games. "
                        f"Latest player game: {latest_player_date}, Latest completed schedule: {max_completed_sched_str}."
                    )
                    if status != "ERROR":
                        status = "WARNING"

    # 2. Missing Completed Games
    missing_completed, missing_warnings = detect_missing_completed_games(df_team, df_schedule, today)
    warnings.extend(missing_warnings)
    if missing_completed and status != "ERROR":
        status = "WARNING"

    # 3. Team vs Player Dataset Sync
    team_date, player_date, team_only, player_only, sync_warnings = detect_team_player_date_mismatch(df_team, df_player)
    warnings.extend(sync_warnings)
    if (team_only or player_only or (latest_team_date != latest_player_date)) and status != "ERROR":
        status = "WARNING"

    team_player_mismatch_game_ids = sorted(list(set(team_only) | set(player_only)))
    missing_completed_game_ids = [m["game_id"] for m in missing_completed if m["row_count"] == 0]

    # 4. Finals / Playoff Special Handling
    finals_warnings = []
    if df_schedule is not None and not df_schedule.empty:
        df_sched_copy = df_schedule.copy()
        df_sched_copy["GAME_ID_NORM"] = df_sched_copy["GAME_ID"].astype(str).str.zfill(10)
        df_sched_copy["GAME_DATE_DT"] = pd.to_datetime(df_sched_copy["GAME_DATE"], errors="coerce")

        # Inject inferred finals games so they are checked too
        inferred = get_inferred_finals_games(df_schedule)
        if inferred:
            df_inferred = pd.DataFrame(inferred)
            df_sched_copy = pd.concat([df_sched_copy, df_inferred], ignore_index=True)

        finals_mask = (df_sched_copy["SEASON_TYPE"] == "NBA Finals") | (df_sched_copy["GAME_ID_NORM"].str.startswith("00425004"))
        finals_sched = df_sched_copy[finals_mask]

        completed_finals = _filter_completed_schedule_games(finals_sched, today)

        team_ids = set(df_team["GAME_ID"].astype(str).str.zfill(10)) if df_team is not None and not df_team.empty else set()
        player_ids = set(df_player["Game_ID"].astype(str).str.zfill(10)) if df_player is not None and not df_player.empty else set()

        for _, row in completed_finals.iterrows():
            game_id_norm = row["GAME_ID_NORM"]
            game_date_str = row["GAME_DATE_DT"].strftime("%Y-%m-%d")
            
            away = row.get("AWAY_TEAM_ABBREVIATION")
            home = row.get("HOME_TEAM_ABBREVIATION")
            if "matchup" in row and pd.notna(row["matchup"]):
                matchup = row["matchup"]
            elif pd.notna(away) and pd.notna(home):
                matchup = f"{away} @ {home}"
            else:
                matchup = "Unknown Matchup"

            is_missing_team = game_id_norm not in team_ids
            is_missing_player = game_id_norm not in player_ids

            if is_missing_team or is_missing_player:
                finals_warnings.append(
                    f"Potential completed Finals game missing from raw datasets: {game_id_norm} | {game_date_str} | {matchup}"
                )
                warnings.append("Potential completed Finals game missing from raw datasets.")
                if status != "ERROR":
                    status = "WARNING"

    results = {
        "status": status,
        "latest_team_game_date": latest_team_date,
        "latest_player_game_date": latest_player_date,
        "latest_schedule_date": latest_schedule_date,
        "latest_upcoming_scheduled_game_date": latest_upcoming_date,
        "current_local_date": today.strftime("%Y-%m-%d"),
        "missing_completed_game_ids": missing_completed_game_ids,
        "team_player_mismatch_game_ids": team_player_mismatch_game_ids,
        "all_missing_completed_info": missing_completed,
        "finals_warnings": finals_warnings,
        "warnings": warnings
    }

    if not write_files:
        return results

    # Write report files
    os.makedirs(output_dir, exist_ok=True)
    md_path = os.path.join(output_dir, "data_freshness_report.md")
    json_path = os.path.join(output_dir, "data_freshness_report.json")

    # 1. JSON Report
    json_data = {
        "status": status,
        "latest_team_game_date": latest_team_date,
        "latest_player_game_date": latest_player_date,
        "latest_schedule_date": latest_schedule_date,
        "missing_completed_game_ids": missing_completed_game_ids,
        "team_player_mismatch_game_ids": team_player_mismatch_game_ids,
        "warnings": warnings
    }
    with open(json_path, "w") as f:
        json.dump(json_data, f, indent=2)

    # 2. Markdown Report
    with open(md_path, "w") as f:
        f.write("# NBA ML Project — Data Freshness & Sync Report\n\n")
        f.write(f"> Generated: {today.strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"> Overall Status: **{status}**\n\n")

        f.write("## 1. Latest Dates Overview\n\n")
        f.write(f"- **Current Local Date**: `{today.strftime('%Y-%m-%d')}`\n")
        f.write(f"- **Latest Team Games Date**: `{latest_team_date or 'N/A'}`\n")
        f.write(f"- **Latest Player Games Date**: `{latest_player_date or 'N/A'}`\n")
        f.write(f"- **Latest Schedule Date (Combined)**: `{latest_schedule_date or 'N/A'}`\n")
        f.write(f"- **Latest Upcoming Scheduled Game Date**: `{latest_upcoming_date or 'N/A'}`\n\n")

        f.write("## 2. Missing Played/Completed Games\n\n")
        if missing_completed:
            f.write("| Game ID | Date | Matchup | Team Game Rows |\n")
            f.write("| :--- | :--- | :--- | :---: |\n")
            for m in missing_completed:
                f.write(f"| `{m['game_id']}` | {m['game_date']} | {m['matchup']} | {m['row_count']} |\n")
            f.write("\n")
        else:
            f.write("✅ All scheduled completed games are present in team games.\n\n")

        f.write("## 3. Dataset Sync (Team vs Player Games)\n\n")
        f.write(f"- **Game IDs in team_games only**: {len(team_only)}\n")
        f.write(f"- **Game IDs in player_games only**: {len(player_only)}\n\n")
        if team_player_mismatch_game_ids:
            f.write("### Game ID Coverage Discrepancies\n\n")
            f.write("| Game ID | Source Location | Status |\n")
            f.write("| :--- | :--- | :--- |\n")
            for gid in team_only[:50]:
                f.write(f"| `{gid}` | team_games | Missing in player_games |\n")
            for gid in player_only[:50]:
                f.write(f"| `{gid}` | player_games | Missing in team_games |\n")
            if len(team_player_mismatch_game_ids) > 100:
                f.write(f"\n*...and {len(team_player_mismatch_game_ids) - 100} more mismatches.*\n")
            f.write("\n")
        else:
            f.write("✅ Game ID coverage matches perfectly between team and player game logs.\n\n")

        f.write("## 4. Finals / Playoff Anomaly Detection\n\n")
        if finals_warnings:
            for fw in finals_warnings:
                f.write(f"- ⚠️ {fw}\n")
            f.write("\n")
        else:
            f.write("✅ No missing completed Finals games detected.\n\n")

        f.write("## 5. Active Warnings / Diagnostics\n\n")
        if warnings:
            # Deduplicate warnings while preserving order
            seen_warn = set()
            for w in warnings:
                if w not in seen_warn:
                    f.write(f"- ⚠️ {w}\n")
                    seen_warn.add(w)
        else:
            f.write("✅ No warnings or data discrepancies detected.\n")

    return results
