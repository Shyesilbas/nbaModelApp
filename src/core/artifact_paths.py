from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict

ROOT = Path(__file__).resolve().parents[2]
PRODUCTION_MANIFEST = ROOT / "config" / "production_artifacts.yaml"


def _parse_scalar(value: str) -> Any:
    value = value.strip()
    if not value:
        return ""
    if value.startswith('"') and value.endswith('"'):
        return value[1:-1]
    if value.startswith("'") and value.endswith("'"):
        return value[1:-1]
    if value in {"true", "false"}:
        return value == "true"
    return value


def load_production_manifest() -> Dict[str, Any]:
    if not PRODUCTION_MANIFEST.exists():
        return {}
    try:
        import yaml  # type: ignore

        with open(PRODUCTION_MANIFEST, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        return data if isinstance(data, dict) else {}
    except Exception:
        current_section = None
        data: Dict[str, Dict[str, Any]] = {}
        for raw_line in PRODUCTION_MANIFEST.read_text(encoding="utf-8").splitlines():
            line = raw_line.rstrip()
            if not line or line.lstrip().startswith("#"):
                continue
            if not line.startswith(" "):
                if line.endswith(":"):
                    current_section = line[:-1]
                    data[current_section] = {}
                elif ":" in line:
                    key, value = line.split(":", 1)
                    data[key.strip()] = _parse_scalar(value)
                    current_section = None
                continue
            if current_section is None or ":" not in line:
                continue
            key, value = line.strip().split(":", 1)
            data[current_section][key] = _parse_scalar(value)
        return data


def production_release() -> str | None:
    """Release of the production models (e.g. "v11"); artifact file names carry no version."""
    release = load_production_manifest().get("release")
    return release if isinstance(release, str) and release else None


def resolve_artifact_path(section: str, key: str, fallback: str) -> Path:
    manifest = load_production_manifest()
    section_data = manifest.get(section, {})
    value = section_data.get(key)
    # Backtests and season replays point every model artifact at another directory
    # (e.g. the holdout copies) without editing the manifest the live service reads.
    model_dir = os.environ.get("NBA_MODEL_DIR")
    relative = value if isinstance(value, str) and value else fallback
    if model_dir and relative.startswith("models/"):
        base = Path(model_dir)
        return (base if base.is_absolute() else ROOT / base) / Path(relative).name
    if isinstance(value, str) and value:
        candidate = ROOT / value
        if candidate.exists():
            return candidate
    return ROOT / fallback
