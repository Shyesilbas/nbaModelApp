"""Core docs must describe the models that are actually in production.

Catches the drift that hand-copied numbers and versions accumulate: a release bump that
skips a doc, a feature count left at an older value, a walk-forward report that predates
the last retrain, or a doc pointing at a file that was renamed or deleted.
"""
import json
import re
from pathlib import Path

import pytest

from src.core.artifact_paths import production_release
from src.evaluation.model_doc_blocks import MODEL_DOCS, render_block

ROOT = Path(__file__).resolve().parents[1]
CORE_DOCS = [
    "README.md",
    "AGENTS.md",
    "AI_CONTEXT.md",
    "ARTIFACT_REGISTRY.md",
    "PROJECT_STATUS.md",
    "docs/reports/nba_models_comprehensive_report.md",
    "reports/README.md",
    "reports/production/model_performance_and_architecture_report.md",
    "docs/reports/models/win_probability_model.md",
    "docs/reports/models/score_model.md",
    "docs/reports/models/player_props_model.md",
]
# Only directories that are tracked in git; data/ is local and rebuilt, so it is not checked.
TRACKED_PREFIXES = ("models/", "config/", "scripts/", "src/", "docs/", "reports/", "tests/", ".github/")
PATH_TOKEN = re.compile(r"`([^`\s]+)`|\]\(([^)\s#]+)\)")
TEMPLATE_MARKERS = ("{", "}", "<", ">", "*", "YYYY", "...")


def _meta(family: str) -> dict:
    return json.loads((ROOT / f"models/production/{family}_metadata.json").read_text())


def test_metadata_versions_match_release():
    release = production_release()
    assert release
    for family in ("win", "score", "player"):
        assert _meta(family)["version"] == release, family


@pytest.mark.parametrize("doc", ["README.md", "AGENTS.md", "AI_CONTEXT.md", "ARTIFACT_REGISTRY.md", "PROJECT_STATUS.md",
                                 "docs/reports/nba_models_comprehensive_report.md"])
def test_core_docs_name_the_release(doc):
    assert production_release() in (ROOT / doc).read_text(), f"{doc} does not mention {production_release()}"


def test_agents_feature_counts_match_artifacts():
    text = (ROOT / "AGENTS.md").read_text()
    win_n = int(re.search(r"`win_model\.pkl`: (\d+) özellikli", text).group(1))
    player_n = int(re.search(r"`player_model_\*\.pkl`: (\d+) özellikli", text).group(1))
    assert win_n == len(json.loads((ROOT / "models/production/win_features.json").read_text()))
    assert player_n == _meta("player")["features_count"]


def test_walk_forward_report_measures_current_release():
    report = json.loads((ROOT / "reports/evaluation/multi_season_walk_forward_backtest.json").read_text())
    prov = report.get("provenance") or {}
    release = production_release()
    stale = {fam: prov.get(fam, {}).get("version") for fam in ("win", "score", "player")
             if prov.get(fam, {}).get("version") != release}
    assert not stale, f"walk-forward report predates {release}: {stale}; rerun scripts/walk_forward_benchmark.py"


def _referenced_paths(doc: Path):
    for match in PATH_TOKEN.finditer(doc.read_text()):
        token = match.group(1) or match.group(2)
        # Markdown links are relative to the doc; backtick paths are relative to the repo root.
        if match.group(2) and not token.startswith(("http", "file:")):
            resolved = (doc.parent / token).resolve()
            if resolved.is_relative_to(ROOT):
                token = str(resolved.relative_to(ROOT))
        token = token.split(":")[0]
        if not token.startswith(TRACKED_PREFIXES) or any(m in token for m in TEMPLATE_MARKERS):
            continue
        yield token


@pytest.mark.parametrize("doc", CORE_DOCS)
def test_core_doc_paths_exist(doc):
    missing = sorted({p for p in _referenced_paths(ROOT / doc) if not (ROOT / p).exists()})
    assert not missing, f"{doc} points at missing files: {missing}"


@pytest.mark.parametrize("family", sorted(MODEL_DOCS))
def test_model_doc_blocks_match_walk_forward_report(family):
    summary = json.loads((ROOT / "reports/evaluation/multi_season_walk_forward_backtest.json").read_text())
    text = (ROOT / MODEL_DOCS[family]).read_text()
    assert render_block(summary, family) in text, (
        f"{MODEL_DOCS[family]} walk-forward block is missing or stale; "
        "run PYTHONPATH=. python3 scripts/walk_forward_benchmark.py --docs-only")


def test_status_doc_blocks_match_reports():
    from src.evaluation import status_blocks as sb

    wf = json.loads((ROOT / sb.WALK_FORWARD_JSON).read_text())
    expected = {
        "PROJECT_STATUS.md": {"walk-forward-headline": sb.status_walk_forward(wf)},
        "README.md": {"walk-forward-table": sb.readme_table(wf), "walk-forward-significance": sb.readme_significance(wf)},
    }
    ledger_path = ROOT / "reports/evaluation/paper_ledger_2026_27.json"
    if ledger_path.exists():
        expected["PROJECT_STATUS.md"]["ledger-headline"] = sb.status_ledger(json.loads(ledger_path.read_text()))
    for doc, blocks in expected.items():
        text = (ROOT / doc).read_text()
        for name, body in blocks.items():
            assert sb.apply_named_block(text, name, body) == text, (
                f"{doc} block '{name}' is stale; run PYTHONPATH=. python3 scripts/refresh_reports.py")


def test_walk_forward_report_is_not_older_than_production_models():
    from scripts.refresh_reports import walk_forward_is_stale

    assert not walk_forward_is_stale(ROOT), "production models changed after the benchmark; run scripts/refresh_reports.py"


def test_paper_ledger_report_covers_every_graded_ledger_row():
    from src.api.services.paper_trading import grade, load_results, read_ledger

    ledger = ROOT / "data/predictions/paper_ledger_2026_27.jsonl"
    if not ledger.exists():
        pytest.skip("local ledger absent")
    report = json.loads((ROOT / "reports/evaluation/paper_ledger_2026_27.json").read_text())
    graded = grade(read_ledger("2026-27"), load_results("2026-27"))
    final = sum(1 for g in graded if g["status"] == "final" and g["valid"])
    assert report["graded"] == final, f"paper ledger report has {report['graded']} graded games, ledger has {final}; rerun scripts/paper_ledger_report.py"
