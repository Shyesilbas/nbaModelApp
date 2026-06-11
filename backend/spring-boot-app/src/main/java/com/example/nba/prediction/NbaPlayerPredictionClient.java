package com.example.nba.prediction;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;
import java.util.List;

@Component
public class NbaPlayerPredictionClient {

    private final RestTemplate restTemplate = new RestTemplate();
    private final String mlBaseUrl;

    public NbaPlayerPredictionClient(@Value("${ml.service.base-url}") String mlBaseUrl) {
        this.mlBaseUrl = mlBaseUrl;
    }

    public NbaPlayerPredictionResponse callMlService(NbaScorePredictionRequest req) {
        String url = mlBaseUrl + "/predict/players";
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<NbaScorePredictionRequest> entity = new HttpEntity<>(req, headers);
        try {
            ResponseEntity<NbaPlayerPredictionResponse> resp = restTemplate.postForEntity(url, entity, NbaPlayerPredictionResponse.class);
            if (!resp.getStatusCode().is2xxSuccessful() || resp.getBody() == null) {
                throw new NbaPredictionException(502, "ML service returned status " + resp.getStatusCodeValue());
            }
            return resp.getBody();
        } catch (HttpStatusCodeException ex) {
            String body = ex.getResponseBodyAsString();
            int status = ex.getStatusCode().value();
            if (status >= 400 && status < 500) {
                throw new NbaPredictionException(400, "Invalid request to ML service: " + body);
            }
            throw new NbaPredictionException(502, "ML service error: " + status + " - " + body);
        } catch (RestClientException ex) {
            throw new NbaPredictionException(503, "ML service unavailable: " + ex.getMessage());
        }
    }

    public static class NbaPlayerPredictionResponse {
        public String home_team;
        public String away_team;
        public String prediction_date;
        public List<PlayerPrediction> home_players;
        public List<PlayerPrediction> away_players;
        public boolean score_model_sync;
        public String model_version;
        public String error;
    }

    public static class PlayerPrediction {
        public int player_id;
        public String player_name;
        public String position_group;
        public double predicted_pts;
        public double predicted_reb;
        public double predicted_ast;
        public double predicted_pra;
    }
}
