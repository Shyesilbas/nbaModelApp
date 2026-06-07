import os
from pathlib import Path
import pandas as pd


ROOT = Path(__file__).resolve().parents[2]


def _ensure_datetime(df: pd.DataFrame, col: str) -> pd.DataFrame:
    if col in df.columns:
        df[col] = pd.to_datetime(df[col], errors="coerce")
    return df


def _validate_dates_range(df: pd.DataFrame, col: str, start: str, end: str) -> tuple[bool, dict]:
    info = {"min": None, "max": None, "within": False}
    if col not in df.columns or df.empty:
        return False, info
    s = pd.to_datetime(start)
    e = pd.to_datetime(end)
    mn = pd.to_datetime(df[col]).min()
    mx = pd.to_datetime(df[col]).max()
    info.update({"min": str(mn.date()) if pd.notna(mn) else None, "max": str(mx.date()) if pd.notna(mx) else None})
    ok = (mn >= s) and (mx <= e)
    info["within"] = bool(ok)
    return bool(ok), info


def _validate_game_id_prefix(df: pd.DataFrame, prefixes: tuple[str, ...]) -> tuple[bool, dict]:
    info = {"total": int(df.shape[0]), "bad": 0, "examples": []}
    if "GAME_ID" not in df.columns or df.empty:
        return False, info
    ids = df["GAME_ID"].astype(str)
    good_mask = ids.str.startswith(prefixes)
    bad = (~good_mask).sum()
    info["bad"] = int(bad)
    if bad:
        info["examples"] = ids[~good_mask].head(10).tolist()
    return bad == 0, info


def _validate_rolling_shift(df: pd.DataFrame, id_col: str, date_col: str, feat_cols: list[str]) -> tuple[bool, dict]:
    # Spot check leakage: for a few groups confirm feature value at t equals aggregation up to t-1
    import numpy as np
    report = {"checked_groups": 0, "mismatches": 0}
    if any(c not in df.columns for c in [id_col, date_col]):
        return False, report
    sample = (
        df[[id_col, date_col] + [c for c in feat_cols if c in df.columns]]
        .dropna(subset=[id_col, date_col])
        .sort_values([id_col, date_col])
    )
    groups = list(sample.groupby(id_col))[:8]
    ok_total = True
    for _, g in groups:
        report["checked_groups"] += 1
        for c in [c for c in feat_cols if c in g.columns]:
            # recompute rolling mean with shift(1) and compare on non-null rows
            recomputed = (
                g[c].shift(1).rolling(window=5, min_periods=1).mean()
                if "LAST_5" in c else
                g[c].shift(1).rolling(window=10, min_periods=1).mean()
                if "LAST_10" in c else g[c]
            )
            mask = g[c].notna() & recomputed.notna()
            if mask.any():
                # allow small float tolerance
                mism = (g.loc[mask, c] - recomputed[mask]).abs() > 1e-6
                if mism.any():
                    report["mismatches"] += int(mism.sum())
                    ok_total = False
    return ok_total, report


