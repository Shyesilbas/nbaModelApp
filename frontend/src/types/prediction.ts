import type { ExplanationContext } from "../components/prediction/featureLabels";
import type { InjuryReportSummary } from "../components/prediction/InjuryReportPanel";
import type { PlayerMatchupData } from "../components/prediction/PlayerMatchupModal";

export type RawScoreRange = [number, number] | number[] | null | undefined;

export interface FeatureImpact {
  feature_name: string;
  display_name?: string;
  category?: string;
  value: number;
  contribution: number;
  influence?: "FAVORS_HOME" | "FAVORS_AWAY" | "NEUTRAL" | string;
}

export interface PredictionExplanation {
  win_probability?: {
    context?: ExplanationContext;
    features?: FeatureImpact[];
    predicted_winner?: string;
  };
  score_prediction?: {
    margin_features?: FeatureImpact[];
    pace_features?: FeatureImpact[];
    home_rtg_features?: FeatureImpact[];
    away_rtg_features?: FeatureImpact[];
  };
}

export interface NormalizedPrediction {
  home_team: string;
  away_team: string;
  prediction_date: string;
  predicted_winner?: string;
  win_probability: {
    predicted_winner?: string;
    home_win_probability?: number;
    away_win_probability?: number;
    confidence_bucket?: string;
    model_version?: string;
    error?: string;
  };
  score_prediction: {
    predicted_home_score?: number;
    home_score_range?: RawScoreRange;
    predicted_away_score?: number;
    away_score_range?: RawScoreRange;
    predicted_total_points?: number;
    total_points_range?: RawScoreRange;
    predicted_margin?: number;
    margin_range?: RawScoreRange;
    score_model_winner?: string;
    model_version?: string;
    confidence_warning?: string | null;
    predicted_pace?: number | null;
    predicted_home_off_rtg?: number | null;
    predicted_away_off_rtg?: number | null;
    error?: string;
  };
  injury_report?: InjuryReportSummary | null;
  final_display_recommendation?: {
    primary_winner_signal?: string;
    warning?: string;
  };
  player_predictions?: {
    home_players?: PlayerMatchupData[];
    away_players?: PlayerMatchupData[];
    error?: string;
  };
  explanation?: PredictionExplanation | null;
  is_preseason?: boolean;
  season_type?: string;
}
