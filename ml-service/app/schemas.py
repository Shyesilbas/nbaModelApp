from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import date


class WinProbRequest(BaseModel):
    home_team: str = Field(..., description="Home team abbreviation, e.g., LAL")
    away_team: str = Field(..., description="Away team abbreviation, e.g., BOS")
    prediction_date: date = Field(..., description="YYYY-MM-DD")


class WinProbResponse(BaseModel):
    home_team: str
    away_team: str
    predicted_winner: str
    home_win_probability: float
    away_win_probability: float
    confidence_bucket: str
    model_version: Optional[str]
    prediction_date: str
    error: Optional[str] = None


class ScorePredictionRequest(BaseModel):
    home_team: str = Field(..., description="Home team abbreviation, e.g., LAL")
    away_team: str = Field(..., description="Away team abbreviation, e.g., BOS")
    prediction_date: date = Field(..., description="YYYY-MM-DD")


class ScorePredictionResponse(BaseModel):
    home_team: str
    away_team: str
    predicted_home_score: float
    home_score_range: List[float]
    predicted_away_score: float
    away_score_range: List[float]
    predicted_total_points: float
    total_points_range: List[float]
    predicted_margin: float
    margin_range: List[float]
    score_model_winner: str
    note: str
    model_version: Optional[str]
    prediction_date: str
    error: Optional[str] = None

