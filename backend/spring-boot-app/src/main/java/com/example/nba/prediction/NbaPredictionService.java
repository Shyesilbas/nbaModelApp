package com.example.nba.prediction;

import org.springframework.stereotype.Service;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class NbaPredictionService {
    private final NbaPredictionClient client;
    private final NbaScorePredictionClient scoreClient;

    public NbaPredictionService(NbaPredictionClient client, NbaScorePredictionClient scoreClient) {
        this.client = client;
        this.scoreClient = scoreClient;
    }

    public NbaWinPredictionResponse predict(NbaWinPredictionRequest req) {
        try {
            return client.callMlService(req);
        } catch (NbaPredictionException e) {
            throw e;
        } catch (Exception e) {
            throw new NbaPredictionException(503, "ML service unavailable: " + e.getMessage());
        }
    }

    public NbaMatchupPredictionResponse predictMatchup(NbaWinPredictionRequest req) {
        NbaMatchupPredictionResponse resp = new NbaMatchupPredictionResponse();
        resp.home_team = req.home_team.toUpperCase();
        resp.away_team = req.away_team.toUpperCase();
        resp.prediction_date = req.prediction_date;

        NbaWinPredictionResponse winResp = null;
        String winError = null;
        try {
            winResp = client.callMlService(req);
        } catch (NbaPredictionException e) {
            if (e.getStatus() == 400) {
                throw e; // validation error
            }
            winError = e.getMessage();
        } catch (Exception e) {
            winError = e.getMessage();
        }

        NbaScorePredictionResponse scoreResp = null;
        String scoreError = null;
        try {
            NbaScorePredictionRequest scoreReq = new NbaScorePredictionRequest(req.home_team, req.away_team, req.prediction_date);
            scoreResp = scoreClient.callMlService(scoreReq);
        } catch (NbaPredictionException e) {
            if (e.getStatus() == 400) {
                throw e; // validation error
            }
            scoreError = e.getMessage();
        } catch (Exception e) {
            scoreError = e.getMessage();
        }

        if (winResp == null && scoreResp == null) {
            throw new NbaPredictionException(503, "Both win probability and score models failed. Win: " + winError + "; Score: " + scoreError);
        }

        if (winResp != null) {
            resp.win_probability = new NbaMatchupPredictionResponse.WinProbabilityResult();
            resp.win_probability.predicted_winner = winResp.predicted_winner;
            resp.win_probability.home_win_probability = winResp.home_win_probability;
            resp.win_probability.away_win_probability = winResp.away_win_probability;
            resp.win_probability.confidence_bucket = winResp.confidence_bucket;
            resp.win_probability.model_version = winResp.model_version;
        } else {
            resp.win_probability = new NbaMatchupPredictionResponse.WinProbabilityResult();
            resp.win_probability.error = winError;
        }

        if (scoreResp != null) {
            resp.score_prediction = new NbaMatchupPredictionResponse.ScorePredictionResult();
            resp.score_prediction.predicted_home_score = scoreResp.predicted_home_score;
            resp.score_prediction.home_score_range = scoreResp.home_score_range;
            resp.score_prediction.predicted_away_score = scoreResp.predicted_away_score;
            resp.score_prediction.away_score_range = scoreResp.away_score_range;
            resp.score_prediction.predicted_total_points = scoreResp.predicted_total_points;
            resp.score_prediction.total_points_range = scoreResp.total_points_range;
            resp.score_prediction.predicted_margin = scoreResp.predicted_margin;
            resp.score_prediction.margin_range = scoreResp.margin_range;
            resp.score_prediction.score_model_winner = scoreResp.score_model_winner;
            resp.score_prediction.note = scoreResp.note;
            resp.score_prediction.model_version = scoreResp.model_version;
        } else {
            resp.score_prediction = new NbaMatchupPredictionResponse.ScorePredictionResult();
            resp.score_prediction.error = scoreError;
        }

        resp.final_display_recommendation = new NbaMatchupPredictionResponse.FinalDisplayRecommendation();
        resp.final_display_recommendation.warning = "Predictions are estimates and not guaranteed outcomes.";

        if (winResp != null && scoreResp != null) {
            resp.final_display_recommendation.primary_winner_signal = "win_probability";
            resp.final_display_recommendation.displayed_winner = winResp.predicted_winner;
            resp.final_display_recommendation.displayed_score_summary = String.format("%s %d - %s %d",
                resp.home_team, Math.round(scoreResp.predicted_home_score),
                resp.away_team, Math.round(scoreResp.predicted_away_score));
            resp.final_display_recommendation.displayed_score_range_summary = String.format("%s %d-%d, %s %d-%d",
                resp.home_team, Math.round(scoreResp.home_score_range.get(0)), Math.round(scoreResp.home_score_range.get(1)),
                resp.away_team, Math.round(scoreResp.away_score_range.get(0)), Math.round(scoreResp.away_score_range.get(1)));
        } else if (winResp != null) {
            resp.final_display_recommendation.primary_winner_signal = "win_probability";
            resp.final_display_recommendation.displayed_winner = winResp.predicted_winner;
            resp.final_display_recommendation.displayed_score_summary = "Score prediction unavailable";
            resp.final_display_recommendation.displayed_score_range_summary = "Score range unavailable";
            resp.final_display_recommendation.warning += " (Score model prediction failed: " + scoreError + ")";
        } else {
            resp.final_display_recommendation.primary_winner_signal = "score_model";
            resp.final_display_recommendation.displayed_winner = scoreResp.score_model_winner;
            resp.final_display_recommendation.displayed_score_summary = String.format("%s %d - %s %d",
                resp.home_team, Math.round(scoreResp.predicted_home_score),
                resp.away_team, Math.round(scoreResp.predicted_away_score));
            resp.final_display_recommendation.displayed_score_range_summary = String.format("%s %d-%d, %s %d-%d",
                resp.home_team, Math.round(scoreResp.home_score_range.get(0)), Math.round(scoreResp.home_score_range.get(1)),
                resp.away_team, Math.round(scoreResp.away_score_range.get(0)), Math.round(scoreResp.away_score_range.get(1)));
            resp.final_display_recommendation.warning += " (Win probability prediction failed: " + winError + ")";
        }

        return resp;
    }

    public Map<String, Object> predictMatchupCompact(NbaWinPredictionRequest req) {
        NbaMatchupPredictionResponse resp = predictMatchup(req);
        Map<String, Object> compact = new LinkedHashMap<>();
        compact.put("home", resp.home_team);
        compact.put("away", resp.away_team);
        compact.put("date", resp.prediction_date);

        if (resp.win_probability != null) {
            Map<String, Object> win = new LinkedHashMap<>();
            win.put("w", resp.win_probability.predicted_winner);
            win.put("hp", resp.win_probability.home_win_probability);
            win.put("ap", resp.win_probability.away_win_probability);
            win.put("cb", resp.win_probability.confidence_bucket);
            win.put("mv", resp.win_probability.model_version);
            if (resp.win_probability.error != null) win.put("e", resp.win_probability.error);
            compact.put("win", win);
        }

        if (resp.score_prediction != null) {
            Map<String, Object> score = new LinkedHashMap<>();
            score.put("hs", resp.score_prediction.predicted_home_score);
            score.put("hR", resp.score_prediction.home_score_range);
            score.put("as", resp.score_prediction.predicted_away_score);
            score.put("aR", resp.score_prediction.away_score_range);
            score.put("tp", resp.score_prediction.predicted_total_points);
            score.put("tR", resp.score_prediction.total_points_range);
            score.put("m", resp.score_prediction.predicted_margin);
            score.put("mR", resp.score_prediction.margin_range);
            score.put("w", resp.score_prediction.score_model_winner);
            score.put("n", resp.score_prediction.note);
            score.put("mv", resp.score_prediction.model_version);
            if (resp.score_prediction.error != null) score.put("e", resp.score_prediction.error);
            compact.put("score", score);
        }

        if (resp.final_display_recommendation != null) {
            Map<String, Object> display = new LinkedHashMap<>();
            display.put("s", resp.final_display_recommendation.primary_winner_signal);
            display.put("w", resp.final_display_recommendation.displayed_winner);
            display.put("ss", resp.final_display_recommendation.displayed_score_summary);
            display.put("rs", resp.final_display_recommendation.displayed_score_range_summary);
            display.put("warn", resp.final_display_recommendation.warning);
            compact.put("display", display);
        }

        return compact;
    }
}
