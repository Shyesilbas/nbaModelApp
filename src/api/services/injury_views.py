from datetime import datetime
from typing import Any, Dict, Optional

from src.core.season_utils import get_default_season, normalize_season
from src.ingestion.nba_injury_report import ET

from .auto_status import cached_report
from .injury_history import changes_for_game, read_history


def _today() -> str:
    return datetime.now(ET).strftime("%Y-%m-%d")


def injury_report_payload(season: Optional[str], date: Optional[str]) -> Dict[str, Any]:
    """Injury report entries for one game day: today and later from the latest live report,
    earlier days from the stored history. `error` says why nothing could be read."""
    s = normalize_season(season or get_default_season())
    today = _today()
    d = date or today
    if d < today:
        rows = read_history(s)
        rows = rows[rows["game_date"] == d]
        entries = [{"team": r.team, "player_name": r.player_name, "status": r.status, "reason": r.reason}
                   for r in rows.itertuples()]
        return {"published_et": rows["report_time_et"].iloc[0] if len(rows) else None, "date": d,
                "entries": entries, "not_submitted": [], "error": None if entries else "No stored report for this day"}
    report = cached_report(s, today)
    if report is None:
        return {"published_et": None, "date": d, "entries": [], "not_submitted": [],
                "error": "Official injury report could not be read"}
    mmddyyyy = datetime.strptime(d, "%Y-%m-%d").strftime("%m/%d/%Y")
    return {
        "published_et": report.published_et,
        "date": d,
        "entries": [e for e in report.entries if e["game_date"] == mmddyyyy],
        "not_submitted": [list(x) for x in report.not_submitted],
        "error": None,
    }


def injury_changes_payload(season: Optional[str], home: str, away: str, date: str) -> Dict[str, Any]:
    """Status changes of the two teams' players across today's reports, for the prediction screen."""
    season_key = normalize_season(season or get_default_season())
    report = cached_report(season_key, _today())
    away_u, home_u = away.upper(), home.upper()
    summary = None
    if report:
        mmddyyyy = datetime.strptime(date, "%Y-%m-%d").strftime("%m/%d/%Y")
        entries = [e for e in report.for_matchup(away_u, home_u) if e["game_date"] == mmddyyyy]
        summary = {
            "published_et": report.published_et,
            "submitted": {away_u: report.submitted(away_u, home_u, away_u),
                          home_u: report.submitted(away_u, home_u, home_u)},
            "players": [{k: e[k] for k in ("team", "player_name", "status", "reason")} for e in entries],
        }
    return {"published_et": report.published_et if report else None, "report": summary,
            "changes": changes_for_game(season_key, date, away_u, home_u)}
