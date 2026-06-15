from __future__ import annotations

import argparse

from scripts.db.db_utils import connect


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Print PostgreSQL row counts for imported NBA data.")
    parser.add_argument("--season", help="Optional season filter, e.g. 2024-25.")
    return parser.parse_args()


def count(cur, sql: str, params: tuple = ()) -> int:
    cur.execute(sql, params)
    return int(cur.fetchone()[0])


def main() -> int:
    args = parse_args()
    season_filter = "WHERE season = %s" if args.season else ""
    params = (args.season,) if args.season else ()

    with connect() as conn:
        with conn.cursor() as cur:
            counts = {
                "mart.dataset_rows": count(cur, f"SELECT count(*) FROM mart.dataset_rows {season_filter}", params),
                "raw.play_by_play_payloads": count(cur, f"SELECT count(*) FROM raw.play_by_play_payloads {season_filter}", params),
                "raw.play_by_play_events": count(cur, f"SELECT count(*) FROM raw.play_by_play_events {season_filter}", params),
                "raw.quarter_scores": count(cur, f"SELECT count(*) FROM raw.quarter_scores {season_filter}", params),
                "meta.season_manifests": count(
                    cur,
                    "SELECT count(*) FROM meta.season_manifests WHERE season = %s" if args.season else "SELECT count(*) FROM meta.season_manifests",
                    params,
                ),
            }

            print("Row counts")
            for table, value in counts.items():
                print(f"  {table}: {value}")

            print("\nImported mart datasets")
            cur.execute(
                f"""
                SELECT season, dataset, count(*) AS rows
                FROM mart.dataset_rows
                {season_filter}
                GROUP BY season, dataset
                ORDER BY season, dataset
                """,
                params,
            )
            for row in cur.fetchall():
                print(f"  {row[0]} mart.{row[1]}: {row[2]}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
