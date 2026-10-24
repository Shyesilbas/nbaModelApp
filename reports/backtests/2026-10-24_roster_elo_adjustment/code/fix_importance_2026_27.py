"""One-off: recompute IMPORTANCE_SCORE of the 2026-27 bootstrap roster files with the standard formula.

The files were generated on 2026-10-04 with an older formula (AST x1.5, REB x1.2 instead of x0.8 / x0.6);
every other season uses 0.5 MIN + PTS + 0.8 AST + 0.6 REB. Also re-ranks core_players.csv within each team.
"""
from pathlib import Path

import pandas as pd

A = Path(__file__).resolve().parents[4] / "data/season=2026-27/analysis"


def importance(d):
    return (d.AVG_MIN * 0.5 + d.AVG_PTS + d.AVG_AST * 0.8 + d.AVG_REB * 0.6).round(2)


rosters = pd.read_csv(A / "team_rosters.csv")
rosters["IMPORTANCE_SCORE"] = importance(rosters)
rosters.to_csv(A / "team_rosters.csv", index=False)

live = pd.read_csv(A / "team_rosters_live.csv")
live["IMPORTANCE_SCORE"] = importance(live)
live.to_csv(A / "team_rosters_live.csv", index=False)

core = pd.read_csv(A / "core_players.csv")
core = core.drop(columns="IMPORTANCE_SCORE").merge(
    rosters[["TEAM_ABBREVIATION", "PLAYER_ID", "IMPORTANCE_SCORE"]], on=["TEAM_ABBREVIATION", "PLAYER_ID"], how="left"
)
core = core.sort_values(["TEAM_ABBREVIATION", "IMPORTANCE_SCORE"], ascending=[True, False], kind="stable")
core["CORE_RANK"] = core.groupby("TEAM_ABBREVIATION").cumcount() + 1
core["IS_TOP3_CORE"] = core["CORE_RANK"] <= 3
core["IS_TOP5_CORE"] = core["CORE_RANK"] <= 5
core[["TEAM_ABBREVIATION", "PLAYER_ID", "PLAYER_NAME", "IMPORTANCE_SCORE", "CORE_RANK", "IS_TOP3_CORE", "IS_TOP5_CORE"]].to_csv(
    A / "core_players.csv", index=False
)
print("rosters", len(rosters), "live", len(live), "core", len(core))
