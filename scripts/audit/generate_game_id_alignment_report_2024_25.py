"""
Generate a markdown report with exact GAME_ID alignment stats and samples for 2024-25.

Writes: reports/audits/game_id_alignment_2024_25_report.md

This script uses the validate_2024_25_game_id_alignment module to compute sets and
then summarizes intersections and mismatches.
"""
from __future__ import annotations

from pathlib import Path
from typing import Dict, Set

ROOT = Path(__file__).resolve().parents[2]
import sys
sys.path.append(str(ROOT))
from scripts.audit.validate_2024_25_game_id_alignment import validate_alignment, _resolve_paths


def _sample(s: Set[str], n: int = 10):
    return list(sorted(s))[: n]


def main(season: str = "2024-25"):
    ok, sets = validate_alignment(season)
    paths = _resolve_paths(season)

    feat_union = (sets.get("team_features", set()) | sets.get("player_features", set()))
    results = sets.get("game_results", set())
    box_union = sets.get("raw_team_boxscores", set()) | sets.get("raw_player_boxscores", set())
    games_union = sets.get("raw_team_games", set()) | sets.get("raw_player_games", set())

    inter_feat_results = feat_union & results
    only_in_feat = feat_union - results
    only_in_results = results - feat_union

    inter_box_results = box_union & results
    inter_games_results = games_union & results

    report = []
    report.append("# 2024-25 GAME_ID Alignment Report")
    report.append("")
    report.append("## Sources")
    for k, p in paths.items():
        report.append(f"- {k}: `{p}`")

    report.append("")
    report.append("## Set Sizes")
    for k in ["raw_team_games", "raw_player_games", "raw_team_boxscores", "raw_player_boxscores", "team_features", "player_features", "game_results"]:
        s = sets.get(k, set())
        report.append(f"- {k}: {len(s):,} unique GAME_IDs")

    report.append("")
    report.append("## Intersections")
    report.append(f"- Intersection(features, game_results): {len(inter_feat_results):,}")
    report.append(f"- Intersection(boxscores, game_results): {len(inter_box_results):,}")
    report.append(f"- Intersection(raw games, game_results): {len(inter_games_results):,}")

    report.append("")
    report.append("## Mismatch Samples (up to 10)")
    report.append("### Present in features but missing in game_results")
    report.append(f"Count: {len(only_in_feat):,}")
    report.append(f"Sample: { _sample(only_in_feat, 10) }")
    report.append("")
    report.append("### Present in game_results but missing in features")
    report.append(f"Count: {len(only_in_results):,}")
    report.append(f"Sample: { _sample(only_in_results, 10) }")

    report.append("")
    report.append("## Verdict")
    report.append("- Alignment OK: {}".format("YES" if ok else "NO"))

    out_path = ROOT / "reports/audits/game_id_alignment_2024_25_report.md"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(report))
    print(f"Saved report to: {out_path}")


if __name__ == "__main__":
    main()