def regenerate_and_validate():
    # Strictly use 2024-25 raw sources
    season = "2024-25"

    # Lazy imports to avoid heavy module import at top
    import sys
    sys.path.append(str(ROOT))
    sys.path.append(str(ROOT / "scripts"))
    from src.ingestion.data_loader import load_team_games, load_player_games
    from src.processing.cleaning import clean_dates, sort_team_games, sort_player_games
    from src.features.team_features import build_team_features
    from src.features.player_features import build_player_features
    from scripts.season_utils import season_to_file_token

    token = season_to_file_token(season)

    # Load correct raw data
    df_team_raw = load_team_games(season=season)
    df_player_raw = load_player_games(season=season)

    # Clean/sort
    df_team = sort_team_games(clean_dates(df_team_raw.copy(), "GAME_DATE"))
    df_player = sort_player_games(clean_dates(df_player_raw.copy(), "GAME_DATE"))

    # Build features
    team_feats = build_team_features(df_team)
    player_feats = build_player_features(df_player)

    # Write to experimental only
    out_team_csv = ROOT / f"data/experimental/team_games_features_{token}.csv"
    out_team_pq = ROOT / f"data/experimental/team_games_features_{token}.parquet"
    out_player_csv = ROOT / f"data/experimental/player_games_features_{token}.csv"
    out_player_pq = ROOT / f"data/experimental/player_games_features_{token}.parquet"
    out_team_csv.parent.mkdir(parents=True, exist_ok=True)
    team_feats.to_csv(out_team_csv, index=False)
    player_feats.to_csv(out_player_csv, index=False)
    try:
        team_feats.to_parquet(out_team_pq, index=False)
    except Exception:
        pass
    try:
        player_feats.to_parquet(out_player_pq, index=False)
    except Exception:
        pass

    # Validations
    # 1) Dates within 2024-10-22 → 2025-06-22
    team_ok_dates, team_dates_info = _validate_dates_range(team_feats, "GAME_DATE", "2024-10-22", "2025-06-22")
    player_ok_dates, player_dates_info = _validate_dates_range(player_feats, "GAME_DATE", "2024-10-22", "2025-06-22")

    # 2) GAME_ID prefixes 00224... / 00424...
    team_ok_ids, team_id_info = _validate_game_id_prefix(team_feats, ("00224", "00424"))
    player_ok_ids, player_id_info = _validate_game_id_prefix(player_feats, ("00224", "00424"))

    # 3) Row counts comparable to raw sources (within +/- 2%)
    def _compare_rows(a: int, b: int) -> tuple[bool, float]:
        if max(a, b) == 0:
            return False, 1.0
        diff = abs(a - b) / max(a, b)
        return diff <= 0.02, diff

    team_rows_ok, team_diff = _compare_rows(len(team_feats), len(df_team))
    player_rows_ok, player_diff = _compare_rows(len(player_feats), len(df_player))

    # 4) Leakage-free rolling via shift(1) spot-check
    team_roll_ok, team_roll_info = _validate_rolling_shift(
        team_feats, id_col=("TEAM_ID" if "TEAM_ID" in team_feats.columns else "TEAM_ABBREVIATION"),
        date_col="GAME_DATE",
        feat_cols=[
            "PTS_LAST_5", "PTS_LAST_10",
            "WINRATE_LAST_5", "WINRATE_LAST_10",
            "PTS_ALLOWED_LAST_5", "PTS_ALLOWED_LAST_10",
        ],
    )
    player_roll_ok, player_roll_info = _validate_rolling_shift(
        player_feats, id_col=("Player_ID" if "Player_ID" in player_feats.columns else "PLAYER_NAME"),
        date_col="GAME_DATE",
        feat_cols=[
            "PTS_LAST_5", "PTS_LAST_10", "MIN_LAST_5", "REB_LAST_5", "AST_LAST_5", "PLUS_MINUS_LAST_5",
        ],
    )

    # Write audit report
    report_path = ROOT / "reports/audits/feature_regeneration_2024_25_report.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    lines = []
    lines.append("### 2024-25 Feature Regeneration Report")
    lines.append("")
    lines.append(f"- Team features saved: `{out_team_csv}`")
    lines.append(f"- Player features saved: `{out_player_csv}`")
    lines.append("")
    lines.append("#### Validations")
    lines.append("")
    lines.append(f"- Team dates range: min={team_dates_info['min']} max={team_dates_info['max']} within_expected={team_ok_dates}")
    lines.append(f"- Player dates range: min={player_dates_info['min']} max={player_dates_info['max']} within_expected={player_ok_dates}")
    lines.append(f"- Team GAME_ID prefix check: bad={team_id_info['bad']} of {team_id_info['total']}")
    lines.append(f"- Player GAME_ID prefix check: bad={player_id_info['bad']} of {player_id_info['total']}")
    if team_id_info.get("examples"):
        lines.append(f"  - Team bad examples: {team_id_info['examples']}")
    if player_id_info.get("examples"):
        lines.append(f"  - Player bad examples: {player_id_info['examples']}")
    lines.append(f"- Team row count comparable to raw: {team_rows_ok} (diff={team_diff:.2%})")
    lines.append(f"- Player row count comparable to raw: {player_rows_ok} (diff={player_diff:.2%})")
    lines.append(f"- Team rolling leakage spot-check: {'OK' if team_roll_ok else 'ISSUES'} (mismatches={team_roll_info.get('mismatches', 0)})")
    lines.append(f"- Player rolling leakage spot-check: {'OK' if player_roll_ok else 'ISSUES'} (mismatches={player_roll_info.get('mismatches', 0)})")
    lines.append("")
    lines.append("No production artifacts were modified. All outputs were written under `data/experimental`.\n")
    report_path.write_text("\n".join(lines))


if __name__ == "__main__":
    regenerate_and_validate()
