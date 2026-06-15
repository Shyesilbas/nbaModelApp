from __future__ import annotations

import os
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/secondhand"


def get_database_url() -> str:
    return os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL)


def connect() -> psycopg.Connection:
    return psycopg.connect(get_database_url())


def season_from_path(path: Path) -> str | None:
    for part in path.parts:
        if part.startswith("season="):
            return part.split("=", 1)[1]
    return None


def season_from_game_id(game_id: str) -> str | None:
    if len(game_id) < 5 or not game_id.startswith("00"):
        return None
    try:
        start_year = 2000 + int(game_id[3:5])
    except ValueError:
        return None
    return f"{start_year}-{str(start_year + 1)[-2:]}"


def relative_path(path: Path) -> str:
    return str(path.resolve().relative_to(ROOT))
