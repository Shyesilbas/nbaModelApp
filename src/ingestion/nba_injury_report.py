"""Official NBA injury report: find the latest PDF, parse it, turn it into model status overrides.

The league publishes a PDF every 15 minutes (Injury-Report_YYYY-MM-DD_HH_MMAM.pdf, Eastern time),
linked from official.nba.com/nba-injury-report-YYYY-YY-season/. Teams that have not filed yet
show "NOT YET SUBMITTED"; those games get no overrides, so the model keeps its default assumption.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple
from zoneinfo import ZoneInfo

import pandas as pd
import requests

from src.core.data_paths import get_data_paths
from src.core.season_utils import normalize_season

ET = ZoneInfo("America/New_York")
PAGE_URL = "https://official.nba.com/nba-injury-report-{season}-season/"
PDF_URL = "https://ak-static.cms.nba.com/referee/injury/Injury-Report_{day}_{hh}_{mm}{ap}.pdf"
USER_AGENT = "Mozilla/5.0"
PDF_NAME = re.compile(r"Injury-Report_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})([AP]M)\.pdf")

TEAM_ABBR = {
    "Atlanta Hawks": "ATL", "Boston Celtics": "BOS", "Brooklyn Nets": "BKN", "Charlotte Hornets": "CHA",
    "Chicago Bulls": "CHI", "Cleveland Cavaliers": "CLE", "Dallas Mavericks": "DAL", "Denver Nuggets": "DEN",
    "Detroit Pistons": "DET", "Golden State Warriors": "GSW", "Houston Rockets": "HOU", "Indiana Pacers": "IND",
    "LA Clippers": "LAC", "Los Angeles Lakers": "LAL", "Memphis Grizzlies": "MEM", "Miami Heat": "MIA",
    "Milwaukee Bucks": "MIL", "Minnesota Timberwolves": "MIN", "New Orleans Pelicans": "NOP",
    "New York Knicks": "NYK", "Oklahoma City Thunder": "OKC", "Orlando Magic": "ORL",
    "Philadelphia 76ers": "PHI", "Phoenix Suns": "PHX", "Portland Trail Blazers": "POR",
    "Sacramento Kings": "SAC", "San Antonio Spurs": "SAS", "Toronto Raptors": "TOR", "Utah Jazz": "UTA",
    "Washington Wizards": "WAS",
}
STATUSES = ("Out", "Doubtful", "Questionable", "Probable", "Available")

# Availability factor per reported status, as used by the roster absence feature
# (0 = absent, 1 = plays a normal share of minutes). Questionable and Doubtful are placeholders
# until the real play rate of those statuses is measured.
STATUS_FACTOR = {"Out": 0.0, "Doubtful": 0.25, "Questionable": 0.6, "Probable": 0.9, "Available": 1.0}
STATUS_LABEL = {"Out": "OUT", "Doubtful": "RESTRICTED", "Questionable": "RESTRICTED", "Probable": "ACTIVE", "Available": "ACTIVE"}

_DATE = re.compile(r"^\d{2}/\d{2}/\d{4}$")
_TIME = re.compile(r"^\d{2}:\d{2} \(ET\)$")
_MATCHUP = re.compile(r"^[A-Z]{2,3}@[A-Z]{2,3}$")
_HEADER = re.compile(r"^(Injury Report:|Page \d+ of \d+)")
_COLUMNS = {"Game Date", "Game Time", "Matchup", "Team", "Player Name", "Current Status", "Reason"}
NOT_SUBMITTED = "NOT YET SUBMITTED"


@dataclass
class InjuryReport:
    published_et: str
    entries: List[Dict[str, Any]] = field(default_factory=list)
    not_submitted: set = field(default_factory=set)  # (matchup, team abbreviation)

    def for_matchup(self, away: str, home: str) -> List[Dict[str, Any]]:
        return [e for e in self.entries if e["matchup"] == f"{away}@{home}"]

    def submitted(self, away: str, home: str, team: str) -> bool:
        """True when the team filed its report (even an empty one is not listed, so absence of the
        marker is treated as filed)."""
        return (f"{away}@{home}", team) not in self.not_submitted


def parse_report(pdf_text: str) -> InjuryReport:
    """Parse the text layer of the report (page header and column labels are skipped)."""
    lines = [l.strip() for l in pdf_text.splitlines() if l.strip()]
    published = ""
    body = []
    for l in lines:
        if l.startswith("Injury Report:"):
            published = l.split(":", 1)[1].strip()
        if _HEADER.match(l) or l in _COLUMNS:
            continue
        body.append(l)

    report = InjuryReport(published_et=published)
    game_date = game_time = matchup = team = None
    i = 0
    while i < len(body):
        l = body[i]
        nxt = body[i + 1] if i + 1 < len(body) else ""
        if _DATE.match(l):
            game_date = l
        elif _TIME.match(l):
            game_time = l
        elif _MATCHUP.match(l):
            matchup = l
        elif l in TEAM_ABBR:
            team = l
        elif l == NOT_SUBMITTED:
            if matchup and team:
                report.not_submitted.add((matchup, TEAM_ABBR[team]))
        elif nxt in STATUSES and "," in l and matchup and team:
            reason = []
            j = i + 2
            while j < len(body) and not _is_structural(body, j):
                reason.append(body[j])
                j += 1
            report.entries.append({
                "game_date": game_date, "game_time": game_time, "matchup": matchup,
                "team": TEAM_ABBR[team], "player_name": _display_name(l), "status": nxt,
                "reason": " ".join(reason),
            })
            i = j
            continue
        i += 1
    return report


def _is_structural(body: List[str], j: int) -> bool:
    l = body[j]
    nxt = body[j + 1] if j + 1 < len(body) else ""
    return bool(
        _DATE.match(l) or _TIME.match(l) or _MATCHUP.match(l) or l in TEAM_ABBR or l == NOT_SUBMITTED
        or (nxt in STATUSES and "," in l)
    )


def _display_name(raw: str) -> str:
    """'Lively II, Dereck' -> 'Dereck Lively II'."""
    last, _, first = raw.partition(", ")
    return f"{first} {last}".strip()


def _plain(name: str) -> str:
    folded = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z ]", "", folded.lower().replace("-", " ")).strip()


def _get(url: str) -> requests.Response:
    return requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)


def report_urls(season: str) -> List[Tuple[datetime, str]]:
    """All report PDFs linked on the season page, oldest first, with their Eastern publish time."""
    resp = _get(PAGE_URL.format(season=normalize_season(season)))
    resp.raise_for_status()
    found = {}
    for m in PDF_NAME.finditer(resp.text):
        day, hh, mm, ap = m.groups()
        when = datetime.strptime(f"{day} {hh}:{mm} {ap}", "%Y-%m-%d %I:%M %p").replace(tzinfo=ET)
        found[when] = m.group(0)
    return [(w, PDF_URL.replace("Injury-Report_{day}_{hh}_{mm}{ap}.pdf", name)) for w, name in sorted(found.items())]


def latest_report_url(season: str, day: str, as_of: Optional[datetime] = None) -> Optional[Tuple[datetime, str]]:
    """Newest report published on ``day`` (YYYY-MM-DD, Eastern) at or before ``as_of``."""
    as_of = as_of or datetime.now(ET)
    options = [(w, u) for w, u in report_urls(season) if w.strftime("%Y-%m-%d") == day and w <= as_of]
    return options[-1] if options else None


def fetch_report(season: str, day: str, as_of: Optional[datetime] = None) -> Optional[InjuryReport]:
    import pymupdf

    hit = latest_report_url(season, day, as_of)
    if hit is None:
        return None
    resp = _get(hit[1])
    resp.raise_for_status()
    with pymupdf.open(stream=resp.content, filetype="pdf") as doc:
        return parse_report("\n".join(page.get_text() for page in doc))


def _previous_season(season: str) -> str:
    start = int(normalize_season(season)[:4]) - 1
    return f"{start}-{str(start + 1)[2:]}"


def _player_index(season: str) -> Dict[Tuple[str, str], int]:
    """(team, plain name) -> player id from this and the previous season's box scores; the latest team wins."""
    index: Dict[Tuple[str, str], int] = {}
    for yr in (_previous_season(season), season):
        path = Path(get_data_paths(yr).player_games_raw)
        if not path.exists():
            continue
        df = pd.read_csv(path, usecols=["Player_ID", "PLAYER_NAME", "MATCHUP", "GAME_DATE"]).sort_values("GAME_DATE")
        df["team"] = df["MATCHUP"].str.split(" ").str[0]
        for r in df.itertuples():
            index[(r.team, _plain(r.PLAYER_NAME))] = int(r.Player_ID)
    return index


def to_overrides(entries: Iterable[Dict[str, Any]], season: str) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Model overrides for the report entries, and the names that could not be matched to a player id."""
    index = _player_index(season)
    overrides, unmatched = [], []
    for e in entries:
        pid = index.get((e["team"], _plain(e["player_name"])))
        if pid is None:
            # No box score yet (rookie, two-way, new arrival): still matched by name downstream.
            unmatched.append(f"{e['player_name']} ({e['team']})")
        overrides.append({
            "player_id": pid, "player_name": e["player_name"], "status": STATUS_LABEL[e["status"]],
            "status_factor": STATUS_FACTOR[e["status"]],
        })
    return overrides, unmatched
