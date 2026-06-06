package com.example.nba.prediction;

import java.util.List;

public class NbaScorePredictionResponse {
    public String home_team;
    public String away_team;
    public double predicted_home_score;
    public List<Double> home_score_range;
    public double predicted_away_score;
    public List<Double> away_score_range;
    public double predicted_total_points;
    public List<Double> total_points_range;
    public double predicted_margin;
    public List<Double> margin_range;
    public String score_model_winner;
    public String note;
    public String model_version;
    public String prediction_date;
    public String error;

    public NbaScorePredictionResponse() {}
}
