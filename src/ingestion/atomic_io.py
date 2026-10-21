"""Crash-safe writes for ingestion outputs.

Raw files are rewritten in full on every update (read, append, dedupe, write). A plain
``to_csv`` interrupted halfway leaves a truncated file that the next run reads as the
source of truth. These helpers write to a temp file in the same directory and swap it in
with ``os.replace``, which is atomic, so readers see either the old file or the new one.
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Callable

import pandas as pd


def _atomic_write(path, write: Callable[[str], None]) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    os.close(fd)
    try:
        write(tmp)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise


def write_csv_atomic(df: pd.DataFrame, path, **kwargs) -> None:
    kwargs.setdefault("index", False)
    _atomic_write(path, lambda tmp: df.to_csv(tmp, **kwargs))


def write_text_atomic(text: str, path) -> None:
    def write(tmp: str) -> None:
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(text)

    _atomic_write(path, write)
