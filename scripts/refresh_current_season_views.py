"""CLI entry point: refresh the live roster and the season's frontend store. The logic lives in `src/orchestration/refresh_current_season_views.py`."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.orchestration.refresh_current_season_views import main  # noqa: E402

if __name__ == "__main__":
    main()
