import json
import logging
import sqlite3
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIR = ROOT / "data" / "frontend"
DB_PATH = FRONTEND_DIR / "nba_frontend.db"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def _norm_game_id(value) -> str:
    text = str(value or "").strip()
    if "." in text:
        text = text.split(".", 1)[0]
    digits = "".join(ch for ch in text if ch.isdigit())
    return digits.zfill(10)


def build_frontend_db() -> None:
    t_start = time.time()
    logger.info("Starting build of nba_frontend.db at %s", DB_PATH)

    if DB_PATH.exists():
        DB_PATH.unlink()

    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA page_size=4096;")
    cursor = conn.cursor()

    # 1. Create tables
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS game_details (
            game_id TEXT PRIMARY KEY,
            data_json TEXT NOT NULL
        );
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS team_boxscores (
            game_id TEXT NOT NULL,
            season TEXT NOT NULL,
            data_json TEXT NOT NULL
        );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tb_game_season ON team_boxscores(game_id, season);")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS player_boxscores (
            game_id TEXT NOT NULL,
            player_id INTEGER,
            season TEXT NOT NULL,
            data_json TEXT NOT NULL
        );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pb_game_season ON player_boxscores(game_id, season);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pb_player ON player_boxscores(player_id);")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS player_history (
            player_id TEXT PRIMARY KEY,
            games_json TEXT NOT NULL,
            averages_json TEXT NOT NULL
        );
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS games_index (
            season TEXT NOT NULL,
            game_id TEXT NOT NULL,
            data_json TEXT NOT NULL,
            PRIMARY KEY (season, game_id)
        );
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS team_rosters (
            season TEXT NOT NULL,
            data_json TEXT NOT NULL,
            PRIMARY KEY (season)
        );
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS static_files (
            filename TEXT PRIMARY KEY,
            data_json TEXT NOT NULL
        );
    """)

    # 2. Ingest game_details.json
    gd_file = FRONTEND_DIR / "game_details.json"
    if gd_file.exists():
        logger.info("Ingesting %s...", gd_file.name)
        with open(gd_file, "r", encoding="utf-8") as f:
            raw = json.load(f)
        if isinstance(raw, list):
            rows = [(_norm_game_id(r.get("game_id") or r.get("GAME_ID")), json.dumps(r)) for r in raw]
            cursor.executemany("INSERT OR REPLACE INTO game_details VALUES (?, ?)", rows)
            logger.info("Ingested %d game_details rows.", len(rows))

    # 3. Ingest team_boxscores*.json
    for p in FRONTEND_DIR.glob("team_boxscores*.json"):
        if p.name == "team_boxscores.json":
            season = "2025-26"
        elif "_" in p.stem:
            season = p.stem.removeprefix("team_boxscores_")
        else:
            season = "2025-26"
        logger.info("Ingesting %s (season=%s)...", p.name, season)
        with open(p, "r", encoding="utf-8") as f:
            raw = json.load(f)
        if isinstance(raw, list):
            rows = [(_norm_game_id(r.get("GAME_ID")), season, json.dumps(r)) for r in raw]
            cursor.executemany("INSERT INTO team_boxscores VALUES (?, ?, ?)", rows)
            logger.info("Ingested %d rows from %s.", len(rows), p.name)

    # 4. Ingest player_boxscores*.json
    for p in FRONTEND_DIR.glob("player_boxscores*.json"):
        if p.name == "player_boxscores.json":
            season = "2025-26"
        elif "_" in p.stem:
            season = p.stem.removeprefix("player_boxscores_")
        else:
            season = "2025-26"
        logger.info("Ingesting %s (season=%s)...", p.name, season)
        with open(p, "r", encoding="utf-8") as f:
            raw = json.load(f)
        if isinstance(raw, list):
            rows = []
            for r in raw:
                gid = _norm_game_id(r.get("GAME_ID"))
                pid = r.get("PLAYER_ID")
                try:
                    pid = int(pid) if pid is not None else None
                except (ValueError, TypeError):
                    pid = None
                rows.append((gid, pid, season, json.dumps(r)))
            cursor.executemany("INSERT INTO player_boxscores VALUES (?, ?, ?, ?)", rows)
            logger.info("Ingested %d rows from %s.", len(rows), p.name)

    # 5. Ingest player_history (player_season_games.json + player_season_averages.json)
    psg_file = FRONTEND_DIR / "player_season_games.json"
    psa_file = FRONTEND_DIR / "player_season_averages.json"
    if psg_file.exists() or psa_file.exists():
        logger.info("Ingesting player_history from %s and %s...", psg_file.name, psa_file.name)
        games_dict = {}
        if psg_file.exists():
            with open(psg_file, "r", encoding="utf-8") as f:
                games_dict = json.load(f)
        averages_dict = {}
        if psa_file.exists():
            with open(psa_file, "r", encoding="utf-8") as f:
                averages_dict = json.load(f)

        all_pids = set(games_dict.keys()) | set(averages_dict.keys())
        hist_rows = [
            (str(pid), json.dumps(games_dict.get(str(pid), {})), json.dumps(averages_dict.get(str(pid), {})))
            for pid in all_pids
        ]
        cursor.executemany("INSERT OR REPLACE INTO player_history VALUES (?, ?, ?)", hist_rows)
        logger.info("Ingested %d player_history profiles.", len(hist_rows))

    # 6. Ingest games.json and all_seasons_games.json
    games_file = FRONTEND_DIR / "games.json"
    if games_file.exists():
        logger.info("Ingesting %s...", games_file.name)
        with open(games_file, "r", encoding="utf-8") as f:
            games_raw = json.load(f)
        if isinstance(games_raw, list):
            rows = [("2025-26", _norm_game_id(r.get("GAME_ID") or r.get("game_id")), json.dumps(r)) for r in games_raw]
            cursor.executemany("INSERT OR REPLACE INTO games_index VALUES (?, ?, ?)", rows)

    all_games_file = FRONTEND_DIR / "all_seasons_games.json"
    if all_games_file.exists():
        logger.info("Ingesting %s...", all_games_file.name)
        with open(all_games_file, "r", encoding="utf-8") as f:
            all_raw = json.load(f)
        if isinstance(all_raw, list):
            rows = [(r.get("SEASON", "unknown"), _norm_game_id(r.get("GAME_ID") or r.get("game_id")), json.dumps(r)) for r in all_raw]
            cursor.executemany("INSERT OR REPLACE INTO games_index VALUES (?, ?, ?)", rows)

    # 7. Ingest team_rosters
    rosters_file = FRONTEND_DIR / "team_rosters.json"
    if rosters_file.exists():
        with open(rosters_file, "r", encoding="utf-8") as f:
            cursor.execute("INSERT OR REPLACE INTO team_rosters VALUES (?, ?)", ("2025-26", f.read()))

    for r_csv in ROOT.glob("data/season=*/analysis/team_rosters.csv"):
        season = r_csv.parent.parent.name.split("=")[1]
        try:
            import pandas as pd
            df = pd.read_csv(r_csv)
            cursor.execute("INSERT OR REPLACE INTO team_rosters VALUES (?, ?)", (season, df.to_json(orient="records")))
        except Exception:
            pass

    # 8. Ingest small generic files into static_files
    for filename in [
        "schedule.json", "manifest.json", "dataset_summary.json",
        "highlights.json", "upcoming_games_context.json", "core_players.json",
        "player_profiles.json", "player_name_lookup.json", "seasons.json"
    ]:
        p = FRONTEND_DIR / filename
        if p.exists():
            cursor.execute("INSERT OR REPLACE INTO static_files VALUES (?, ?)", (filename, p.read_text(encoding="utf-8")))

    conn.commit()
    conn.execute("VACUUM;")
    conn.close()

    elapsed = time.time() - t_start
    db_sz_mb = DB_PATH.stat().st_size / (1024 * 1024)
    logger.info("Successfully built %s in %.2fs. Size: %.2f MB", DB_PATH.name, elapsed, db_sz_mb)


if __name__ == "__main__":
    build_frontend_db()
