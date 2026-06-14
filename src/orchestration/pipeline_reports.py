from __future__ import annotations

import os
from datetime import date
from typing import Dict, List

import pandas as pd


def generate_sync_report(
    season: str,
    token: str,
    raw_team_rows: int,
    raw_player_rows: int,
    feat_team_rows: int,
    feat_player_rows: int,
    team_match: bool,
    player_match: bool,
    team_csv: str,
    player_csv: str,
) -> str:
    report_path = f"reports/operations/pipeline_sync_report_{token}.md"
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    sync_status = "SUCCESS" if team_match and player_match else "MISMATCH"
    with open(report_path, "w") as f:
        f.write(f"# NBA ML Project - Feature Pipeline Sync Report ({season})\n\n")
        f.write(f"> Generated: {date.today()}\n")
        f.write(f"> Sync Status: **{sync_status}**\n\n")
        f.write("## 1. Row Count Verification\n\n")
        f.write("| Dataset Type | Raw Row Count | Feature Row Count | Sync Status |\n")
        f.write("| :--- | :---: | :---: | :---: |\n")
        f.write(f"| Team Games | {raw_team_rows:,} | {feat_team_rows:,} | {'MATCH' if team_match else 'MISMATCH'} |\n")
        f.write(f"| Player Games | {raw_player_rows:,} | {feat_player_rows:,} | {'MATCH' if player_match else 'MISMATCH'} |\n\n")
        f.write("## 2. Storage Paths\n\n")
        f.write(f"- Team Features CSV: `{team_csv}`\n")
        f.write(f"- Player Features CSV: `{player_csv}`\n")
    return report_path


def generate_update_reports(
    today,
    missing_games,
    fetched_games,
    pre_team,
    post_team,
    pre_player,
    post_player,
    post_feat_team,
    post_v2_count,
    pre_status,
    post_status,
    failed_calls,
    rebuilds_ran: bool,
) -> Dict[str, str]:
    os.makedirs("reports/operations", exist_ok=True)
    ingestion_path = "reports/operations/local_ingestion_report.md"
    with open(ingestion_path, "w") as f:
        f.write("# NBA ML Project - Local Data Ingestion Report\n\n")
        f.write(f"> Generated: {today.strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        f.write("## 1. Overview of Ingestion Architecture\n\n")
        f.write("This report describes the local ingestion stack and its schedule / boxscore fetchers.\n")

    update_path = "reports/operations/data_update_report.md"
    with open(update_path, "w") as f:
        f.write("# NBA ML Project - Data Update Report\n\n")
        f.write(f"> Generated: {today.strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"> Freshness Status: **{pre_status} -> {post_status}**\n\n")
        f.write("## 1. Sync Summary\n\n")
        f.write("| Metric | Before Update | After Update | Change |\n")
        f.write("| :--- | :---: | :---: | :---: |\n")
        f.write(f"| Raw Team Rows | {pre_team:,} | {post_team:,} | {post_team - pre_team:+d} |\n")
        f.write(f"| Raw Player Rows | {pre_player:,} | {post_player:,} | {post_player - pre_player:+d} |\n")
        f.write(f"| Team Features Rows | - | {post_feat_team:,} | - |\n")
        f.write(f"| Enhanced V2 Rows | - | {post_v2_count:,} | - |\n")
        f.write(f"| Freshness Status | {pre_status} | {post_status} | - |\n")
        if not rebuilds_ran:
            f.write("\nHeavy rebuilds were skipped for this run.\n")

    return {"ingestion": ingestion_path, "update": update_path}
