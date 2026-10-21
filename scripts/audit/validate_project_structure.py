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
        ROOT / "models/production/win_model.pkl",
        ROOT / "models/production/win_features.json",
        ROOT / "models/production/win_metadata.json",
        ROOT / "models/production/score_model_home_rtg.pkl",
        ROOT / "models/production/score_model_away_rtg.pkl",
        ROOT / "models/production/score_model_pace.pkl",
        ROOT / "models/production/score_model_margin.pkl",
        ROOT / "models/production/score_model_ridge_total.pkl",
        ROOT / "models/production/score_model_ridge_margin.pkl",
        ROOT / "models/production/score_metadata.json",
        ROOT / "models/production/player_model_pts.pkl",
        ROOT / "models/production/player_model_reb.pkl",
        ROOT / "models/production/player_model_ast.pkl",
        ROOT / "models/production/player_features.pkl",
        ROOT / "models/production/player_metadata.json",
        ROOT / "data/production/core_players.csv",
    ]
    for path in required:
        _check(path, errors)

    # One release names all production models; a partial promotion leaves older ones behind.
    warnings: list[str] = []
    release = manifest.get("release") if manifest else None
    if not isinstance(release, str) or not release:
        errors.append("config/production_artifacts.yaml has no top-level `release`")
    else:
        for name in ("win_metadata.json", "score_metadata.json", "player_metadata.json"):
            path = ROOT / "models/production" / name
            if path.exists():
                version = json.loads(path.read_text()).get("version")
                if version != release:
                    warnings.append(f"{name} is release {version}, production manifest says {release}")

    if errors:
        print(json.dumps({"status": "fail", "errors": errors}, indent=2))
        return 1
    print(json.dumps({"status": "pass", "release": release, "checked": len(required), "warnings": warnings}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
