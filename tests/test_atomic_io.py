import pandas as pd
import pytest

from src.ingestion.atomic_io import write_csv_atomic, write_parquet_atomic


class _Boom(pd.DataFrame):
    def to_csv(self, path, **kwargs):
        with open(path, "w") as f:
            f.write("GAME_ID\n00224")  # half a file, then the process dies
        raise KeyboardInterrupt


def test_interrupted_write_keeps_previous_file(tmp_path):
    path = tmp_path / "team_games.csv"
    write_csv_atomic(pd.DataFrame({"GAME_ID": ["0022400001", "0022400002"]}), path)

    with pytest.raises(KeyboardInterrupt):
        write_csv_atomic(_Boom({"GAME_ID": ["x"]}), path)

    assert pd.read_csv(path, dtype=str)["GAME_ID"].tolist() == ["0022400001", "0022400002"]
    assert [p.name for p in tmp_path.iterdir()] == ["team_games.csv"]  # temp file cleaned up


def test_parquet_round_trip(tmp_path):
    df = pd.DataFrame({"a": [1, 2]})
    write_parquet_atomic(df, tmp_path / "sub" / "x.parquet")
    pd.testing.assert_frame_equal(pd.read_parquet(tmp_path / "sub" / "x.parquet"), df)
