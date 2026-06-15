from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run_step(cmd: list[str]) -> None:
    print(f"\n$ {' '.join(cmd)}")
    subprocess.run(cmd, cwd=ROOT, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the manifest-scoped training workflow end to end.")
    parser.add_argument("--manifest", type=str, default=str(ROOT / "config/training_manifest.yaml"))
    parser.add_argument("--dry-run", action="store_true", help="Train and evaluate without promotion.")
    parser.add_argument("--skip-player-dataset-rebuild", action="store_true", help="Use the existing player_model_ready_v4_usg.csv.")
    args = parser.parse_args()

    py = sys.executable
    if not args.skip_player_dataset_rebuild:
        run_step([
            py,
            "scripts/build_training_player_dataset.py",
            "--manifest",
            args.manifest,
            "--include-validation-season",
        ])

    retrain_cmd = [py, "scripts/retrain_pipeline.py", "--manifest", args.manifest]
    if args.dry_run:
        retrain_cmd.append("--dry-run")
    run_step(retrain_cmd)


if __name__ == "__main__":
    main()
