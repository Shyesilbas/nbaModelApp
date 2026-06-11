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


class PlayerPrediction(BaseModel):
    player_id: int
    player_name: str
    position_group: str
    predicted_pts: float
    predicted_reb: float
    predicted_ast: float
    predicted_pra: float

class PlayerPredictionResponse(BaseModel):
    home_team: str
    away_team: str
    prediction_date: str
    home_players: List[PlayerPrediction]
    away_players: List[PlayerPrediction]
    score_model_sync: bool
    model_version: Optional[str]
    error: Optional[str] = None

class ModelMetrics(BaseModel):
    roc_auc: Optional[float] = None
    brier: Optional[float] = None
    accuracy: Optional[float] = None
    home_mae: Optional[float] = None
    away_mae: Optional[float] = None


class WinModelInfo(BaseModel):
    active: bool
    scope: str
    path: str
    version: Optional[str]
    metrics: ModelMetrics


class ScoreModelInfo(BaseModel):
    active: bool
    home_model_path: str
    away_model_path: str
    total_model_path: str
    margin_model_path: str
    version: Optional[str]
    metrics: ModelMetrics


class ModelStatusResponse(BaseModel):
    win_model: WinModelInfo
    score_model: ScoreModelInfo
    experimental_candidate: Optional[dict] = None


class GameFullRequest(BaseModel):
    game_id: Optional[str] = Field("unknown", description="Unique game identifier")
    home_team_id: str = Field(..., description="Home team abbreviation")
    away_team_id: str = Field(..., description="Away team abbreviation")
    home_score_prediction: Optional[float] = Field(None, description="Optional. If omitted, uses Score Model.")
    away_score_prediction: Optional[float] = Field(None, description="Optional. If omitted, uses Score Model.")
    prediction_date: Optional[date] = Field(None, description="YYYY-MM-DD. Defaults to today if omitted.")


class ScorePredictionSub(BaseModel):
    home: float
    home_range: List[float]
    away: float
    away_range: List[float]
    margin: float
    margin_range: List[float]
    total: float
    total_range: List[float]
    model_version: Optional[str] = None


class WinProbabilitySub(BaseModel):
    home_win_prob: float
    away_win_prob: float


class GameFullPlayer(BaseModel):
    player_name: str
    position_group: str
    proj_pts: float
    proj_reb: float
    proj_ast: float
    proj_pra: float
    raw_pts: float
    scale_factor: float


class ScaleFactorsSub(BaseModel):
    home: float
    away: float


class GameFullResponse(BaseModel):
    game_id: str
    score_prediction: ScorePredictionSub
    win_probability: WinProbabilitySub
    home_players: List[GameFullPlayer]
    away_players: List[GameFullPlayer]
    scale_factors: ScaleFactorsSub
