package com.example.nba.prediction;

public class NbaWinPredictionRequest {
    public String home_team;
    public String away_team;
    public String prediction_date;

    public NbaWinPredictionRequest() {}

    public NbaWinPredictionRequest(String home_team, String away_team, String prediction_date) {
        this.home_team = home_team;
        this.away_team = away_team;
        this.prediction_date = prediction_date;
    }
}
