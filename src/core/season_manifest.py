from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

from src.core.season_utils import normalize_season, season_to_file_token

ROOT = Path(__file__).resolve().parents[2]


def build_season_manifest(season: str, command: str, artifacts: Dict[str, Any]) -> Dict[str, Any]:
    normalized = normalize_season(season)
    token = season_to_file_token(normalized)
    return {
        "season": normalized,
        "season_token": token,
        "command": command,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "artifacts": artifacts,
    }


def write_season_manifest(season: str, command: str, artifacts: Dict[str, Any]) -> Path:
    normalized = normalize_season(season)
    out_dir = ROOT / "data" / f"season={normalized}"
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "manifest.json"
    manifest = build_season_manifest(normalized, command, artifacts)
    path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return path
