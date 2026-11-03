#!/usr/bin/env python3
"""Rebuild every generated report and the numbers copied into the docs, in one command.

1. Paper ledger report (always; read-only on the ledger).
2. Walk-forward benchmark when it no longer describes the production models (their version or
   training time differs from the benchmark's provenance), or always with ``--walk-forward always``.
3. Walk-forward blocks of docs/reports/models/*.md and the generated blocks of PROJECT_STATUS.md
   and README.md, rendered from the two JSON reports.

Run by scripts/ops/morning.py every day and by scripts/retrain_pipeline.py after a promotion, so
nothing is refreshed by hand. tests/test_docs_consistency.py fails when a block lags its report.

    PYTHONPATH=. python3 scripts/refresh_reports.py [--walk-forward auto|always|never]
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.evaluation.model_doc_blocks import update_model_docs  # noqa: E402
from src.evaluation.status_blocks import WALK_FORWARD_JSON, update_status_docs  # noqa: E402

PROVENANCE_KEYS = (("win", "training_date"), ("score", "updated_at"), ("player", "updated_at"))


def walk_forward_is_stale(root: Path = ROOT) -> bool:
    """True when the saved benchmark was measured on other model artifacts than the ones in production."""
    path = root / WALK_FORWARD_JSON
    if not path.exists():
        return True
    prov = json.loads(path.read_text()).get("provenance", {})
    for family, key in PROVENANCE_KEYS:
        meta_path = root / f"models/production/{family}_metadata.json"
        if not meta_path.exists():
            continue
        meta = json.loads(meta_path.read_text())
        seen = prov.get(family, {})
        if seen.get("version") != meta.get("version") or seen.get("trained_at") != meta.get(key):
            return True
    return False


def run(label: str, command: list[str]) -> bool:
    print(f"\n=== {label} ===", flush=True)
    return subprocess.run(command, cwd=ROOT, env={**os.environ, "PYTHONPATH": str(ROOT)}).returncode == 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--walk-forward", choices=["auto", "always", "never"], default="auto")
    parser.add_argument("--season", default="2026-27")
    args = parser.parse_args()

    ok = run("Paper ledger report", [sys.executable, "scripts/paper_ledger_report.py", "--season", args.season])
    if args.walk_forward == "always" or (args.walk_forward == "auto" and walk_forward_is_stale()):
        ok = run("Walk-forward benchmark", [sys.executable, "scripts/walk_forward_benchmark.py"]) and ok
    else:
        print("\nWalk-forward benchmark is current for the production models; skipped.")

    summary = json.loads((ROOT / WALK_FORWARD_JSON).read_text())
    changed = update_model_docs(summary, ROOT) + update_status_docs(ROOT, args.season)
    for path in changed:
        print(f"Updated: {path.relative_to(ROOT)}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
