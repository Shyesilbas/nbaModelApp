from .model_loader import ModelLoader, ScoreModelLoader, PlayerModelLoader
from .schemas import (
    WinProbRequest, WinProbResponse
)
from scripts.build_matchup_features import build_features
from typing import Any, Dict, Optional
import pandas as pd
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

loader = ModelLoader()
score_loader = ScoreModelLoader()
player_loader = PlayerModelLoader()

CANONICAL_POSITIONS = {}

def init_model():
    loader.load()
    score_loader.load()
    try:
        player_loader.load()
    except Exception as e:
        print("Player models could not be loaded:", e)
        
    try:
        canonical_path = ROOT / "data" / "canonical" / "player_metadata.csv"
        if canonical_path.exists():
            df_can = pd.read_csv(canonical_path)
            for _, r in df_can.iterrows():
                CANONICAL_POSITIONS[int(r["PLAYER_ID"])] = str(r["POSITION_GROUP"]).upper()
            print(f"Loaded {len(CANONICAL_POSITIONS)} canonical player positions.")
    except Exception as e:
        print("Canonical positions could not be loaded:", e)


def predict(request: WinProbRequest, features: Optional[Dict[str, Any]] = None) -> WinProbResponse:
    # Normalize and validate prediction_date (pydantic date ensures valid YYYY-MM-DD)
    pred_date_str = request.prediction_date.isoformat() if hasattr(request.prediction_date, 'isoformat') else str(request.prediction_date)

    # Build features using shared pipeline
    if features is None:
        try:
            feats = build_features(
                request.home_team.upper(),
                request.away_team.upper(),
                pred_date_str,
                season=getattr(request, "season", None),
                player_status_overrides=getattr(request, "player_status_overrides", None),
            )
        except Exception as e:
            if "No historical games" in str(e) or "Leakage" in str(e) or "No team-level games" in str(e):
                raise ValueError(str(e))
            raise e
    else:
        feats = features

    # Order features accordingly
    feature_cols = loader.feature_cols
    row = [feats.get(c, float("nan")) for c in feature_cols]
    X = pd.DataFrame([row], columns=feature_cols)

    probs = loader.predict_proba(X)[0]
    p_home = float(probs[1])
    p_away = float(probs[0])

    model_version = loader.get_version()

    return WinProbResponse(
        home_team=request.home_team.upper(),
        away_team=request.away_team.upper(),
        predicted_winner=request.home_team.upper() if p_home >= 0.5 else request.away_team.upper(),
        home_win_probability=round(p_home, 4),
        away_win_probability=round(p_away, 4),
        confidence_bucket=("Strong confidence" if max(p_home,p_away)>=0.7 else ("Moderate confidence" if max(p_home,p_away)>=0.6 else ("Slight edge" if max(p_home,p_away)>=0.55 else "Toss-up"))),
        model_version=model_version,
        prediction_date=pred_date_str
    )

