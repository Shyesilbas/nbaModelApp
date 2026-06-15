from __future__ import annotations

import argparse
from pathlib import Path

from scripts.db.db_utils import ROOT, connect


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Apply PostgreSQL schema files from db/schema.")
    parser.add_argument("--schema-dir", default=str(ROOT / "db" / "schema"))
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    schema_dir = Path(args.schema_dir)
    files = sorted(schema_dir.glob("*.sql"))
    if not files:
        raise FileNotFoundError(f"No SQL files found under {schema_dir}")

    with connect() as conn:
        with conn.cursor() as cur:
            for path in files:
                sql = path.read_text(encoding="utf-8")
                cur.execute(sql)
                print(f"applied {path}")
        conn.commit()

    print(f"Done. applied={len(files)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
