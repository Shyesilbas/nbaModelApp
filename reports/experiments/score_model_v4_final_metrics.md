# Score Model V4 Final Metrik Raporu

## Regresyon Metrikleri

| Model | MAE | RMSE | R² | MAPE |
|-------|-----|------|----|----- |
| Pace | 3.17 | 3.91 | 0.213 | 3.2% |
| Home Off_Rtg | 9.37 | 11.59 | 0.066 | 8.4% |
| Away Off_Rtg | 9.10 | 11.78 | 0.078 | 8.6% |
| Margin | 13.01 | 16.36 | 0.142 | 120.6% |
| Home Score | 9.42 | 11.95 | 0.073 | 8.4% |
| Away Score | 10.19 | 13.14 | 0.112 | 9.6% |

## Sınıflandırma Metrikleri (Kazanan Tahmini)

- **Accuracy:** 0.667 (66.7%)
- **Precision:** 0.656
- **Recall:** 0.836
- **F1-Score:** 0.735

## V3 vs V4 Karşılaştırması (MAE)

| Metrik | V3 | V4 | Değişim |
|--------|----|----|---------|
| Pace MAE | 3.62 | 3.17 | -0.45 |
| Home Off_Rtg MAE | 9.09 | 9.37 | +0.28 |
| Away Off_Rtg MAE | 9.85 | 9.10 | -0.75 |
| Margin MAE | 11.63 | 13.01 | +1.38 |
| Derived Home Score MAE | 8.17 | 9.42 | +1.25 |
| Derived Away Score MAE | 8.64 | 10.19 | +1.55 |
