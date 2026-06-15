from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List

import yaml


class FeatureContractError(ValueError):
    pass


@dataclass(frozen=True)
class FeatureContract:
    path: Path
    raw: Dict[str, Any]
    schema_version: str

    @property
    def snapshot(self) -> Dict[str, Any]:
        return {"path": str(self.path), "schema_version": self.schema_version, "config": self.raw}

    def list_value(self, key: str, default: List[str] | None = None) -> List[str]:
        value = self.raw.get(key, default or [])
        if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
            raise FeatureContractError(f"`{key}` must be a list of strings in {self.path}.")
        return value

    def dict_value(self, key: str, default: Dict[str, Any] | None = None) -> Dict[str, Any]:
        value = self.raw.get(key, default or {})
        if not isinstance(value, dict):
            raise FeatureContractError(f"`{key}` must be a mapping in {self.path}.")
        return value


def load_feature_contract(path: str | Path, *, root: Path | None = None) -> FeatureContract:
    project_root = root or Path(__file__).resolve().parents[2]
    contract_path = Path(path)
    if not contract_path.is_absolute():
        contract_path = project_root / contract_path
    if not contract_path.exists():
        raise FeatureContractError(f"Feature contract does not exist: {contract_path}")
    with open(contract_path, "r") as f:
        raw = yaml.safe_load(f) or {}
    if not isinstance(raw, dict):
        raise FeatureContractError(f"Feature contract root must be a mapping: {contract_path}")
    schema_version = raw.get("schema_version")
    if not isinstance(schema_version, str) or not schema_version:
        raise FeatureContractError(f"Feature contract requires `schema_version`: {contract_path}")
    return FeatureContract(path=contract_path, raw=raw, schema_version=schema_version)


def resolve_feature_list(contract: FeatureContract, *, root: Path | None = None) -> List[str]:
    project_root = root or Path(__file__).resolve().parents[2]
    features: List[str] = []
    base_feature_file = contract.raw.get("base_feature_file")
    if base_feature_file:
        base_path = Path(base_feature_file)
        if not base_path.is_absolute():
            base_path = project_root / base_path
        if not base_path.exists():
            raise FeatureContractError(f"Base feature file does not exist: {base_path}")
        features.extend(json.loads(base_path.read_text()))
    features.extend(contract.list_value("required_features", []))
    features.extend(contract.list_value("derived_features", []))
    return list(dict.fromkeys(features))
