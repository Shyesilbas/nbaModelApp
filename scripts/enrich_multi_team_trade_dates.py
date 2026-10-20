import re
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]

ESPN_FROM = "2025-07-01"  # ESPN covers 2025-26/2026-27 but misses trades (e.g. 2026-09-14 Leonard/Ingram), so the NBA feed stays as fallback

def load_movements() -> pd.DataFrame:
    path = ROOT / "data/transactions/player_movement.csv"
    if not path.exists():
        from scripts.ingest.ingest_transactions import ingest_transactions
        ingest_transactions()
    nba = pd.read_csv(path)

    from scripts.ingest import ingest_espn_transactions as espn
    by_id, _ = _abbr_maps()
    team_ids = {a: i for i, a in by_id.items()}
    from nba_api.stats.static import teams as static_teams
    lookup = {}
    for t in static_teams.get_teams():
        for k in (t["full_name"], t["nickname"], t["city"]):
            lookup[k.lower()] = t["abbreviation"]
    lookup["la clippers"] = "LAC"
    lookup.pop("los angeles", None)  # ambiguous (Lakers/Clippers)
    names = {}
    for s in ("2025-26", "2026-27"):
        g = pd.read_csv(ROOT / f"data/season={s}/raw/player_games.csv", usecols=["Player_ID", "PLAYER_NAME"]).drop_duplicates()
        names.update({espn.norm(n): int(i) for i, n in zip(g.Player_ID, g.PLAYER_NAME)})
    raw = espn.fetch() if not espn.RAW_PATH.exists() else pd.read_csv(espn.RAW_PATH)
    ev = espn.build_events(raw, names, team_ids, lookup)
    return pd.concat([nba, ev[ev.TRANSACTION_DATE >= ESPN_FROM]], ignore_index=True)

def _abbr_maps():
    from nba_api.stats.static import teams as static_teams
    ts = static_teams.get_teams()
    by_id = {t["id"]: t["abbreviation"] for t in ts}
    by_name = {t["full_name"]: t["abbreviation"] for t in ts}
    by_name["LA Clippers"] = "LAC"
    return by_id, by_name

def apply_movements(df_multi: pd.DataFrame, mv: pd.DataFrame, start: str, end: str, reorder_teams: bool = False) -> pd.DataFrame:
    """Set TRADE_DATE / HOW_ACQUIRED / MOVE_TYPE from the official feed; non-trades are 'Non-rostered'."""
    by_id, by_name = _abbr_maps()
    mv = mv[(mv.TRANSACTION_DATE >= start) & (mv.TRANSACTION_DATE <= end)].sort_values("TRANSACTION_DATE")
    by_player = {pid: g for pid, g in mv.groupby("PLAYER_ID")}
    out = []
    for _, r in df_multi.iterrows():
        teams = [t.strip() for t in str(r["TEAMS_PLAYED_FOR"]).split(",")]
        g = by_player.get(int(r["PLAYER_ID"]))
        trades = g[g.Transaction_Type == "Trade"] if g is not None else None
        if trades is not None and len(trades):
            t = trades.iloc[-1]
            to_team = by_id.get(int(t.TEAM_ID))
            m = re.search(r" from (.+?)\.?$", str(t.TRANSACTION_DESCRIPTION))
            from_team = t.get("FROM_ABBR") if isinstance(t.get("FROM_ABBR"), str) else (by_name.get(m.group(1).strip()) if m else None)
            how = f"Traded to {to_team}" + (f" from {from_team}" if from_team else "")
            kind, date = "Trade", t.TRANSACTION_DATE
            last = g[g.Transaction_Type != "Waive"].iloc[-1]  # a later signing/claim overrides the trade
            cur = by_id.get(int(last.TEAM_ID))
        elif g is not None and len(g):
            t = g.iloc[-1]
            label = {"Signing": "Signed", "Waive": "Waived", "AwardOnWaivers": "Claimed on waivers", "ContractConverted": "Contract converted"}.get(t.Transaction_Type, t.Transaction_Type)
            kind, date, how = "Non-rostered", t.TRANSACTION_DATE, f"{label} ({by_id.get(int(t.TEAM_ID), '')})"
            cur = by_id.get(int(t.TEAM_ID)) if t.Transaction_Type != "Waive" else None
        else:
            kind, date, how, cur = "Non-rostered", "", "No transaction found", None
        if reorder_teams and cur and teams[-1] != cur:  # UI treats the last team as current
            teams = [x for x in teams if x != cur] + [cur]
        out.append((", ".join(teams), date, how, kind))
    df_multi["TEAMS_PLAYED_FOR"], df_multi["TRADE_DATE"], df_multi["HOW_ACQUIRED"], df_multi["MOVE_TYPE"] = zip(*out)
    return df_multi

def enrich_2026_27():
    print("=== Enriching 2026-27 Multi-Team Players with Trade Dates ===")
    csv_path = ROOT / "data/season=2026-27/analysis/multi_team_players.csv"
    if not csv_path.exists():
        return
    # the 2026-27 list is built from 2025-26 stats, so include moves since last July
    df_multi = apply_movements(pd.read_csv(csv_path), load_movements(), "2025-07-01", "2026-12-31", reorder_teams=True)
    df_multi = df_multi.sort_values(by=["TRADE_DATE", "IMPORTANCE_SCORE"], ascending=[False, False]).reset_index(drop=True)
    df_multi.to_csv(csv_path, index=False)
    df_multi.to_parquet(ROOT / "data/season=2026-27/analysis/multi_team_players.parquet", index=False)
    print(f"  -> Enriched {len(df_multi)} players ({(df_multi.MOVE_TYPE == 'Trade').sum()} trades).")

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

    team_order = {int(pid): list(g["TEAM_ABBREVIATION"].drop_duplicates()) for pid, g in df_raw.groupby("Player_ID")}

    df_multi = pd.read_csv(csv_path)
    # TEAMS_PLAYED_FOR is alphabetical; use chronological order from game logs
    df_multi["TEAMS_PLAYED_FOR"] = [", ".join(team_order.get(int(pid)) or [t.strip() for t in str(old).split(",")])
                                    for pid, old in zip(df_multi["PLAYER_ID"], df_multi["TEAMS_PLAYED_FOR"])]
    y = int(season.split("-")[0])
    df_multi = apply_movements(df_multi, load_movements(), f"{y}-07-01", f"{y+1}-06-30")
    # Season stats for the Player Movement UI (source CSV only has names/teams)
    stats = df_raw.groupby("Player_ID").agg(GP=("PTS", "size"), AVG_MIN=("MIN", "mean"), AVG_PTS=("PTS", "mean"),
                                            AVG_REB=("REB", "mean"), AVG_AST=("AST", "mean")).round(1)
    df_multi = df_multi.drop(columns=[c for c in stats.columns if c in df_multi.columns]).join(stats, on="PLAYER_ID")
    df_multi["NUM_TEAMS"] = df_multi["TEAM_COUNT"] if "TEAM_COUNT" in df_multi.columns else df_multi["NUM_TEAMS"]
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
