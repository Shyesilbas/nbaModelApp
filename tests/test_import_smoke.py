import importlib
import pathlib
import warnings

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[1]


def _modules():
    for base in ("src", "scripts"):
        for path in sorted((ROOT / base).rglob("*.py")):
            if path.name != "__init__.py":
                yield ".".join(path.relative_to(ROOT).with_suffix("").parts)
    yield "main"


@pytest.mark.parametrize("module", list(_modules()))
def test_module_imports(module):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        try:
            importlib.import_module(module)
        except SystemExit:
            pass


def test_production_model_loaders_load():
    from src.api.model_loader import ModelLoader, PlayerModelLoader, ScoreModelLoader

    for loader_cls in (ModelLoader, ScoreModelLoader, PlayerModelLoader):
        loader_cls().load()
