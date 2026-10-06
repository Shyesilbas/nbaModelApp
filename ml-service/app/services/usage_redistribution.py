from typing import Dict, List, Optional, Tuple, Any
import numpy as np
import pandas as pd


POSITION_AFFINITY: Dict[str, Dict[str, float]] = {
    "GUARD": {"GUARD": 1.0, "WING": 0.5, "BIG": 0.1},
    "WING": {"GUARD": 0.5, "WING": 1.0, "BIG": 0.5},
    "BIG": {"GUARD": 0.1, "WING": 0.5, "BIG": 1.0},
}


def _normalize_position(pos: Any) -> str:
    pos_str = str(pos).strip().upper() if pd.notna(pos) else "WING"
    if "GUARD" in pos_str or pos_str in {"G", "PG", "SG"}:
        return "GUARD"
    if "BIG" in pos_str or pos_str in {"C", "PF", "CENTER", "FORWARD-CENTER"}:
        return "BIG"
    return "WING"


def redistribute_usage_and_minutes(
    roster_df: pd.DataFrame,
    override_lookup: Dict[Any, Dict[str, Any]],
    target_team_minutes: float = 240.0,
    minute_elasticity: float = 0.85,
    is_preseason: bool = False,
) -> pd.DataFrame:
    df = roster_df.copy()

    if len(df) == 0:
        return df

    if "PLAYER_POSITION_GROUP" in df.columns:
        df["POS_CLEAN"] = df["PLAYER_POSITION_GROUP"].apply(_normalize_position)
    elif "POSITION_GROUP" in df.columns:
        df["POS_CLEAN"] = df["POSITION_GROUP"].apply(_normalize_position)
    else:
        df["POS_CLEAN"] = "WING"

    if "MIN_EMA_10" in df.columns:
        df["BASE_MIN"] = pd.to_numeric(df["MIN_EMA_10"], errors="coerce").fillna(0.0)
    elif "MIN_LAST_5" in df.columns:
        df["BASE_MIN"] = pd.to_numeric(df["MIN_LAST_5"], errors="coerce").fillna(0.0)
    elif "MIN" in df.columns:
        df["BASE_MIN"] = pd.to_numeric(df["MIN"], errors="coerce").fillna(0.0)
    else:
        df["BASE_MIN"] = 0.0

    if "USG_PCT_LAST_10" in df.columns:
        df["BASE_USG"] = pd.to_numeric(df["USG_PCT_LAST_10"], errors="coerce").fillna(16.0)
    elif "USG_PCT" in df.columns:
        df["BASE_USG"] = pd.to_numeric(df["USG_PCT"], errors="coerce").fillna(16.0)
    else:
        df["BASE_USG"] = 16.0

    df["STATUS"] = "ACTIVE"
    df["STATUS_FACTOR"] = 1.0
    df["MINUTE_LIMIT"] = None
    df["HAS_USER_OVERRIDE"] = False

    for idx, row in df.iterrows():
        pid = row.get("PLAYER_ID")
        pname = str(row.get("PLAYER_NAME", "")).strip().lower()
        entry = None
        if pd.notna(pid):
            try:
                entry = override_lookup.get(int(pid))
            except (ValueError, TypeError):
                entry = None
        if entry is None and pname:
            entry = override_lookup.get(pname)

        if entry is not None:
            df.at[idx, "HAS_USER_OVERRIDE"] = True
            df.at[idx, "STATUS"] = str(entry.get("status", "ACTIVE")).upper()
            df.at[idx, "STATUS_FACTOR"] = float(entry.get("factor", 1.0))
            df.at[idx, "MINUTE_LIMIT"] = entry.get("minute_limit")

    teams = df["TEAM_ABBREVIATION"].unique() if "TEAM_ABBREVIATION" in df.columns else [None]
    max_active_rotation = 12 if is_preseason else 10
    preseason_starters_cap = 22.0

    df["PROJ_MIN"] = 0.0

    for team in teams:
        team_mask = (df["TEAM_ABBREVIATION"] == team) if team is not None else pd.Series(True, index=df.index)
        team_indices = df[team_mask].index

        # Mark explicit OUT players
        for idx in team_indices:
            status = df.at[idx, "STATUS"]
            factor = df.at[idx, "STATUS_FACTOR"]
            if status == "OUT" or factor <= 0.0:
                df.at[idx, "STATUS"] = "OUT"
                df.at[idx, "STATUS_FACTOR"] = 0.0
                df.at[idx, "PROJ_MIN"] = 0.0

        # Sort eligible (non-OUT) players to form active rotation
        eligible_indices = [idx for idx in team_indices if df.at[idx, "STATUS"] != "OUT"]

        def rotation_priority(idx):
            has_override = 1 if df.at[idx, "HAS_USER_OVERRIDE"] else 0
            base_m = float(df.at[idx, "BASE_MIN"])
            raw_p = float(df.at[idx, "RAW_PROJ_PTS"]) if "RAW_PROJ_PTS" in df.columns else 0.0
            return (has_override, base_m, raw_p)

        eligible_sorted = sorted(eligible_indices, key=rotation_priority, reverse=True)
        active_indices = eligible_sorted[:max_active_rotation]
        dnp_indices = eligible_sorted[max_active_rotation:]

        for idx in dnp_indices:
            if not df.at[idx, "HAS_USER_OVERRIDE"]:
                df.at[idx, "STATUS"] = "DNP"
                df.at[idx, "STATUS_FACTOR"] = 0.0
                df.at[idx, "PROJ_MIN"] = 0.0
            else:
                active_indices.append(idx)

        # Baseline minutes for active rotation
        for idx in active_indices:
            b_min = max(6.0, float(df.at[idx, "BASE_MIN"]))
            factor = float(df.at[idx, "STATUS_FACTOR"])
            min_limit = df.at[idx, "MINUTE_LIMIT"]

            if min_limit is not None and pd.notna(min_limit):
                df.at[idx, "PROJ_MIN"] = min(b_min, float(min_limit))
            elif is_preseason:
                if b_min >= 24.0:
                    scaled = min(preseason_starters_cap, b_min * 0.62)
                elif b_min >= 15.0:
                    scaled = min(20.0, b_min * 0.80)
                else:
                    scaled = min(18.0, b_min)
                df.at[idx, "PROJ_MIN"] = scaled * factor
            else:
                df.at[idx, "PROJ_MIN"] = b_min * factor

        # Redistribute minutes from players who have explicit OUT or RESTRICTED user overrides
        out_players = [
            idx for idx in team_indices
            if df.at[idx, "HAS_USER_OVERRIDE"] and (df.at[idx, "STATUS"] == "OUT" or df.at[idx, "STATUS_FACTOR"] < 1.0)
        ]
        lost_minutes = 0.0
        pos_weights = {"GUARD": 0.0, "WING": 0.0, "BIG": 0.0}

        for o_idx in out_players:
            lost_m = max(0.0, float(df.at[o_idx, "BASE_MIN"]) - float(df.at[o_idx, "PROJ_MIN"]))
            lost_minutes += lost_m
            o_pos = df.at[o_idx, "POS_CLEAN"]
            for p in ["GUARD", "WING", "BIG"]:
                pos_weights[p] += lost_m * POSITION_AFFINITY.get(o_pos, {}).get(p, 0.33)

        total_weight = sum(pos_weights.values())
        if lost_minutes > 0 and len(active_indices) > 0 and total_weight > 0:
            for p in pos_weights:
                pos_weights[p] /= total_weight

            redistrib_weights = {}
            for a_idx in active_indices:
                a_pos = df.at[a_idx, "POS_CLEAN"]
                a_base_min = float(df.at[a_idx, "BASE_MIN"])
                cur_min = float(df.at[a_idx, "PROJ_MIN"])
                cap_limit = 22.0 if is_preseason else 38.0
                cap = max(0.0, cap_limit - cur_min)
                weight = pos_weights.get(a_pos, 0.33) * np.sqrt(max(1.0, a_base_min)) * np.sqrt(max(0.1, cap))
                redistrib_weights[a_idx] = weight

            w_sum = sum(redistrib_weights.values())
            if w_sum > 0:
                for a_idx, w in redistrib_weights.items():
                    add_min = lost_minutes * (w / w_sum)
                    cur_min = float(df.at[a_idx, "PROJ_MIN"])
                    cap_limit = 22.0 if is_preseason else 38.0
                    df.at[a_idx, "PROJ_MIN"] = min(cap_limit, cur_min + add_min)

        # Scale active rotation minutes to exactly target_team_minutes (240.0)
        active_mins_sum = sum(df.at[idx, "PROJ_MIN"] for idx in active_indices)
        if active_mins_sum > 0:
            scale_factor = target_team_minutes / active_mins_sum
            upper_min_bound = 22.0 if is_preseason else 38.0
            lower_min_bound = 5.0
            for idx in active_indices:
                cur_m = df.at[idx, "PROJ_MIN"] * scale_factor
                df.at[idx, "PROJ_MIN"] = max(lower_min_bound, min(upper_min_bound, cur_m))

            rem_diff = target_team_minutes - sum(df.at[idx, "PROJ_MIN"] for idx in active_indices)
            if abs(rem_diff) > 0.05:
                headroom_idxs = [idx for idx in active_indices if df.at[idx, "PROJ_MIN"] < upper_min_bound]
                if headroom_idxs:
                    add_each = rem_diff / len(headroom_idxs)
                    for h_idx in headroom_idxs:
                        df.at[h_idx, "PROJ_MIN"] = max(lower_min_bound, min(upper_min_bound, df.at[h_idx, "PROJ_MIN"] + add_each))

    base_raw_pts = df["RAW_PROJ_PTS"].copy() if "RAW_PROJ_PTS" in df.columns else pd.Series(0.0, index=df.index)
    base_raw_reb = df["RAW_PROJ_REB"].copy() if "RAW_PROJ_REB" in df.columns else pd.Series(0.0, index=df.index)
    base_raw_ast = df["RAW_PROJ_AST"].copy() if "RAW_PROJ_AST" in df.columns else pd.Series(0.0, index=df.index)

    min_ratio = (df["PROJ_MIN"] / df["BASE_MIN"].clip(lower=4.0)).fillna(1.0)
    stat_elasticity = np.power(min_ratio.clip(lower=0.0, upper=3.0), minute_elasticity)

    scaled_pts = base_raw_pts * stat_elasticity
    scaled_reb = base_raw_reb * stat_elasticity
    scaled_ast = base_raw_ast * stat_elasticity

    for idx in df.index:
        if df.at[idx, "STATUS"] in ("OUT", "DNP") or df.at[idx, "STATUS_FACTOR"] <= 0.0 or df.at[idx, "PROJ_MIN"] <= 0.0:
            scaled_pts.at[idx] = 0.0
            scaled_reb.at[idx] = 0.0
            scaled_ast.at[idx] = 0.0

    df["RAW_PROJ_PTS"] = scaled_pts
    df["RAW_PROJ_REB"] = scaled_reb
    df["RAW_PROJ_AST"] = scaled_ast

    # Redistribute lost usage only from players who have explicit OUT/restricted user overrides
    for team in teams:
        team_mask = (df["TEAM_ABBREVIATION"] == team) if team is not None else pd.Series(True, index=df.index)
        override_out_mask = team_mask & (df["HAS_USER_OVERRIDE"]) & ((df["STATUS"] == "OUT") | (df["STATUS_FACTOR"] < 1.0))
        active_mask = team_mask & (df["STATUS"].isin(["ACTIVE", "RESTRICTED"])) & (df["PROJ_MIN"] > 0.0)

        if not override_out_mask.any() or not active_mask.any():
            continue

        lost_pts = max(0.0, float(base_raw_pts[override_out_mask].sum() - df.loc[override_out_mask, "RAW_PROJ_PTS"].sum()))
        lost_reb = max(0.0, float(base_raw_reb[override_out_mask].sum() - df.loc[override_out_mask, "RAW_PROJ_REB"].sum()))
        lost_ast = max(0.0, float(base_raw_ast[override_out_mask].sum() - df.loc[override_out_mask, "RAW_PROJ_AST"].sum()))

        if lost_pts > 0:
            pts_redistrib_pool = lost_pts * 0.70
            active_usg = df.loc[active_mask, "BASE_USG"].clip(lower=5.0)
            active_min = df.loc[active_mask, "PROJ_MIN"].clip(lower=1.0)
            scoring_weights = active_usg * np.sqrt(active_min)
            w_pts_sum = scoring_weights.sum()
            if w_pts_sum > 0:
                shares = scoring_weights / w_pts_sum
                df.loc[active_mask, "RAW_PROJ_PTS"] += pts_redistrib_pool * shares

        if lost_reb > 0:
            reb_redistrib_pool = lost_reb * 0.60
            reb_pos_weights = df.loc[active_mask, "POS_CLEAN"].map({"BIG": 1.0, "WING": 0.5, "GUARD": 0.15}).fillna(0.3)
            reb_weights = reb_pos_weights * df.loc[active_mask, "RAW_PROJ_REB"].clip(lower=1.0)
            w_reb_sum = reb_weights.sum()
            if w_reb_sum > 0:
                shares = reb_weights / w_reb_sum
                df.loc[active_mask, "RAW_PROJ_REB"] += reb_redistrib_pool * shares

        if lost_ast > 0:
            ast_redistrib_pool = lost_ast * 0.60
            ast_pos_weights = df.loc[active_mask, "POS_CLEAN"].map({"GUARD": 1.0, "WING": 0.45, "BIG": 0.15}).fillna(0.3)
            ast_weights = ast_pos_weights * df.loc[active_mask, "RAW_PROJ_AST"].clip(lower=0.5)
            w_ast_sum = ast_weights.sum()
            if w_ast_sum > 0:
                shares = ast_weights / w_ast_sum
                df.loc[active_mask, "RAW_PROJ_AST"] += ast_redistrib_pool * shares


    df["RAW_PROJ_PTS"] = df["RAW_PROJ_PTS"].clip(lower=0.0, upper=55.0).round(1)
    df["RAW_PROJ_REB"] = df["RAW_PROJ_REB"].clip(lower=0.0, upper=25.0).round(1)
    df["RAW_PROJ_AST"] = df["RAW_PROJ_AST"].clip(lower=0.0, upper=22.0).round(1)
    df["PROJ_MIN"] = df["PROJ_MIN"].clip(lower=0.0, upper=44.0).round(1)

    return df
