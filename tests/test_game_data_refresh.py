import importlib
import threading
import time


def test_single_and_batch_refreshes_never_overlap(monkeypatch):
    refresh = importlib.import_module("src.api.services.game_data_refresh")

    running, overlaps = [0], []

    def fake_refresh(game_id, season, home, away):
        running[0] += 1
        overlaps.append(running[0])
        time.sleep(0.05)  # long enough for the other thread to try to start
        running[0] -= 1

    monkeypatch.setattr(refresh, "_refresh_locked", fake_refresh)
    threads = [threading.Thread(target=refresh._run_refresh, args=(f"002260000{i}", "2026-27", None, None)) for i in range(3)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert overlaps == [1, 1, 1]
