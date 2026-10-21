"""CLI entry point: rebuild the season-scoped team model-ready datasets. The logic lives in `src/processing/rebuild_training_data.py`."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.processing.rebuild_training_data import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
