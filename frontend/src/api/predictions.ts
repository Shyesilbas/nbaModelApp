import { API_BASE_URL } from "../lib/constants";
export { API_BASE_URL };

export type PlayerStatusOverride = {
  player_id?: number | string;
  player_name?: string;
  status: "ACTIVE" | "RESTRICTED" | "QUESTIONABLE" | "DOUBTFUL" | "OUT";
  minute_limit?: number;
  status_factor?: number;
  is_starter?: boolean;
};

export type GameFullRequest = {
  game_id?: string;
  home_team_id: string;
  away_team_id: string;
  prediction_date: string;
  home_score_prediction?: number;
  away_score_prediction?: number;
  player_status_overrides?: PlayerStatusOverride[];
};

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body?.error || body?.detail || `Server returned ${res.status}`;
    throw new Error(message);
  }
  return body as T;
}

export async function predictGameFull(request: GameFullRequest): Promise<GameFullResponse> {
  const res = await fetch(`${API_BASE_URL}/predict/game_full`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return parseJsonResponse<GameFullResponse>(res);
}

type RawPlayerProjection = {
  player_id?: number | string | null;
  player_name: string;
  position_group?: string;
  proj_pts?: number;
  proj_reb?: number;
  proj_ast?: number;
  proj_pra?: number;
  proj_min?: number;
  status?: string;
  assumed_out?: boolean;
  importance?: number;
};

type RawScoreRange = [number, number] | number[] | null | undefined;

export type GameFullResponse = {
  win_probability: { home_win_prob: number; away_win_prob: number; model_version?: string };
  score_prediction: {
    home: number;
    away: number;
    total: number;
    margin: number;
    home_range?: RawScoreRange;
    away_range?: RawScoreRange;
    total_range?: RawScoreRange;
    margin_range?: RawScoreRange;
    model_version?: string;
    confidence_warning?: string | null;
    predicted_pace?: number | null;
    predicted_home_off_rtg?: number | null;
    predicted_away_off_rtg?: number | null;
  };
  injury_report?: unknown;
  home_players?: RawPlayerProjection[];
  away_players?: RawPlayerProjection[];
  explanation?: unknown;
  is_preseason?: boolean;
  season_type?: string;
};

const normalizePlayer = (p: RawPlayerProjection) => ({
  player_id: p.player_id ?? p.player_name,
  player_name: p.player_name,
  position_group: p.position_group,
  predicted_pts: p.proj_pts,
  predicted_reb: p.proj_reb,
  predicted_ast: p.proj_ast,
  predicted_pra: p.proj_pra,
  predicted_min: p.proj_min,
  status: p.status || "ACTIVE",
  assumed_out: Boolean(p.assumed_out),
  importance: p.importance ?? 0,
});

export function normalizeGameFullPrediction(data: GameFullResponse, home: string, away: string, predictionDate: string) {
  return {
    home_team: home,
    away_team: away,
    prediction_date: predictionDate,
    win_probability: {
      predicted_winner: data.win_probability.home_win_prob >= 0.5 ? home : away,
      home_win_probability: data.win_probability.home_win_prob,
      away_win_probability: data.win_probability.away_win_prob,
      confidence_bucket: Math.max(data.win_probability.home_win_prob, data.win_probability.away_win_prob) >= 0.7 ? "STRONG" : "MODERATE",
      model_version: data.win_probability.model_version,
    },
    score_prediction: {
      predicted_home_score: data.score_prediction.home,
      home_score_range: data.score_prediction.home_range,
      predicted_away_score: data.score_prediction.away,
      away_score_range: data.score_prediction.away_range,
      predicted_total_points: data.score_prediction.total,
      total_points_range: data.score_prediction.total_range,
      predicted_margin: data.score_prediction.margin,
      margin_range: data.score_prediction.margin_range,
      score_model_winner: data.score_prediction.margin >= 0 ? home : away,
      model_version: data.score_prediction.model_version,
      confidence_warning: data.score_prediction.confidence_warning,
      predicted_pace: data.score_prediction.predicted_pace,
      predicted_home_off_rtg: data.score_prediction.predicted_home_off_rtg,
      predicted_away_off_rtg: data.score_prediction.predicted_away_off_rtg,
    },
    injury_report: data.injury_report ?? null,
    final_display_recommendation: {
      primary_winner_signal: "WIN_PROB",
    },
    player_predictions: {
      home_players: (data.home_players || []).map(normalizePlayer),
      away_players: (data.away_players || []).map(normalizePlayer),
    },
    explanation: data.explanation,
    is_preseason: Boolean(data.is_preseason),
    season_type: data.season_type || (data.is_preseason ? "Pre Season" : "Regular Season"),
  };
}
