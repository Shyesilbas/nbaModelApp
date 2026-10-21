"""Download the official NBA player movement feed (trades, signings, waivers) to data/transactions/player_movement.csv."""
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[2]
FEED_URL = "https://stats.nba.com/js/data/playermovement/NBA_Player_Movement.json"
OUT_PATH = ROOT / "data" / "transactions" / "player_movement.csv"


def ingest_transactions(output_path: Path = OUT_PATH) -> pd.DataFrame:
    resp = requests.get(FEED_URL, headers={"User-Agent": "Mozilla/5.0"}, timeout=60)
    resp.raise_for_status()
    df = pd.DataFrame(resp.json()["NBA_Player_Movement"]["rows"])
    assert not df.empty and {"Transaction_Type", "TRANSACTION_DATE", "PLAYER_ID", "TEAM_ID"} <= set(df.columns), "unexpected feed schema"
    df["TRANSACTION_DATE"] = df["TRANSACTION_DATE"].str[:10]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False)
    print(f"Saved {len(df)} transactions ({df.TRANSACTION_DATE.min()} -> {df.TRANSACTION_DATE.max()}) -> {output_path}")
    return df


if __name__ == "__main__":
    ingest_transactions()
