#!/usr/bin/env python3
"""Build a static archive pack from the existing frontend data archive.

This is intended for the "historical data should be read statically" workflow.
It copies the prepared frontend archive data into a deployment folder and
rewrites the seasons manifest from the available season directories.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.season_utils import discover_seasons
from scripts.export_play_by_play_moments import build_moments_pack


def _copy_tree(src: Path, dst: Path) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)


def _write_seasons(out_dir: Path) -> None:
    seasons = sorted(discover_seasons().keys())
    (out_dir / "seasons.json").write_text(json.dumps(seasons, indent=2), encoding="utf-8")


def _write_manifest(out_dir: Path) -> None:
    files: dict[str, dict[str, object]] = {}
    for path in sorted(out_dir.glob("*.json")):
        if path.name == "manifest.json":
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        files[path.name] = {
            "path": f"/data/{path.name}",
            "size_bytes": path.stat().st_size,
            "sha256": digest,
        }

    manifest = {
        "season": "archive",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "version": hashlib.sha256(
            json.dumps(files, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()[:16],
        "files": files,
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def build_archive_pack(out_dir: Path) -> None:
    source = REPO_ROOT / "data" / "frontend"
    if not source.exists():
        raise FileNotFoundError("data/frontend archive is missing")

    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    _copy_tree(source, out_dir)
    build_moments_pack(REPO_ROOT / "data", out_dir / "play_by_play_moments")
    _write_seasons(out_dir)
    _write_manifest(out_dir)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a static historical archive pack.")
    parser.add_argument(
        "--out-dir",
        default=str(REPO_ROOT / ".deploy" / "archive-pack" / "data"),
        help="Output directory for the archive data bundle.",
    )
    args = parser.parse_args()

    out_dir = Path(args.out_dir).resolve()
    build_archive_pack(out_dir)
    print(f"Archive pack written to {out_dir}")


if __name__ == "__main__":
    main()
