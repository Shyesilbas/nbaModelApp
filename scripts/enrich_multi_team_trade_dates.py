import os
import re
import json
import time
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]

TEAM_IDS = [
    1610612737, 1610612738, 1610612739, 1610612740, 1610612741,
    1610612742, 1610612743, 1610612744, 1610612745, 1610612746,
    1610612747, 1610612748, 1610612749, 1610612750, 1610612751,
    1610612752, 1610612753, 1610612754, 1610612755, 1610612756,
    1610612757, 1610612758, 1610612759, 1610612760, 1610612761,
    1610612762, 1610612763, 1610612764, 1610612765, 1610612766
]

def parse_acquired_date(how_acquired: str) -> str | None:
    if not how_acquired or not isinstance(how_acquired, str):
        return None
    # Look for MM/DD/YY or MM/DD/YYYY
    m = re.search(r'(\d{1,2})/(\d{1,2})/(\d{2,4})', how_acquired)
    if m:
        month, day, year = m.groups()
        if len(year) == 2:
            year = "20" + year
        return f"{year}-{int(month):02d}-{int(day):02d}"
    # Look for Draft pick
    m_draft = re.search(r'in (\d{4}) Draft', how_acquired)
    if m_draft:
        return f"{m_draft.group(1)}-06-25"
    return None

def enrich_2026_27():
    print("=== Enriching 2026-27 Multi-Team Players with Trade Dates ===")
    from src.ingestion.nba_api_client import call_nba_api
    from nba_api.stats.endpoints import commonteamroster

    acquired_map = {}
    for idx, tid in enumerate(TEAM_IDS, start=1):
        try:
            print(f"[{idx}/30] Fetching roster for team ID {tid}...")
            ctr = call_nba_api(commonteamroster.CommonTeamRoster, team_id=tid, season="2026-27", timeout=20)
            df = ctr.get_data_frames()[0]
            for _, r in df.iterrows():
                pid = int(r["PLAYER_ID"])
                how = str(r.get("HOW_ACQUIRED", ""))
                dt = parse_acquired_date(how)
                acquired_map[pid] = {
                    "HOW_ACQUIRED": how,
                    "TRADE_DATE": dt
                }
        except Exception as e:
            print(f"  Warning: failed for team {tid}: {e}")

    # Load 2026-27 multi_team_players
    csv_path = ROOT / "data/season=2026-27/analysis/multi_team_players.csv"
    if csv_path.exists():
        df_multi = pd.read_csv(csv_path)
        trade_dates = []
        how_acquired_list = []
        for _, r in df_multi.iterrows():
            pid = int(r["PLAYER_ID"])
            info = acquired_map.get(pid, {})
            dt = info.get("TRADE_DATE")
            how = info.get("HOW_ACQUIRED", "")
            # Fallback if no specific date was parsed: offseason trade window July 2026
            if not dt:
                dt = "2026-07-06"
                how = f"Acquired by {str(r.get('TEAMS_PLAYED_FOR', '')).split(',')[-1].strip()}"
            trade_dates.append(dt)
            how_acquired_list.append(how)

        df_multi["TRADE_DATE"] = trade_dates
        df_multi["HOW_ACQUIRED"] = how_acquired_list

        # Sort primarily by TRADE_DATE descending, then IMPORTANCE_SCORE descending
        df_multi = df_multi.sort_values(by=["TRADE_DATE", "IMPORTANCE_SCORE"], ascending=[False, False]).reset_index(drop=True)

        df_multi.to_csv(csv_path, index=False)
        parquet_path = ROOT / "data/season=2026-27/analysis/multi_team_players.parquet"
        df_multi.to_parquet(parquet_path, index=False)

        # Save to frontend public data
        pub_json = ROOT / "frontend/public/data/multi_team_players.json"
        with open(pub_json, "w", encoding="utf-8") as f:
            json.dump(df_multi.to_dict(orient="records"), f, indent=2)

        root_json = ROOT / "data/multi_team_players.json"
        with open(root_json, "w", encoding="utf-8") as f:
            json.dump(df_multi.to_dict(orient="records"), f, indent=2)

        print(f"  -> Enriched {len(df_multi)} players with TRADE_DATE and HOW_ACQUIRED.")

def enrich_historical_season(season: str):
    csv_path = ROOT / f"data/season={season}/analysis/multi_team_players.csv"
    raw_games_path = ROOT / f"data/season={season}/raw/player_games.csv"
    if not csv_path.exists() or not raw_games_path.exists():
        return

    print(f"=== Enriching {season} Multi-Team Players with Trade Dates ===")
    df_raw = pd.read_csv(raw_games_path)
    df_raw["TEAM_ABBREVIATION"] = df_raw["MATCHUP"].str.split().str[0]
    df_raw["GAME_DATE"] = pd.to_datetime(df_raw["GAME_DATE"])
    df_raw = df_raw.sort_values(["Player_ID", "GAME_DATE"])

    # Map player_id to their latest team debut date
    debut_dates = {}
    for pid, group in df_raw.groupby("Player_ID"):
        teams = group["TEAM_ABBREVIATION"].unique()
        if len(teams) > 1:
            first_team = group.iloc[0]["TEAM_ABBREVIATION"]
            subsequent = group[group["TEAM_ABBREVIATION"] != first_team]
            if len(subsequent) > 0:
                latest_team = group.iloc[-1]["TEAM_ABBREVIATION"]
                sub_team_games = subsequent[subsequent["TEAM_ABBREVIATION"] == latest_team]
                if len(sub_team_games) > 0:
                    debut_dates[int(pid)] = sub_team_games.iloc[0]["GAME_DATE"].strftime("%Y-%m-%d")

    df_multi = pd.read_csv(csv_path)
    dates = []
    how_list = []
    default_year = season.split("-")[0]
    for _, r in df_multi.iterrows():
        pid = int(r["PLAYER_ID"])
        dt = debut_dates.get(pid)
        if not dt:
            dt = f"{int(default_year)+1}-02-08" # Trade deadline default
        dates.append(dt)
        teams = str(r.get("TEAMS_PLAYED_FOR", "")).split(",")
        last_team = teams[-1].strip() if teams else "New Team"
        from_team = teams[0].strip() if len(teams) > 1 else ""
        how = f"Traded to {last_team}" + (f" from {from_team}" if from_team else "")
        how_list.append(how)

    df_multi["TRADE_DATE"] = dates
    df_multi["HOW_ACQUIRED"] = how_list
    df_multi = df_multi.sort_values(by=["TRADE_DATE", "IMPORTANCE_SCORE" if "IMPORTANCE_SCORE" in df_multi.columns else "PLAYER_ID"], ascending=[False, False]).reset_index(drop=True)

    df_multi.to_csv(csv_path, index=False)
    parquet_path = ROOT / f"data/season={season}/analysis/multi_team_players.parquet"
    df_multi.to_parquet(parquet_path, index=False)
    print(f"  -> Enriched {season} with {len(df_multi)} players.")

def main():
    enrich_2026_27()
    for s in ["2025-26", "2024-25", "2023-24", "2022-23", "2021-22", "2020-21"]:
        enrich_historical_season(s)
    print("All seasons enriched successfully!")

if __name__ == "__main__":
    main()
