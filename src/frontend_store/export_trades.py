"""Trade board data: grouped trades plus non-rostered moves (waived/signed/claimed), newest first."""
import re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
TEAM_ABBR_BY_ID = {
    1610612737: "ATL", 1610612738: "BOS", 1610612751: "BKN", 1610612766: "CHA", 1610612741: "CHI",
    1610612739: "CLE", 1610612742: "DAL", 1610612743: "DEN", 1610612765: "DET", 1610612744: "GSW",
    1610612745: "HOU", 1610612754: "IND", 1610612746: "LAC", 1610612747: "LAL", 1610612763: "MEM",
    1610612748: "MIA", 1610612749: "MIL", 1610612750: "MIN", 1610612740: "NOP", 1610612752: "NYK",
    1610612760: "OKC", 1610612753: "ORL", 1610612755: "PHI", 1610612756: "PHX", 1610612757: "POR",
    1610612758: "SAC", 1610612759: "SAS", 1610612761: "TOR", 1610612762: "UTA", 1610612764: "WAS",
}
DESC = re.compile(r"^.+? received (?:(\S+) )?(.+?) from .+?\.$")


def _impact_by_player() -> dict:
    """Latest-season importance score per player (later seasons overwrite earlier ones)."""
    out = {}
    for f in sorted((ROOT / "data").glob("season=*/analysis/team_rosters.csv")):
        r = pd.read_csv(f).groupby("PLAYER_ID").IMPORTANCE_SCORE.max()
        out.update(r.round(1).to_dict())
    return out


def _moves(impact: dict) -> list:
    seen, moves = set(), []
    for f in sorted((ROOT / "data").glob("season=*/analysis/multi_team_players.csv")):
        d = pd.read_csv(f)
        for r in d[d.MOVE_TYPE == "Non-rostered"].itertuples():
            key = (int(r.PLAYER_ID), str(r.TRADE_DATE))
            if key in seen:
                continue
            seen.add(key)
            moves.append({
                "kind": "move", "id": f"move-{key[0]}-{key[1]}", "date": key[1],
                "player": {"id": key[0], "name": r.PLAYER_NAME, "impact": impact.get(key[0])},
                "teams": r.TEAMS_PLAYED_FOR, "how": r.HOW_ACQUIRED,
            })
    return moves


def build_trades() -> list:
    df = pd.read_csv(ROOT / "data" / "reference" / "player_movement.csv")
    df = df[df.Transaction_Type == "Trade"]
    impact = _impact_by_player()
    trades = []
    for group, g in df.groupby("GroupSort"):
        sides = {}
        for r in g.itertuples():
            team = TEAM_ABBR_BY_ID.get(int(r.TEAM_ID))
            src = TEAM_ABBR_BY_ID.get(int(r.Additional_Sort))
            if not team:
                continue
            side = sides.setdefault(team, {"team": team, "from": [], "players": [], "assets": []})
            if src and src not in side["from"]:
                side["from"].append(src)
            if int(r.PLAYER_ID):
                m = DESC.match(r.TRANSACTION_DESCRIPTION)
                pos, name = (m.group(1), m.group(2)) if m else (None, r.PLAYER_SLUG)
                side["players"].append({"id": int(r.PLAYER_ID), "name": name, "pos": pos, "impact": impact.get(int(r.PLAYER_ID))})
            else:
                asset = r.TRANSACTION_DESCRIPTION.split(" received ", 1)[-1].split(" from ")[0]
                side["assets"].append(asset)
        if len(sides) >= 2:
            trades.append({"kind": "trade", "id": group, "date": str(g.TRANSACTION_DATE.iloc[0]), "sides": list(sides.values())})
    trades += _moves(impact)
    trades.sort(key=lambda t: (t["date"], t["id"]), reverse=True)
    return trades


if __name__ == "__main__":
    print(f"{len(build_trades())} trades")
