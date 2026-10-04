from __future__ import annotations

import hashlib
import importlib.metadata
import subprocess
import sys
from pathlib import Path
from typing import Iterable


def sha256_file(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_training_provenance(
    *,
    root: str | Path,
    input_files: Iterable[str | Path],
    feature_contract_path: str | Path,
    manifest_path: str | Path | None = None,
    trainer_path: str | Path | None = None,
    artifact_paths: Iterable[str | Path] = (),
) -> dict:
    """Return stable identities for the inputs and outputs of a model run."""
    root = Path(root).resolve()

    def record(path: str | Path) -> dict:
        resolved = Path(path).resolve()
        return {
            "path": str(resolved.relative_to(root)) if resolved.is_relative_to(root) else str(resolved),
            "sha256": sha256_file(resolved),
            "bytes": resolved.stat().st_size,
        }

    try:
        code_revision = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=root, check=True,
            capture_output=True, text=True,
        ).stdout.strip()
    except Exception:
        code_revision = None

    result = {
        "code_revision": code_revision,
        "python_version": sys.version.split()[0],
        "packages": {},
        "feature_contract": record(feature_contract_path),
        "input_snapshots": [record(path) for path in input_files if Path(path).is_file()],
    }
    for package in ("numpy", "pandas", "scikit-learn", "xgboost", "lightgbm"):
        try:
            result["packages"][package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            result["packages"][package] = None
    if manifest_path and Path(manifest_path).is_file():
        result["training_manifest"] = record(manifest_path)
    if trainer_path and Path(trainer_path).is_file():
        result["trainer_source"] = record(trainer_path)
    result["artifacts"] = [record(path) for path in artifact_paths if Path(path).is_file()]
    return result
