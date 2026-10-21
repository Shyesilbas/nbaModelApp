import tempfile
import unittest
from pathlib import Path

import pandas as pd
import yaml

from src.training.training_manifest import TrainingManifestError, load_training_manifest


def _write_manifest(root: Path, train_seasons=None):
    config_dir = root / "config"
    config_dir.mkdir()
    feature_dir = config_dir / "features"
    feature_dir.mkdir()
    for name in ["win.yaml", "score.yaml", "player.yaml"]:
        (feature_dir / name).write_text(yaml.safe_dump({"schema_version": name.replace(".yaml", "")}))
    manifest = {
        "release": "v11",
        "train_seasons": train_seasons or ["2024-25"],
        "calibration_season": "2025-26",
        "validation_season": "2025-26",
        "holdout": {"strategy": "season_holdout", "test_size": 0.2, "date_col": "GAME_DATE"},
        "models": {
            "win": {"enabled": True, "feature_contract": "config/features/win.yaml"},
            "score": {"enabled": True, "feature_contract": "config/features/score.yaml"},
            "player": {"enabled": True, "feature_contract": "config/features/player.yaml", "required_seasons": ["2025-26"]},
        },
        "promotion_thresholds": {},
        "required_segments": ["overall", "home"],
    }
    path = config_dir / "training_manifest.yaml"
    path.write_text(yaml.safe_dump(manifest))
    return path


def _write_team(root: Path, season="2024-25"):
    path = root / "data" / "training"
    path.mkdir(parents=True, exist_ok=True)
    pd.DataFrame({"GAME_DATE": ["2025-01-01"], "WIN": [1]}).to_csv(path / f"team_model_ready_{season.replace('-', '_')}.csv", index=False)


def _write_player(root: Path):
    path = root / "data" / "training"
    path.mkdir(parents=True, exist_ok=True)
    pd.DataFrame({"SEASON_ID": [22025], "GAME_DATE": ["2025-10-20"], "TARGET_PTS": [12]}).to_csv(path / "player_model_ready.csv", index=False)


class TestTrainingManifest(unittest.TestCase):
    def test_load_training_manifest_resolves_expected_files(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            manifest_path = _write_manifest(tmp_path)
            _write_team(tmp_path)
            _write_team(tmp_path, "2025-26")
            _write_player(tmp_path)

            manifest = load_training_manifest(manifest_path, root=tmp_path)

            self.assertEqual(manifest.train_seasons, ["2024-25"])
            self.assertEqual(manifest.validation_season, "2025-26")
            self.assertEqual(len(manifest.team_dataset_files), 2)
            self.assertEqual(manifest.player_dataset_path.name, "player_model_ready.csv")
            self.assertEqual(set(manifest.feature_contracts), {"win", "score", "player"})

    def test_load_training_manifest_fails_on_missing_team_season(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            manifest_path = _write_manifest(tmp_path, train_seasons=["2023-24"])
            _write_player(tmp_path)

            with self.assertRaises(TrainingManifestError):
                load_training_manifest(manifest_path, root=tmp_path)

    def test_load_training_manifest_fails_on_player_season_mismatch(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            manifest_path = _write_manifest(tmp_path)
            _write_team(tmp_path)
            _write_team(tmp_path, "2025-26")
            path = tmp_path / "data" / "training"
            path.mkdir(parents=True, exist_ok=True)
            pd.DataFrame({"SEASON_ID": [22024], "GAME_DATE": ["2024-10-20"]}).to_csv(path / "player_model_ready.csv", index=False)

            with self.assertRaises(TrainingManifestError):
                load_training_manifest(manifest_path, root=tmp_path)
