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
from typing import Any

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("NBAApiClient")

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
    backoff = initial_backoff
    for attempt in range(1, max_retries + 1):
        try:
            # Jittered sleep to avoid rate limits
            sleep_time = random.uniform(0.6, 1.2)
            time.sleep(sleep_time)
            
            logger.info(f"API Request: {endpoint_class.__name__} (Attempt {attempt}/{max_retries})")
            
            if "timeout" not in kwargs:
                kwargs["timeout"] = 120
            # Execute the call (let nba_api use its default headers)
            instance = endpoint_class(*args, **kwargs)
            return instance
            
        except Exception as e:
            logger.warning(f"API Request {endpoint_class.__name__} attempt {attempt} failed: {e}")
            if attempt == max_retries:
                logger.error(f"Failed to fetch {endpoint_class.__name__} after {max_retries} attempts.")
                raise e
            
            # Exponential backoff with jitter
            retry_sleep = backoff * (2 ** (attempt - 1)) + random.uniform(0.1, 1.0)
            logger.info(f"Retrying in {retry_sleep:.2f} seconds...")
            time.sleep(retry_sleep)


_BOXSCORE_TTL_SECONDS = 120
_boxscore_cache: dict[str, tuple[float, list]] = {}
_boxscore_lock = threading.Lock()


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
    frames = call_nba_api(boxscoretraditionalv3.BoxScoreTraditionalV3, game_id=gid, **kwargs).get_data_frames()
    with _boxscore_lock:
        for key in [k for k, (t, _) in _boxscore_cache.items() if now - t >= _BOXSCORE_TTL_SECONDS]:
            del _boxscore_cache[key]
        _boxscore_cache[gid] = (now, frames)
    return [f.copy() for f in frames]
