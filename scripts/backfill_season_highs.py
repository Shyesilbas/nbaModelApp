"""Add the `season_highs` doc to already built season stores without a full rebuild."""
from __future__ import annotations

from src.frontend_store.season_highs import backfill_season_highs
from src.frontend_store.store import stored_seasons


def main() -> None:
    for season in stored_seasons():
        print(f"{season}: {'ok' if backfill_season_highs(season) else 'missing store'}")


if __name__ == "__main__":
    main()
