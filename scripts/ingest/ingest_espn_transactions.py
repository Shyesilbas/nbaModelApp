"""Fetch ESPN NBA transactions (calendar years 2025-2026 = seasons 2025-26 and 2026-27) and turn them into
per-player events in the same shape as the NBA player-movement feed (``data/reference/player_movement.csv``)."""
import re
import unicodedata
from pathlib import Path

import pandas as pd
import requests

from src.core.data_paths import ESPN_TRANSACTIONS_CSV

ROOT = Path(__file__).resolve().parents[2]
URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/transactions"
RAW_PATH = ESPN_TRANSACTIONS_CSV
YEARS = (2025, 2026)
ESPN_ABBR = {"NY": "NYK", "SA": "SAS", "GS": "GSW", "NO": "NOP", "UTAH": "UTA", "WSH": "WAS"}
VERBS = "Waived|Signed|Re-signed|Acquired|Claimed|Converted|Assigned|Recalled|Received|Exercised|Hired|Fired"
EVENT_TYPE = {"Acquired": "Trade", "Signed": "Signing", "Re-signed": "Signing", "Waived": "Waive",
              "Claimed": "AwardOnWaivers", "Converted": "ContractConverted"}
NON_PLAYER = re.compile(r"cash|consideration|pick|draft|right|exception|future|option|swap", re.I)


def fetch() -> pd.DataFrame:
    rows = []
    for year in YEARS:
        page = 1
        while True:
            d = requests.get(URL, params={"season": year, "limit": 100, "page": page}, timeout=30).json()
            rows += [{"date": t["date"][:10], "team": t["team"]["abbreviation"], "description": t["description"]}
                     for t in d["transactions"]]
            if page >= d["pageCount"]:
                break
            page += 1
    df = pd.DataFrame(rows).drop_duplicates()
    assert not df.empty, "ESPN returned no transactions"
    RAW_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(RAW_PATH, index=False)
    print(f"Saved {len(df)} ESPN transactions ({df.date.min()} -> {df.date.max()}) -> {RAW_PATH}")
    return df


def norm(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(jr|sr|ii|iii|iv)\b\.?", "", s)
    return re.sub(r"[^a-z ]", "", s).strip().replace("  ", " ")


def _names(clause: str) -> list[str]:
    clause = re.split(r" from | in exchange| for | to an? | off | with | of the ", clause)[0]
    out = []
    for part in re.split(r", (?:and )?| and ", clause):
        part = re.sub(r"^(?:[GFC](?:-[GFC])?s?\.?)\s+", "", part.strip())  # drop position token (G, Gs., F-C ...)
        if part and not NON_PLAYER.search(part):
            out.append(part.strip(" ."))
    return out


if __name__ == "__main__":
    fetch()
