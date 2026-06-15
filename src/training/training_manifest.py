from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Mapping

import pandas as pd
import yaml


class TrainingManifestError(ValueError):
    pass


@dataclass(frozen=True)
class TrainingManifest:
    path: Path
    raw: Dict[str, Any]
    train_seasons: List[str]
    calibration_season: str | None
    validation_season: str
    holdout: Dict[str, Any]
    models: Dict[str, Dict[str, Any]]
    promotion_thresholds: Dict[str, Any]
    required_segments: List[str]
    team_dataset_files: List[Path]
    player_dataset_path: Path
    feature_contracts: Dict[str, Path]

    @property
    def modeling_seasons(self) -> List[str]:
        seasons = list(self.train_seasons)
        if self.calibration_season and self.calibration_season not in seasons:
            seasons.append(self.calibration_season)
        return seasons

    @property
    def snapshot(self) -> Dict[str, Any]:
        data = dict(self.raw)
        data["resolved_paths"] = {
            "team_dataset_files": [str(p) for p in self.team_dataset_files],
            "player_dataset_path": str(self.player_dataset_path),
            "feature_contracts": {k: str(v) for k, v in self.feature_contracts.items()},
        }
        return data

    def model_enabled(self, name: str) -> bool:
        return bool(self.models.get(name, {}).get("enabled", False))


def _require_list(config: Mapping[str, Any], key: str) -> List[str]:
    value = config.get(key)
    if not isinstance(value, list) or not value or not all(isinstance(v, str) and v for v in value):
        raise TrainingManifestError(f"`{key}` must be a non-empty list of season strings.")
    return value


def _season_to_season_id(season: str) -> int:
    try:
        return int("2" + season.split("-")[0])
    except Exception as exc:
        raise TrainingManifestError(f"Invalid NBA season format: {season}") from exc


def _assert_non_empty_csv(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise TrainingManifestError(f"Required training dataset is missing: {path}")
    df = pd.read_csv(path)
    if df.empty:
        raise TrainingManifestError(f"Required training dataset is empty: {path}")
    return df


def load_training_manifest(path: str | Path | None = None, *, root: Path | None = None, validate_player_coverage: bool = True) -> TrainingManifest:
    project_root = root or Path(__file__).resolve().parents[2]
    manifest_path = Path(path) if path else project_root / "config" / "training_manifest.yaml"
    if not manifest_path.is_absolute():
        manifest_path = project_root / manifest_path
    if not manifest_path.exists():
        raise TrainingManifestError(f"Training manifest does not exist: {manifest_path}")

    with open(manifest_path, "r") as f:
        raw = yaml.safe_load(f) or {}
    if not isinstance(raw, dict):
        raise TrainingManifestError("Training manifest root must be a mapping.")

    train_seasons = _require_list(raw, "train_seasons")
    calibration_season = raw.get("calibration_season")
    if calibration_season is not None and (not isinstance(calibration_season, str) or not calibration_season):
        raise TrainingManifestError("`calibration_season` must be a season string when provided.")
    validation_season = raw.get("validation_season")
    if not isinstance(validation_season, str) or not validation_season:
        raise TrainingManifestError("`validation_season` must be a season string.")

    holdout = raw.get("holdout") or {}
    if holdout.get("strategy") not in {"chronological", "season_holdout"}:
        raise TrainingManifestError("`holdout.strategy` must be `chronological` or `season_holdout`.")
    if holdout.get("strategy") == "season_holdout" and not calibration_season:
        raise TrainingManifestError("`calibration_season` is required when `holdout.strategy` is `season_holdout`.")
    test_size = float(holdout.get("test_size", 0.2))
    if not 0 < test_size < 1:
        raise TrainingManifestError("`holdout.test_size` must be between 0 and 1.")
    holdout = {
        "strategy": holdout.get("strategy"),
        "test_size": test_size,
        "date_col": holdout.get("date_col", "GAME_DATE"),
        "calibration_season": calibration_season,
    }

    models = raw.get("models") or {}
    if not isinstance(models, dict):
        raise TrainingManifestError("`models` must be a mapping.")
    feature_contracts: Dict[str, Path] = {}
    for model_name, model_config in models.items():
        if not isinstance(model_config, dict):
            raise TrainingManifestError(f"`models.{model_name}` must be a mapping.")
        contract = model_config.get("feature_contract")
        if contract:
            contract_path = Path(contract)
            if not contract_path.is_absolute():
                contract_path = project_root / contract_path
            if not contract_path.exists():
                raise TrainingManifestError(f"Feature contract for `{model_name}` does not exist: {contract_path}")
            feature_contracts[model_name] = contract_path

    team_files = []
    modeling_seasons = list(train_seasons)
    if calibration_season and calibration_season not in modeling_seasons:
        modeling_seasons.append(calibration_season)
    for season in modeling_seasons:
        file_path = project_root / "data" / "processed" / f"team_model_ready_v3_{season.replace('-', '_')}.csv"
        df = _assert_non_empty_csv(file_path)
        if "GAME_DATE" not in df.columns:
            raise TrainingManifestError(f"Team dataset lacks GAME_DATE: {file_path}")
        team_files.append(file_path)

    player_required_seasons = models.get("player", {}).get("required_seasons") or modeling_seasons + [validation_season]
    if not isinstance(player_required_seasons, list) or not all(isinstance(s, str) for s in player_required_seasons):
        raise TrainingManifestError("`models.player.required_seasons` must be a list of season strings when provided.")
    player_path = project_root / "data" / "experimental" / "player_model_ready_v4_usg.csv"
    if validate_player_coverage:
        player_df = _assert_non_empty_csv(player_path)
        if "SEASON_ID" not in player_df.columns:
            raise TrainingManifestError(f"Player dataset lacks SEASON_ID and cannot be season-validated: {player_path}")
        expected_season_ids = {_season_to_season_id(s) for s in player_required_seasons}
        actual_season_ids = set(pd.to_numeric(player_df["SEASON_ID"], errors="coerce").dropna().astype(int).unique())
        missing = sorted(expected_season_ids - actual_season_ids)
        if missing:
            raise TrainingManifestError(f"Player dataset does not cover required SEASON_ID values: {missing}")
    elif not player_path.exists():
        player_path.parent.mkdir(parents=True, exist_ok=True)

    required_segments = raw.get("required_segments") or ["overall"]
    if not isinstance(required_segments, list) or not all(isinstance(s, str) for s in required_segments):
        raise TrainingManifestError("`required_segments` must be a list of strings.")

    return TrainingManifest(
        path=manifest_path,
        raw=raw,
        train_seasons=train_seasons,
        calibration_season=calibration_season,
        validation_season=validation_season,
        holdout=holdout,
        models=models,
        promotion_thresholds=raw.get("promotion_thresholds") or {},
        required_segments=required_segments,
        team_dataset_files=team_files,
        player_dataset_path=player_path,
        feature_contracts=feature_contracts,
    )
