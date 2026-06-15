from __future__ import annotations

from scripts.db.db_utils import connect


def main() -> int:
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute("DROP TABLE IF EXISTS raw.data_file_rows")
            cur.execute("DELETE FROM meta.data_coverage WHERE coverage = 'file_rows'")
        conn.commit()
    print("Dropped generic raw.data_file_rows import table. PBP and mart tables were left untouched.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
