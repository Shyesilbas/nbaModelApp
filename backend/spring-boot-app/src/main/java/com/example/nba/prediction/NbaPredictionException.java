package com.example.nba.prediction;

public class NbaPredictionException extends RuntimeException {
    private final int status;

    public NbaPredictionException(int status, String message) {
        super(message);
        this.status = status;
    }

    public int getStatus() { return status; }
}
