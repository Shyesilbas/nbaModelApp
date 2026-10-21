"""CLI entry point: fetch and cache NBA play-by-play. The logic lives in `src/processing/build_play_by_play.py`."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.processing.build_play_by_play import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
