"""Refresh the frontend views of the in-progress season.

Steps:
  1. Build analysis/team_rosters_live.csv (bootstrap roster + regular-season stats + moves).
  2. Rebuild the season's frontend store and the global store (data/frontend_store/).
     Closed seasons are never touched.

Usage:
  PYTHONPATH=. python3 scripts/refresh_current_season_views.py --season 2026-27
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.season_utils import get_default_season, normalize_season  # noqa: E402


def refresh_current_season_views(season: str | None = None) -> None:
    from src.analysis.live_roster_refresh import build_live_roster
    from src.frontend_store.builders import build_frontend_store

    season = normalize_season(season or get_default_season())
    build_live_roster(season)
    build_frontend_store([season])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--season", default=None)
    args = parser.parse_args()
    refresh_current_season_views(args.season)


if __name__ == "__main__":
    main()
