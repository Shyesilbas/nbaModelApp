"""
nba_api_client.py
-----------------
Centralized client wrapper for nba_api calls with robust error handling,
retry logic (exponential backoff), and rate limit handling.
"""

import time
import random
import logging
import threading
from contextlib import contextmanager
from typing import Any, Iterator

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("NBAApiClient")

_thread_api_opts = threading.local()


@contextmanager
def api_call_options(
    *,
    max_retries: int | None = None,
    initial_backoff: float | None = None,
    timeout: int | None = None,
    min_sleep: float | None = None,
    max_sleep: float | None = None,
) -> Iterator[None]:
    """Temporarily override call_nba_api retry/sleep/timeout settings in the current thread."""
    prev = getattr(_thread_opts_obj := _thread_api_opts, "opts", None)
    opts = dict(prev) if prev else {}
    for key, val in (
        ("max_retries", max_retries),
        ("initial_backoff", initial_backoff),
        ("timeout", timeout),
        ("min_sleep", min_sleep),
        ("max_sleep", max_sleep),
    ):
        if val is not None:
            opts[key] = val
    _thread_opts_obj.opts = opts
    try:
        yield
    finally:
        _thread_opts_obj.opts = prev


def call_nba_api(endpoint_class: Any, *args, max_retries: int = 5, initial_backoff: float = 1.0, **kwargs) -> Any:
    """
    Call an nba_api endpoint class with automatic retries and exponential backoff.
    Uses default headers built into nba_api to avoid triggering Akamai CDN blockages.
    
    Parameters:
        endpoint_class: The nba_api stats endpoint class (e.g. LeagueGameLog, ScoreboardV3).
        max_retries: Maximum number of attempts.
        initial_backoff: Starting sleep duration in seconds.
        
    Returns:
        An instance of the endpoint_class.
    """
    opts = getattr(_thread_api_opts, "opts", None) or {}
    retries = int(opts.get("max_retries", max_retries))
    backoff = float(opts.get("initial_backoff", initial_backoff))
    min_sleep = float(opts.get("min_sleep", 0.6))
    max_sleep = float(opts.get("max_sleep", 1.2))
    default_timeout = int(opts.get("timeout", 120))

    for attempt in range(1, retries + 1):
        try:
            # Jittered sleep to avoid rate limits
            if max_sleep > 0:
                sleep_time = random.uniform(min_sleep, max_sleep)
                time.sleep(sleep_time)
            
            logger.info(f"API Request: {endpoint_class.__name__} (Attempt {attempt}/{retries})")
            
            if "timeout" not in kwargs:
                kwargs["timeout"] = default_timeout
            # Execute the call (let nba_api use its default headers)
            instance = endpoint_class(*args, **kwargs)
            return instance
            
        except Exception as e:
            logger.warning(f"API Request {endpoint_class.__name__} attempt {attempt} failed: {e}")
            if attempt == retries:
                logger.error(f"Failed to fetch {endpoint_class.__name__} after {retries} attempts.")
                raise e
            
            # Exponential backoff with jitter
            retry_sleep = backoff * (2 ** (attempt - 1)) + random.uniform(0.1, 1.0)
            logger.info(f"Retrying in {retry_sleep:.2f} seconds...")
            time.sleep(retry_sleep)


_BOXSCORE_TTL_SECONDS = 120
_BOXSCORE_FAIL_TTL_SECONDS = 5
_boxscore_cache: dict[str, tuple[float, list]] = {}
_boxscore_error_cache: dict[str, tuple[float, Exception]] = {}
_boxscore_v2_cache: dict[str, tuple[float, list]] = {}
_boxscore_lock = threading.Lock()


def clear_boxscore_cache(game_id: str | None = None) -> None:
    """Clear short-TTL boxscore caches (for one game_id on explicit retry, or all)."""
    with _boxscore_lock:
        if game_id is None:
            _boxscore_cache.clear()
            _boxscore_error_cache.clear()
            _boxscore_v2_cache.clear()
            return
        gid = str(game_id).zfill(10)
        _boxscore_cache.pop(gid, None)
        _boxscore_error_cache.pop(gid, None)
        _boxscore_v2_cache.pop(gid, None)


def fetch_boxscore_v3_frames(game_id: str, **kwargs) -> list:
    """BoxScoreTraditionalV3 data frames for one game, shared by the team, player and starter fetchers.

    One game ingest needs the same response three times; it is kept for a short time so it is
    requested once. Short, because a box score fetched while the game is live must not be reused."""
    from nba_api.stats.endpoints import boxscoretraditionalv3

    gid = str(game_id).zfill(10)
    now = time.time()
    with _boxscore_lock:
        hit = _boxscore_cache.get(gid)
        if hit and now - hit[0] < _BOXSCORE_TTL_SECONDS:
            return [f.copy() for f in hit[1]]
        err_hit = _boxscore_error_cache.get(gid)
        if err_hit and now - err_hit[0] < _BOXSCORE_FAIL_TTL_SECONDS:
            raise err_hit[1]
    try:
        frames = call_nba_api(boxscoretraditionalv3.BoxScoreTraditionalV3, game_id=gid, **kwargs).get_data_frames()
    except Exception as exc:
        with _boxscore_lock:
            _boxscore_error_cache[gid] = (time.time(), exc)
        raise
    with _boxscore_lock:
        for key in [k for k, (t, _) in _boxscore_cache.items() if now - t >= _BOXSCORE_TTL_SECONDS]:
            del _boxscore_cache[key]
        _boxscore_error_cache.pop(gid, None)
        _boxscore_cache[gid] = (now, frames)
    return [f.copy() for f in frames]


def fetch_boxscore_v2_frames(game_id: str, **kwargs) -> list:
    """Shared short-TTL BoxScoreTraditionalV2 fallback frames so team & player share one request."""
    from nba_api.stats.endpoints import boxscoretraditionalv2

    gid = str(game_id).zfill(10)
    now = time.time()
    with _boxscore_lock:
        hit = _boxscore_v2_cache.get(gid)
        if hit and now - hit[0] < _BOXSCORE_TTL_SECONDS:
            return [f.copy() for f in hit[1]]
    frames = call_nba_api(boxscoretraditionalv2.BoxScoreTraditionalV2, game_id=gid, **kwargs).get_data_frames()
    with _boxscore_lock:
        for key in [k for k, (t, _) in _boxscore_v2_cache.items() if now - t >= _BOXSCORE_TTL_SECONDS]:
            del _boxscore_v2_cache[key]
        _boxscore_v2_cache[gid] = (now, frames)
    return [f.copy() for f in frames]
