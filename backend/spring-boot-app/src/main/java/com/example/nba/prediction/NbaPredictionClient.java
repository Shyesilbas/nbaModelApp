package com.example.nba.prediction;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;

@Component
public class NbaPredictionClient {

    private final RestTemplate restTemplate = new RestTemplate();
    private final String mlBaseUrl;

    public NbaPredictionClient(@Value("${ml.service.base-url}") String mlBaseUrl) {
        this.mlBaseUrl = mlBaseUrl;
    }

    public NbaWinPredictionResponse callMlService(NbaWinPredictionRequest req) {
        String url = mlBaseUrl + "/predict/win-probability";
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<NbaWinPredictionRequest> entity = new HttpEntity<>(req, headers);
        try {
            ResponseEntity<NbaWinPredictionResponse> resp = restTemplate.postForEntity(url, entity, NbaWinPredictionResponse.class);
            if (!resp.getStatusCode().is2xxSuccessful() || resp.getBody() == null) {
                throw new NbaPredictionException(502, "ML service returned status " + resp.getStatusCodeValue());
            }
            return resp.getBody();
        } catch (HttpStatusCodeException ex) {
            String body = ex.getResponseBodyAsString();
            int status = ex.getStatusCode().value();
            if (status >= 400 && status < 500) {
                // Client error -> likely invalid request (e.g., date format)
                throw new NbaPredictionException(400, "Invalid request to ML service: " + body);
            }
            throw new NbaPredictionException(502, "ML service error: " + status + " - " + body);
        } catch (RestClientException ex) {
            throw new NbaPredictionException(503, "ML service unavailable: " + ex.getMessage());
        }
    }
}
