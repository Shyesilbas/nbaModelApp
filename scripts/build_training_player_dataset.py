from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.processing.player_dataset_builder import build_player_dataset_v4
from src.training.training_manifest import load_training_manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Build manifest-scoped PLAYER training dataset.")
    parser.add_argument("--manifest", type=str, default=str(ROOT / "config/training_manifest.yaml"))
    parser.add_argument("--include-validation-season", action="store_true", help="Include manifest validation_season in the generated player dataset.")
    parser.add_argument("--output", type=str, default=str(ROOT / "data/experimental/player_model_ready_v4_usg.csv"))
    args = parser.parse_args()

    manifest = load_training_manifest(args.manifest, root=ROOT, validate_player_coverage=False)
    seasons = list(manifest.modeling_seasons)
    if args.include_validation_season and manifest.validation_season not in seasons:
        seasons.append(manifest.validation_season)

    print("Building PLAYER training dataset")
    print(f"Manifest: {manifest.path}")
    print(f"Seasons:  {', '.join(seasons)}")
    print(f"Output:   {args.output}")

    df = build_player_dataset_v4(seasons=seasons, output_path=Path(args.output))
    coverage = sorted(df["SEASON_ID"].dropna().astype(int).unique().tolist()) if "SEASON_ID" in df.columns else []
    print(f"Rows:     {len(df)}")
    print(f"SEASON_ID coverage: {coverage}")


if __name__ == "__main__":
    main()
