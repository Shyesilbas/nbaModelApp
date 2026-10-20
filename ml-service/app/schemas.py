from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import date


class PlayerStatusOverride(BaseModel):
    player_id: Optional[int] = None
    player_name: Optional[str] = None
    status: str = "ACTIVE"  # "ACTIVE", "RESTRICTED", "OUT"
    minute_limit: Optional[float] = None
    status_factor: Optional[float] = None


class WinProbRequest(BaseModel):
    home_team: str = Field(..., description="Home team abbreviation, e.g., LAL")
    away_team: str = Field(..., description="Away team abbreviation, e.g., BOS")
    prediction_date: date = Field(..., description="YYYY-MM-DD")
    player_status_overrides: Optional[List[PlayerStatusOverride]] = Field(None, description="Optional player injury/status overrides")

class ShapExplanationRequest(BaseModel):
    home_team: str
    away_team: str
    prediction_date: date
    model_version: Optional[str] = "v9"
    player_status_overrides: Optional[List[PlayerStatusOverride]] = None


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
    player_status_overrides: Optional[List[PlayerStatusOverride]] = Field(None, description="Optional player injury/status overrides")


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
    confidence_warning: Optional[str] = None



class PlayerPrediction(BaseModel):
    player_id: int
    player_name: str
    position_group: str
    predicted_pts: float
    predicted_reb: float
    predicted_ast: float
    predicted_pra: float
    status: Optional[str] = "ACTIVE"

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
    player_status_overrides: Optional[List[PlayerStatusOverride]] = Field(None, description="Optional player injury/status overrides")


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
    confidence_warning: Optional[str] = None



class WinProbabilitySub(BaseModel):
    home_win_prob: float
    away_win_prob: float
    model_version: Optional[str] = None


class GameFullPlayer(BaseModel):
    player_id: Optional[int] = None
    player_name: str
    position_group: str
    proj_pts: float
    proj_reb: float
    proj_ast: float
    proj_pra: float
    raw_pts: float
    scale_factor: float
    status: Optional[str] = "ACTIVE"
    proj_min: Optional[float] = None
    importance: float = 0.0  # 0.5*MIN + PTS + 0.8*AST + 0.6*REB (EMA-10), used to order the lineup
    assumed_out: bool = False  # team models assume this rotation player is out unless marked ACTIVE


class ScaleFactorsSub(BaseModel):
    home: float
    away: float


class ExplanationFeature(BaseModel):
    feature_name: str
    display_name: str
    category: str
    value: float
    contribution: float
    influence: str  # "FAVORS_HOME", "FAVORS_AWAY", "NEUTRAL"


class WinProbabilityExplanation(BaseModel):
    intercept: float
    features: List[ExplanationFeature]


class ScoreModelExplanation(BaseModel):
    home_rtg_features: List[ExplanationFeature]
    away_rtg_features: List[ExplanationFeature]
    pace_features: List[ExplanationFeature]
    margin_features: List[ExplanationFeature]


class GameExplanationSub(BaseModel):
    win_probability: WinProbabilityExplanation
    score_prediction: ScoreModelExplanation


class GameFullResponse(BaseModel):
    game_id: str
    score_prediction: ScorePredictionSub
    win_probability: WinProbabilitySub
    home_players: List[GameFullPlayer]
    away_players: List[GameFullPlayer]
    scale_factors: ScaleFactorsSub
    explanation: Optional[GameExplanationSub] = None
    is_preseason: Optional[bool] = False
    season_type: Optional[str] = "Regular Season"


class ShapFactor(BaseModel):
    feature: str
    impact: float
    direction: str
    type: str  # "shap_feature" or "calibration_adjustment"

class ModelShapExplanation(BaseModel):
    base_value: float
    final_prediction: float
    top_factors: List[ShapFactor]
    unit: Optional[str] = None
    model_type: Optional[str] = None


class ShapExplanationResponse(BaseModel):
    home_team: str
    away_team: str
    prediction_date: str
    win_model_explanation: Optional[ModelShapExplanation] = None
    score_model_explanation: Optional[ModelShapExplanation] = None

