"""CLI entry point: season and model evaluation reports. The logic lives in `src/evaluation/generate_report.py`."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.evaluation.generate_report import main  # noqa: E402

if __name__ == "__main__":
    main()
