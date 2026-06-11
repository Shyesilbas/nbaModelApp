# Win Probability Model V3 vs V4 Comparative Performance Report

This report evaluates the accuracy of the win probability model before and after resolving the training-vs-inference feature mismatch.

## Performance Metrics Comparison

| Model | Accuracy | ROC-AUC | Brier Score Loss |
|---|---|---|---|
| **Production (Deployed V3)** | 0.6637 | 0.7413 | 0.2073 |
| **Refreshed (Aligned V4)** | 0.6959 | 0.7726 | 0.1926 |
| **Difference / Change** | +0.0322 | +0.0313 | -0.0147 |

## Analysis
1. **Accuracy Gain**: Accuracy improved from **0.6637** to **0.6959**.
2. **Discrimination Capability (ROC-AUC)**: ROC-AUC increased from **0.7413** to **0.7726**, confirming that training on aligned, leakage-free V4 projections yields better probability sorting.
3. **Probability Calibration (Brier Score)**: Brier score loss decreased (improved) from **0.2073** to **0.1926**, confirming that the predicted probabilities are much closer to the true binary outcomes.

## Verdict
The training-vs-inference feature mismatch severely degraded the calibration of the production win probability model. The refreshed model resolved this mismatch, leading to clear, measurable performance gains across all classification metrics.
We recommend promoting the refreshed win model to production.