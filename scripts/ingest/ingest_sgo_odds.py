"""Download raw NBA odds (with open/close lines) from SportsGameOdds, one JSON file per page.

    python -m scripts.ingest.ingest_sgo_odds --seasons 2020-21 2021-22 --probe   # 1 page, prints shape
    python -m scripts.ingest.ingest_sgo_odds --seasons 2020-21 ... 2025-26       # full download

Needs SPORTSGAMEODDS_API_KEY in the environment or in .env. Resumable: re-running skips
pages already on disk. Odds are for COMPARISON ONLY, never a model feature.
"""
from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/raw/odds/sgo"
BASE = "https://api.sportsgameodds.com/v2/events"
ODD_IDS = ",".join([
    "points-home-game-ml-home", "points-away-game-ml-away",
    "points-home-game-sp-home", "points-away-game-sp-away",
    "points-all-game-ou-over", "points-all-game-ou-under",
])
BOOKS = "pinnacle,circa,draftkings,fanduel"


def season_window(season: str) -> tuple[str, str]:
    y = int(season[:4])
    return f"{y}-09-25T00:00:00Z", f"{y + 1}-07-01T00:00:00Z"


def api_key() -> str:
    key = os.environ.get("SPORTSGAMEODDS_API_KEY")
    env = ROOT / ".env"
    if not key and env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("SPORTSGAMEODDS_API_KEY="):
                key = line.split("=", 1)[1].strip().strip("'\"")
    if not key:
        raise SystemExit("SPORTSGAMEODDS_API_KEY not set (env or .env)")
    return key


def get(params: dict, retries: int = 5) -> dict:
    for attempt in range(retries):
        r = requests.get(BASE, params=params, timeout=60)
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(2 ** attempt)
            continue
        if r.status_code != 200:
            # never echo the URL: it carries the key
            raise SystemExit(f"HTTP {r.status_code}: {r.text[:300]}")
        return r.json()
    raise SystemExit("gave up after repeated 429/5xx")


def download(season: str, key: str, probe: bool, limit: int) -> None:
    after, before = season_window(season)
    out = OUT / season
    out.mkdir(parents=True, exist_ok=True)
    params = {
        "apiKey": key, "leagueID": "NBA", "finalized": "true",
        "startsAfter": after, "startsBefore": before, "limit": limit,
        "oddID": ODD_IDS, "bookmakerID": BOOKS, "includeOpenCloseOdds": "true",
    }
    cursor, page = None, 0
    while True:
        f = out / f"page_{page:04d}.json"
        if f.exists():
            body = json.loads(f.read_text())
        else:
            body = get({**params, **({"cursor": cursor} if cursor else {})})
            f.write_text(json.dumps(body))
            time.sleep(0.25)  # ~240 req/min, under the 300/min cap
        data = body.get("data") or []
        print(f"{season} page {page}: {len(data)} events")
        cursor = body.get("nextCursor")
        # an empty page on a cursor request is the real end (doc: nextCursor can linger)
        if probe or not data or not cursor:
            return
        page += 1


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons", nargs="+", required=True)
    ap.add_argument("--probe", action="store_true", help="fetch only the first page")
    ap.add_argument("--limit", type=int, default=100)
    a = ap.parse_args()
    key = api_key()
    for s in a.seasons:
        download(s, key, a.probe, a.limit)


if __name__ == "__main__":
    main()
