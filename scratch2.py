import pandas as pd
from src.ingestion.boxscore_loader import load_team_boxscores
try:
    df = load_team_boxscores(save=False, season="2025-26", output_scope="production")
except Exception as e:
    import traceback
    traceback.print_exc()
