package com.example.nba.prediction;

import org.springframework.stereotype.Service;

@Service
public class NbaScorePredictionService {
    private final NbaScorePredictionClient client;

    public NbaScorePredictionService(NbaScorePredictionClient client) {
        this.client = client;
    }

    public NbaScorePredictionResponse predict(NbaScorePredictionRequest req) {
        try {
            return client.callMlService(req);
        } catch (NbaPredictionException e) {
            throw e;
        } catch (Exception e) {
            throw new NbaPredictionException(503, "ML service unavailable: " + e.getMessage());
        }
    }
}
