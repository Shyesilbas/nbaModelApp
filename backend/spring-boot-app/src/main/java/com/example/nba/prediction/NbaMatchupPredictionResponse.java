package com.example.nba.prediction;

public class NbaMatchupPredictionResponse {
    public String home_team;
    public String away_team;
    public String prediction_date;
    public WinProbabilityResult win_probability;
    public ScorePredictionResult score_prediction;
    public PlayerPredictionResult player_predictions;
    public FinalDisplayRecommendation final_display_recommendation;

    public NbaMatchupPredictionResponse() {}

    public static class WinProbabilityResult {
        public String predicted_winner;
        public double home_win_probability;
        public double away_win_probability;
        public String confidence_bucket;
        public String model_version;
        public String error;
    }

    public static class ScorePredictionResult {
        public double predicted_home_score;
        public java.util.List<Double> home_score_range;
        public double predicted_away_score;
        public java.util.List<Double> away_score_range;
        public double predicted_total_points;
        public java.util.List<Double> total_points_range;
        public double predicted_margin;
        public java.util.List<Double> margin_range;
        public String score_model_winner;
        public String note;
        public String model_version;
        public String error;
    }

    public static class FinalDisplayRecommendation {
        public String primary_winner_signal;
        public String displayed_winner;
        public String displayed_score_summary;
        public String displayed_score_range_summary;
        public String warning;
    }

    public static class PlayerPredictionResult {
        public java.util.List<NbaPlayerPredictionClient.PlayerPrediction> home_players;
        public java.util.List<NbaPlayerPredictionClient.PlayerPrediction> away_players;
        public boolean score_model_sync;
        public String error;
    }
}
