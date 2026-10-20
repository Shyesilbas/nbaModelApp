"""Build the SQLite store the API serves frontend data from (data/frontend_store/).

Closed seasons (Finals decided) are built once and then skipped; the active season and the
global store are rebuilt on every run.

Usage:
  PYTHONPATH=. python3 scripts/build_frontend_store.py                    # every season + global
  PYTHONPATH=. python3 scripts/build_frontend_store.py --season 2026-27   # one season + global
  PYTHONPATH=. python3 scripts/build_frontend_store.py --force            # rebuild sealed seasons too
"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.frontend_store.builders import build_frontend_store  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--season", action="append", help="Season to build (repeatable). Default: all.")
    parser.add_argument("--force", action="store_true", help="Rebuild closed seasons even if sealed.")
    args = parser.parse_args()
    build_frontend_store(args.season, force=args.force)


if __name__ == "__main__":
    main()
