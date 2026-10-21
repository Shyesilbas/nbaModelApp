from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]

# The first listed official position is the player's primary one; F-C/C-F are hybrid bigs.
EXPECTED_GROUP = {"G": "GUARD", "G-F": "GUARD", "F": "WING", "F-G": "WING", "F-C": "BIG", "C-F": "BIG", "C": "BIG"}


def test_position_group_follows_primary_official_position():
    meta = pd.read_csv(ROOT / "data/reference/player_metadata.csv", usecols=["OFFICIAL_POSITION", "POSITION_GROUP"]).dropna()

    wrong = meta[meta["OFFICIAL_POSITION"].map(EXPECTED_GROUP) != meta["POSITION_GROUP"]]

    assert wrong.empty, wrong.drop_duplicates().to_string()
