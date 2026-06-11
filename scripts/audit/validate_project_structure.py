from __future__ import annotations

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from scripts.artifact_paths import load_production_manifest


def _check(path: Path, errors: list[str]) -> None:
    if not path.exists():
        errors.append(f"Missing: {path}")


def main() -> int:
    errors: list[str] = []
    manifest = load_production_manifest()
    if not manifest:
        errors.append("Production manifest missing or unreadable: config/production_artifacts.yaml")
    else:
        for section_name, section in manifest.items():
            if not isinstance(section, dict):
                continue
            for key, value in section.items():
                if key in {"status", "notes"}:
                    continue
                if isinstance(value, str) and value.startswith("models/production/") is False and key.endswith("_path"):
                    errors.append(f"{section_name}.{key} points outside production: {value}")
                candidate = ROOT / value if isinstance(value, str) else None
                if candidate is not None:
                    _check(candidate, errors)

    required = [
        ROOT / "models/production/win_probability_model.pkl",
        ROOT / "models/production/feature_columns.json",
        ROOT / "models/production/model_metadata.json",
        ROOT / "models/production/score_model_v3_home_rtg.pkl",
        ROOT / "models/production/score_model_v3_away_rtg.pkl",
        ROOT / "models/production/score_model_v3_pace.pkl",
        ROOT / "models/production/score_model_v3_margin.pkl",
        ROOT / "models/production/score_model_v3_metadata.json",
        ROOT / "data/production/core_players.csv",
    ]
    for path in required:
        _check(path, errors)

    if errors:
        print(json.dumps({"status": "fail", "errors": errors}, indent=2))
        return 1
    print(json.dumps({"status": "pass", "checked": len(required)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
