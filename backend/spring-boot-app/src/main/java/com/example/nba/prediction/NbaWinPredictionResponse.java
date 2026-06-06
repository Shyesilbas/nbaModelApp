package com.example.nba.prediction;

public class NbaWinPredictionResponse {
    public String home_team;
    public String away_team;
    public String predicted_winner;
    public double home_win_probability;
    public double away_win_probability;
    public String confidence_bucket;
    public String model_version;
    public String prediction_date;

    public NbaWinPredictionResponse() {}
}
