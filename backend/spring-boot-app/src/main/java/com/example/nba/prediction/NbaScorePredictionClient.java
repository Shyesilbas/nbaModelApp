package com.example.nba.prediction;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;

@Component
public class NbaScorePredictionClient {

    private final RestTemplate restTemplate = new RestTemplate();
    private final String mlBaseUrl;

    public NbaScorePredictionClient(@Value("${ml.service.base-url}") String mlBaseUrl) {
        this.mlBaseUrl = mlBaseUrl;
    }

    public NbaScorePredictionResponse callMlService(NbaScorePredictionRequest req) {
        String url = mlBaseUrl + "/predict/score";
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<NbaScorePredictionRequest> entity = new HttpEntity<>(req, headers);
        try {
            ResponseEntity<NbaScorePredictionResponse> resp = restTemplate.postForEntity(url, entity, NbaScorePredictionResponse.class);
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
}
