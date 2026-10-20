"""SQLite files that hold everything the frontend reads.

One file per season (``data/frontend_store/season_YYYY_YY.db``) plus a small
``global.db`` for cross-season views (player profiles, seasons list, trades).
A closed season's file is built once and never rewritten; the active season's
file is rebuilt after each data update.

Files are always built into a temp file and swapped in with ``os.replace``, so
the API never reads a half-written database.
"""
from __future__ import annotations

import json
import os
import sqlite3
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Optional

ROOT = Path(__file__).resolve().parents[2]
STORE_DIR = Path(os.environ.get("FRONTEND_STORE_DIR", ROOT / "data" / "frontend_store"))

# Bump when the schema or the builders change, so closed seasons get rebuilt once.
STORE_VERSION = "2"

SEASON_SCHEMA = """
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE docs (name TEXT PRIMARY KEY, data_json TEXT NOT NULL);
CREATE TABLE games (game_id TEXT PRIMARY KEY, game_date TEXT, data_json TEXT NOT NULL);
CREATE TABLE game_details (game_id TEXT PRIMARY KEY, data_json TEXT NOT NULL);
CREATE TABLE team_boxscores (game_id TEXT NOT NULL, data_json TEXT NOT NULL);
CREATE INDEX idx_team_boxscores_game ON team_boxscores(game_id);
CREATE TABLE player_boxscores (game_id TEXT NOT NULL, player_id INTEGER, data_json TEXT NOT NULL);
CREATE INDEX idx_player_boxscores_game ON player_boxscores(game_id);
CREATE TABLE player_games (player_id TEXT PRIMARY KEY, games_json TEXT NOT NULL, averages_json TEXT NOT NULL);
CREATE TABLE pbp_moments (game_id TEXT PRIMARY KEY, data_json TEXT NOT NULL);
"""

GLOBAL_SCHEMA = """
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE docs (name TEXT PRIMARY KEY, data_json TEXT NOT NULL);
"""


def season_token(season: str) -> str:
    return season.replace("-", "_")


def season_db_path(season: str) -> Path:
    return STORE_DIR / f"season_{season_token(season)}.db"


def global_db_path() -> Path:
    return STORE_DIR / "global.db"


def stored_seasons() -> list[str]:
    seasons = []
    for path in sorted(STORE_DIR.glob("season_*.db")):
        token = path.stem.removeprefix("season_")
        seasons.append(f"{token[:4]}-{token[5:]}")
    return seasons


def dumps(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), allow_nan=False, default=str)


@contextmanager
def build_db(path: Path, schema: str) -> Iterator[sqlite3.Connection]:
    """Yield a connection to a fresh database that replaces ``path`` on success."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    os.close(fd)
    conn = sqlite3.connect(tmp)
    try:
        conn.executescript(schema)
        yield conn
        conn.commit()
        conn.execute("VACUUM")
        conn.close()
        os.chmod(tmp, 0o644)  # mkstemp creates 0600
        os.replace(tmp, path)
    except BaseException:
        conn.close()
        if os.path.exists(tmp):
            os.remove(tmp)
        raise


def connect_ro(path: Path) -> Optional[sqlite3.Connection]:
    if not path.exists():
        return None
    return sqlite3.connect(f"file:{path.resolve()}?mode=ro", uri=True)


def read_meta(path: Path) -> dict[str, str]:
    conn = connect_ro(path)
    if conn is None:
        return {}
    try:
        return dict(conn.execute("SELECT key, value FROM meta").fetchall())
    except sqlite3.Error:
        return {}
    finally:
        conn.close()


def read_doc(conn: sqlite3.Connection, name: str, default: Any = None) -> Any:
    row = conn.execute("SELECT data_json FROM docs WHERE name = ?", (name,)).fetchone()
    return json.loads(row[0]) if row else default
