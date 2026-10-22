import sys
import time

from src.api.services import snapshot_publish as sp


def _wait():
    for _ in range(100):
        if sp.get_status()["status"] != "running":
            return sp.get_status()
        time.sleep(0.05)
    raise AssertionError("job did not finish")


def test_success_keeps_last_output_line():
    sp.start_publish([sys.executable, "-c", "print('warming up'); print('published: 3 files changed')"])
    status = _wait()
    assert status["status"] == "done" and status["message"] == "published: 3 files changed"


def test_failure_reports_last_error_line():
    sp.start_publish([sys.executable, "-c", "import sys; sys.stderr.write('boom\\n'); sys.exit(2)"])
    status = _wait()
    assert status["status"] == "failed" and status["error"] == "boom"


def test_second_start_while_running_is_ignored():
    sp.start_publish([sys.executable, "-c", "import time; time.sleep(0.3); print('ok')"])
    again = sp.start_publish([sys.executable, "-c", "print('second')"])
    assert again["status"] == "running"
    assert _wait()["message"] == "ok"
