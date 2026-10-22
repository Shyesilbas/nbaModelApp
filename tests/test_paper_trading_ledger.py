import json

from src.api.services import paper_trading as pt


def _write(tmp_path, rows):
    path = pt.ledger_path("2026-27", tmp_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")


def test_remote_ledger_wins_when_preferred(tmp_path, monkeypatch):
    _write(tmp_path, [{"game_id": "0022600001"}])
    monkeypatch.setattr(pt, "_remote_ledger_lines", lambda season: [json.dumps({"game_id": "0022600009"})])
    assert pt.read_ledger("2026-27", tmp_path, prefer_remote=True) == [{"game_id": "0022600009"}]
    assert pt.read_ledger("2026-27", tmp_path) == [{"game_id": "0022600001"}]


def test_falls_back_to_the_local_file_when_remote_is_unavailable(tmp_path, monkeypatch):
    _write(tmp_path, [{"game_id": "0022600001"}])
    monkeypatch.setattr(pt, "_remote_ledger_lines", lambda season: None)
    assert pt.read_ledger("2026-27", tmp_path, prefer_remote=True) == [{"game_id": "0022600001"}]
    assert pt.read_ledger("2099-00", tmp_path, prefer_remote=True) == []
