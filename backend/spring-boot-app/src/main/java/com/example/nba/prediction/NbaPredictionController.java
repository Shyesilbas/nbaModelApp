package com.example.nba.prediction;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/nba/predictions")
public class NbaPredictionController {

    private final NbaPredictionService service;
    private final NbaScorePredictionService scoreService;

    public NbaPredictionController(NbaPredictionService service, NbaScorePredictionService scoreService) {
        this.service = service;
        this.scoreService = scoreService;
    }

    @PostMapping("/win-probability")
    public ResponseEntity<?> predict(@RequestBody NbaWinPredictionRequest req) {
        try {
            NbaWinPredictionResponse resp = service.predict(req);
            return ResponseEntity.ok(resp);
        } catch (NbaPredictionException e) {
            return ResponseEntity.status(e.getStatus()).body(new ErrorResponse(e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(new ErrorResponse("Internal server error"));
        }
    }

    @PostMapping("/score")
    public ResponseEntity<?> predictScore(@RequestBody NbaScorePredictionRequest req) {
        try {
            NbaScorePredictionResponse resp = scoreService.predict(req);
            return ResponseEntity.ok(resp);
        } catch (NbaPredictionException e) {
            return ResponseEntity.status(e.getStatus()).body(new ErrorResponse(e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(new ErrorResponse("Internal server error"));
        }
    }

    @PostMapping("/matchup")
    public ResponseEntity<?> predictMatchup(@RequestParam(defaultValue = "full") String format, @RequestBody NbaWinPredictionRequest req) {
        try {
            if ("compact".equalsIgnoreCase(format)) {
                return ResponseEntity.ok(service.predictMatchupCompact(req));
            }
            NbaMatchupPredictionResponse resp = service.predictMatchup(req);
            return ResponseEntity.ok(resp);
        } catch (NbaPredictionException e) {
            return ResponseEntity.status(e.getStatus()).body(new ErrorResponse(e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(new ErrorResponse("Internal server error"));
        }
    }

    public static record ErrorResponse(String error) {}
}
