from pathlib import Path

import pandas as pd
import pytest
import yaml

from src.training.training_manifest import TrainingManifestError, load_training_manifest


def _write_manifest(root: Path, train_seasons=None):
    config_dir = root / "config"
    config_dir.mkdir()
    feature_dir = config_dir / "features"
    feature_dir.mkdir()
    for name in ["win_v9.yaml", "score_v9.yaml", "player_v9.yaml"]:
        (feature_dir / name).write_text(yaml.safe_dump({"schema_version": name.replace(".yaml", "")}))
    manifest = {
        "train_seasons": train_seasons or ["2024-25"],
        "calibration_season": "2025-26",
        "validation_season": "2025-26",
        "holdout": {"strategy": "season_holdout", "test_size": 0.2, "date_col": "GAME_DATE"},
        "models": {
            "win": {"enabled": True, "feature_contract": "config/features/win_v9.yaml"},
            "score": {"enabled": True, "feature_contract": "config/features/score_v9.yaml"},
            "player": {"enabled": True, "feature_contract": "config/features/player_v9.yaml", "required_seasons": ["2025-26"]},
        },
        "promotion_thresholds": {},
        "required_segments": ["overall", "home"],
    }
    path = config_dir / "training_manifest.yaml"
    path.write_text(yaml.safe_dump(manifest))
    return path


def _write_team(root: Path, season="2024-25"):
    path = root / "data" / "processed"
    path.mkdir(parents=True)
    pd.DataFrame({"GAME_DATE": ["2025-01-01"], "WIN": [1]}).to_csv(path / f"team_model_ready_v3_{season.replace('-', '_')}.csv", index=False)


def _write_player(root: Path):
    path = root / "data" / "experimental"
    path.mkdir(parents=True)
    pd.DataFrame({"SEASON_ID": [22025], "GAME_DATE": ["2025-10-20"], "TARGET_PTS": [12]}).to_csv(path / "player_model_ready_v4_usg.csv", index=False)


def test_load_training_manifest_resolves_expected_files(tmp_path):
    manifest_path = _write_manifest(tmp_path)
    _write_team(tmp_path)
    _write_team(tmp_path, "2025-26")
    _write_player(tmp_path)

    manifest = load_training_manifest(manifest_path, root=tmp_path)

    assert manifest.train_seasons == ["2024-25"]
    assert manifest.validation_season == "2025-26"
    assert len(manifest.team_dataset_files) == 1
    assert manifest.player_dataset_path.name == "player_model_ready_v4_usg.csv"
    assert set(manifest.feature_contracts) == {"win", "score", "player"}


def test_load_training_manifest_fails_on_missing_team_season(tmp_path):
    manifest_path = _write_manifest(tmp_path, train_seasons=["2023-24"])
    _write_player(tmp_path)

    with pytest.raises(TrainingManifestError, match="missing"):
        load_training_manifest(manifest_path, root=tmp_path)


def test_load_training_manifest_fails_on_player_season_mismatch(tmp_path):
    manifest_path = _write_manifest(tmp_path)
    _write_team(tmp_path)
    _write_team(tmp_path, "2025-26")
    path = tmp_path / "data" / "experimental"
    path.mkdir(parents=True)
    pd.DataFrame({"SEASON_ID": [22024], "GAME_DATE": ["2024-10-20"]}).to_csv(path / "player_model_ready_v4_usg.csv", index=False)

    with pytest.raises(TrainingManifestError, match="does not cover"):
        load_training_manifest(manifest_path, root=tmp_path)
