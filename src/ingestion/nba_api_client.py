"""
nba_api_client.py
-----------------
Centralized client wrapper for nba_api calls with robust error handling,
retry logic (exponential backoff), and rate limit handling.
"""

import time
import random
import logging
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
