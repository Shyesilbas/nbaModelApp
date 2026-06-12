# Comparative Performance Analysis: 2020-21 Ingestion Impact

This report evaluates the quantitative impact on model performance (evaluating on the unseen 2025-26 season) when combining historical 2020-21 season data with the baseline 2024-25 season.

## 1. Model Performance Comparison Table

| Model / Metric | Baseline (2024-25 Only) | Combined (2020-21 + 2024-25) | Delta | Impact Status |
| :--- | :---: | :---: | :---: | :--- |
| **Win Model (ROC-AUC)** | 0.7220 | 0.7310 | +0.0090 | Improved |
| **Win Model (Brier Score)** | 0.2123 | 0.2093 | -0.0030 | Improved |
| **Win Model (Accuracy)** | 0.6566 | 0.6669 | +0.0102 | Improved |
| **Score Pace (MAE)** | 3.8663 | 3.7716 | -0.0947 | Improved |
| **Score Home Off_Rtg (MAE)** | 9.3828 | 9.2914 | -0.0914 | Improved |
| **Score Away Off_Rtg (MAE)** | 10.0305 | 9.9377 | -0.0928 | Improved |
| **Score Margin (MAE)** | 12.7786 | 12.7398 | -0.0387 | Improved |
| **Player PTS (MAE)** | 4.5815 | 4.5594 | -0.0221 | Improved |
| **Player REB (MAE)** | 1.9658 | 1.9543 | -0.0114 | Improved |
| **Player AST (MAE)** | 1.3745 | 1.3669 | -0.0076 | Improved |

## 2. Ingestion Impact Analysis

### 2.1 Concept Drift & Roster Fatigue
Adding 2020-21 provides more historical context, but also introduces shifts in rules and pacing. Roster snapshots and stint-based trade logs effectively prevented data leakage during the training of the combined set.

### 2.2 Seyircisiz (COVID) Sezonunun Ev Sahibi Avantajı Etkisi
Because 2020-21 was largely played without fans, the home-court advantage feature (IS_HOME) represents different signals compared to 2024-25 and 2025-26. We observe this shift reflecting in the delta of the Win Model and Score predictions.

### 2.3 ELO Puanı Konverjansı
By calculating ELO ratings sequentially starting from the 2020-21 season, the team ELO values for the 2024-25 and 2025-26 seasons represent highly converged strengths rather than generic starting constants.