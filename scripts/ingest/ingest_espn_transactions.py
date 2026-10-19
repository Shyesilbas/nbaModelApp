"""Fetch ESPN NBA transactions (calendar years 2025-2026 = seasons 2025-26 and 2026-27) and turn them into
per-player events in the same shape as the NBA player-movement feed (see enrich_multi_team_trade_dates.py)."""
import re
import unicodedata
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[2]
URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/transactions"
RAW_PATH = ROOT / "data" / "transactions" / "espn_transactions.csv"
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


def build_events(raw: pd.DataFrame, name_to_id: dict, team_ids: dict, team_lookup: dict) -> pd.DataFrame:
    """One row per (player, transaction); FROM_ABBR is the trade partner when ESPN names an unambiguous team."""
    events, unmatched = [], 0
    for _, r in raw.iterrows():
        abbr = ESPN_ABBR.get(r.team, r.team)
        if abbr not in team_ids:
            continue
        for seg in re.split(rf"(?<=\.)\s+(?=(?:{VERBS})\b)", r.description):
            m = re.match(rf"({VERBS}) (.*)", seg)
            if not m or m.group(1) not in EVENT_TYPE:
                continue
            verb, rest = m.groups()
            from_team = None
            if verb == "Acquired":
                fm = re.search(r" from (?:the )?(.+?)(?: in exchange| for |\.|$)", rest)
                if fm:
                    key = fm.group(1).strip().lower()
                    from_team = next((a for k, a in team_lookup.items() if key == k), None)
            for name in _names(rest):
                pid = name_to_id.get(norm(name))
                if pid is None:
                    unmatched += verb == "Acquired"
                    continue
                events.append({"PLAYER_ID": pid, "TRANSACTION_DATE": r.date, "Transaction_Type": EVENT_TYPE[verb],
                               "TEAM_ID": team_ids[abbr], "TRANSACTION_DESCRIPTION": seg, "FROM_ABBR": from_team})
    print(f"ESPN events: {len(events)} matched, {unmatched} unmatched acquired names")
    return pd.DataFrame(events)


if __name__ == "__main__":
    fetch()
