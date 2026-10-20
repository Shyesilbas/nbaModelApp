from __future__ import annotations

import argparse
from datetime import date, datetime
from pathlib import Path
from typing import Any

import pandas as pd
from psycopg.types.json import Jsonb

from scripts.db.db_utils import ROOT, connect, relative_path

DATASETS = {
    "game_results": "processed/game_results.parquet",
    "team_games": "raw/team_games.parquet",
    "player_games": "raw/player_games.parquet",
    "team_boxscores": "raw/boxscores/team_boxscores.parquet",
    "player_boxscores": "raw/boxscores/player_boxscores.parquet",
    "team_features": "features/team_features.parquet",
    "player_features": "features/player_features.parquet",
    "team_model_ready_v2": "processed/team_model_ready_v2.parquet",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import selected Parquet datasets into mart.dataset_rows.")
    target = parser.add_mutually_exclusive_group()
    target.add_argument("--season", help="Import one season, e.g. 2024-25.")
    target.add_argument("--all", action="store_true", help="Import all season partitions.")
    parser.add_argument("--dataset", choices=sorted(DATASETS), action="append", help="Restrict to one or more datasets.")
    parser.add_argument("--data-root", default=str(ROOT / "data"))
    parser.add_argument("--batch-size", type=int, default=1000)
    return parser.parse_args()


def clean_value(value: Any) -> Any:
    if pd.isna(value):
        return None
    if isinstance(value, (datetime, date, pd.Timestamp)):
        return value.isoformat()
    if hasattr(value, "item"):
        item = value.item()
        if isinstance(item, (datetime, date)):
            return item.isoformat()
        return item
    return value


def clean_record(record: dict[str, Any]) -> dict[str, Any]:
    return {str(key): clean_value(value) for key, value in record.items()}


def first_value(record: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = record.get(key)
        if value is not None and value != "":
            return value
    return None


def as_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def as_date(value: Any) -> date | None:
    if value is None:
        return None
    try:
        return pd.to_datetime(value).date()
    except Exception:
        return None


def season_dirs(data_root: Path, season: str | None) -> list[Path]:
    if season:
        return [data_root / f"season={season}"]
    return sorted(data_root.glob("season=*"))


def import_dataset(conn, season: str, dataset: str, path: Path, batch_size: int) -> int:
    # Some updaters rewrite only the CSV; never import a parquet copy older than it.
    csv = path.with_suffix(".csv")
    if csv.exists() and (not path.exists() or csv.stat().st_mtime_ns > path.stat().st_mtime_ns):
        df = pd.read_csv(csv, dtype={c: str for c in ("GAME_ID", "Game_ID", "game_id")})
    else:
        df = pd.read_parquet(path)
    source_path = relative_path(path)
    records = [clean_record(record) for record in df.to_dict(orient="records")]

    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM mart.dataset_rows WHERE dataset = %s AND source_path = %s",
            (dataset, source_path),
        )
        for start in range(0, len(records), batch_size):
            values = []
            for row_number, record in enumerate(records[start : start + batch_size], start=start + 1):
                game_id = first_value(record, "GAME_ID", "Game_ID", "game_id")
                team_id = as_int(first_value(record, "TEAM_ID", "Team_ID", "team_id"))
                team = first_value(record, "TEAM_ABBREVIATION", "team_abbreviation")
                player_id = as_int(first_value(record, "PLAYER_ID", "Player_ID", "player_id"))
                player_name = first_value(record, "PLAYER_NAME", "Player_Name", "player_name")
                game_date = as_date(first_value(record, "GAME_DATE", "Game_Date", "game_date"))
                values.append(
                    (
                        season,
                        dataset,
                        source_path,
                        row_number,
                        str(game_id).zfill(10) if game_id is not None else None,
                        game_date,
                        team_id,
                        team,
                        player_id,
                        player_name,
                        Jsonb(record),
                    )
                )
            cur.executemany(
                """
                INSERT INTO mart.dataset_rows (
                    season, dataset, source_path, row_number, game_id, game_date,
                    team_id, team_abbreviation, player_id, player_name, row_data
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (dataset, source_path, row_number)
                DO UPDATE SET
                    season = EXCLUDED.season,
                    game_id = EXCLUDED.game_id,
                    game_date = EXCLUDED.game_date,
                    team_id = EXCLUDED.team_id,
                    team_abbreviation = EXCLUDED.team_abbreviation,
                    player_id = EXCLUDED.player_id,
                    player_name = EXCLUDED.player_name,
                    row_data = EXCLUDED.row_data,
                    imported_at = now()
                """,
                values,
            )
    return len(records)


def main() -> int:
    args = parse_args()
    data_root = Path(args.data_root)
    requested = args.dataset or sorted(DATASETS)
    target_season = None if args.all else (args.season or "2024-25")

    total_rows = 0
    total_files = 0
    with connect() as conn:
        for season_dir in season_dirs(data_root, target_season):
            if not season_dir.exists():
                continue
            season = season_dir.name.split("=", 1)[1]
            for dataset in requested:
                path = season_dir / DATASETS[dataset]
                if not path.exists():
                    continue
                rows = import_dataset(conn, season, dataset, path, args.batch_size)
                conn.commit()
                total_rows += rows
                total_files += 1
                print(f"imported mart.{dataset:<20} {rows:>7} rows from {relative_path(path)}")

    print(f"Done. files={total_files} rows={total_rows}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
