from __future__ import annotations

from typing import Any, Dict, Optional
import pandas as pd
import numpy as np


def parse_game_id_metadata(game_id: Any) -> Dict[str, Optional[Any]]:
    """
    Deterministically decodes official NBA 10-digit GAME_ID into season context,
    playoff round, and series game number.
    
    Structure:
      Digits 0-2:
        002: Regular Season
        005: Play-In Tournament
        004: Playoffs
      If Playoffs (004):
        Digit 7 (Round):
          1: First Round
          2: Conference Semifinals
          3: Conference Finals
          4: NBA Finals
        Digits 8-9: Game number in series (1 to 7)
    """
    if pd.isna(game_id):
        return {
            "SEASON_TYPE": "Regular Season",
            "IS_PLAYOFF": False,
            "PLAYOFF_ROUND": None,
            "SERIES_GAME_NUMBER": None
        }
        
    gid_str = str(game_id).split(".")[0].strip().zfill(10)
    prefix = gid_str[:3]
    
    if prefix == "002":
        return {
            "SEASON_TYPE": "Regular Season",
            "IS_PLAYOFF": False,
            "PLAYOFF_ROUND": None,
            "SERIES_GAME_NUMBER": None
        }
    elif prefix == "005":
        return {
            "SEASON_TYPE": "PlayIn",
            "IS_PLAYOFF": True,
            "PLAYOFF_ROUND": "Play-In",
            "SERIES_GAME_NUMBER": 1
        }
    elif prefix == "004":
        round_char = gid_str[7] if len(gid_str) > 7 else "1"
        round_map = {
            "1": "First Round",
            "2": "Conference Semifinals",
            "3": "Conference Finals",
            "4": "NBA Finals"
        }
        playoff_round = round_map.get(round_char, "Playoffs")
        season_type = "NBA Finals" if round_char == "4" else "Playoffs"
        
        game_num_str = gid_str[8:10] if len(gid_str) >= 10 else ""
        series_game_number = int(game_num_str) if game_num_str.isdigit() and int(game_num_str) > 0 else None
        
        return {
            "SEASON_TYPE": season_type,
            "IS_PLAYOFF": True,
            "PLAYOFF_ROUND": playoff_round,
            "SERIES_GAME_NUMBER": series_game_number
        }
    else:
        return {
            "SEASON_TYPE": "Regular Season",
            "IS_PLAYOFF": False,
            "PLAYOFF_ROUND": None,
            "SERIES_GAME_NUMBER": None
        }


def normalize_season_metadata_columns(df: pd.DataFrame, game_id_col: str = "GAME_ID") -> pd.DataFrame:
    """
    Applies deterministic game metadata parsing across a DataFrame.
    Standardizes SEASON_TYPE, IS_PLAYOFF, PLAYOFF_ROUND, and SERIES_GAME_NUMBER.
    """
    if df.empty or game_id_col not in df.columns:
        return df
        
    df = df.copy()
    parsed_metadata = [parse_game_id_metadata(gid) for gid in df[game_id_col]]
    meta_df = pd.DataFrame(parsed_metadata, index=df.index)
    
    for col in ["SEASON_TYPE", "IS_PLAYOFF", "PLAYOFF_ROUND", "SERIES_GAME_NUMBER"]:
        df[col] = meta_df[col]
        
    return df
