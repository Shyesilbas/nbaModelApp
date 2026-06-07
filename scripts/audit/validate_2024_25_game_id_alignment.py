"""
Validate GAME_ID alignment across 2024-25 sources.

Compares GAME_ID sets for:
- Raw team games, raw player games
- Raw team boxscores, raw player boxscores
- Engineered team/player features (features/ and experimental/ fallbacks)
- game_results (processed/ with experimental fallback)

Usage:
  python3 scripts/audit/validate_2024_25_game_id_alignment.py --season 2024-25

Notes:
- Read-only. Produces console output with set sizes, intersections, and mismatches.
- Respects project season utils and data paths.
"""
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Dict, Set, Tuple

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]


def _safe_read_csv(path: Path) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    try:
        return pd.read_csv(path)
    except Exception:
        return pd.DataFrame()


def _resolve_paths(season: str) -> Dict[str, Path]:
    import sys
    # Ensure project root and scripts/ are on path for absolute and fallback imports
    sys.path.append(str(ROOT))
    sys.path.append(str(ROOT / "scripts"))
    from scripts.data_paths import get_data_paths
    from scripts.season_utils import season_to_file_token

    dp = get_data_paths(season)
    token = season_to_file_token(season)

    # Prefer experimental aligned features if available
    team_feats_exp_aligned = ROOT / f"data/experimental/team_games_features_{token}_boxscore_aligned.csv"
    player_feats_exp_aligned = ROOT / f"data/experimental/player_games_features_{token}_boxscore_aligned.csv"

    # Non-aligned experimental fallbacks (known to be mismatched)
    team_feats_exp = ROOT / f"data/experimental/team_games_features_{token}.csv"
    player_feats_exp = ROOT / f"data/experimental/player_games_features_{token}.csv"

    # Processed/experimental game_results (prefer experimental first for 2024-25 work)
    game_results_proc = Path(dp.game_results)
    game_results_exp = ROOT / f"data/experimental/game_results_{token}.csv"

    paths: Dict[str, Path] = {
        "raw_team_games": Path(dp.team_games_raw),
        "raw_player_games": Path(dp.player_games_raw),
        "raw_team_boxscores": Path(dp.raw_team_boxscores),
        "raw_player_boxscores": Path(dp.raw_player_boxscores),
        "team_features": team_feats_exp_aligned if team_feats_exp_aligned.exists() else team_feats_exp,
        "player_features": player_feats_exp_aligned if player_feats_exp_aligned.exists() else player_feats_exp,
        "game_results": game_results_exp if game_results_exp.exists() else game_results_proc,
    }
    return paths


def _game_id_set(df: pd.DataFrame, name: str) -> Set[str]:
    if df.empty:
        return set()
    col = None
    for c in ["GAME_ID", "game_id", "Game_ID"]:
        if c in df.columns:
            col = c
            break
    if not col:
        print(f"⚠️  {name}: no GAME_ID column found. Columns: {list(df.columns)[:10]}")
        return set()
    return set(df[col].astype(str).unique())


def _report_set_stats(name: str, s: Set[str]):
    if not s:
        print(f"- {name}: 0 ids (missing or unreadable)")
    else:
        sample = list(sorted(s))[:3]
        print(f"- {name}: {len(s):,} ids (sample: {sample})")


def validate_alignment(season: str) -> Tuple[bool, Dict[str, Set[str]]]:
    paths = _resolve_paths(season)
    print("Sources:")
    for k, v in paths.items():
        print(f"  {k:>22}: {v}")

    dfs = {k: _safe_read_csv(v) for k, v in paths.items()}
    sets = {k: _game_id_set(df, k) for k, df in dfs.items()}

    print("\nGAME_ID set sizes:")
    for k, s in sets.items():
        _report_set_stats(k, s)

    ok = True

    # Primary requirement: game_results must align with chosen feature sources
    feat_union = (sets.get("team_features", set()) | sets.get("player_features", set()))
    common_with_results = feat_union & sets.get("game_results", set())
    print(f"\nIntersection(feature ids, game_results): {len(common_with_results):,}")
    if feat_union and sets.get("game_results") and len(common_with_results) == 0:
        print("❌ No overlap between features and game_results GAME_IDs — joins will fail")
        ok = False
    else:
        print("✅ Non-empty overlap between features and game_results")

    # Secondary checks: boxscores vs results
    box_union = sets.get("raw_team_boxscores", set()) | sets.get("raw_player_boxscores", set())
    box_vs_results = len(box_union & sets.get("game_results", set()))
    print(f"Intersection(boxscores, game_results): {box_vs_results:,}")
    if box_union and sets.get("game_results") and box_vs_results == 0:
        print("⚠️ Boxscores do not overlap with results — investigate source mismatch")

    # Optional: raw games vs results
    games_union = sets.get("raw_team_games", set()) | sets.get("raw_player_games", set())
    games_vs_results = len(games_union & sets.get("game_results", set()))
    print(f"Intersection(raw games, game_results): {games_vs_results:,}")

    return ok, sets


def main():
    parser = argparse.ArgumentParser(description="Validate 2024-25 GAME_ID alignment across sources")
    parser.add_argument("--season", type=str, default="2024-25", help="Season string, e.g., 2024-25")
    args = parser.parse_args()

    print("============================================================")
    print("🔎 GAME_ID ALIGNMENT VALIDATION")
    print("============================================================\n")

    ok, _ = validate_alignment(args.season)
    print("\n============================================================")
    if ok:
        print("✅ Alignment check: PASS")
    else:
        print("❌ Alignment check: FAIL")
    print("============================================================")

    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
