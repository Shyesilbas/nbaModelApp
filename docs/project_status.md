# Project Status — NBA Model App

This file tracks the overall status of the project, active releases, and production models.

## Current Release & Phase

**Release: v15** (Active production artifacts: WIN `v15`, SCORE `v15`, PLAYER `v15`).
- WIN model `v12/v15` decouples composite roster absence into pure missing rotation minutes (`MISSING_ROT_MINS_DIFF`), lineup continuity/chemistry (`ROT_CONTINUITY_DIFF`), and active lineup quality (`ACTIVE_WT_GS_DIFF`). All-time best 5-season walk-forward calibration: Brier **`0.2098`** (breaking the 0.2100 threshold) and Log-Loss **`0.6065`** (ECE: **%1.64**).
- SCORE model `v13/v15` incorporates the decoupled rotation features into the Margin model (`score_model_margin.pkl`), reducing 5-season walk-forward Margin MAE from `10.832` to **`10.809`** pts (winning 4 of 5 seasons) and lifting point-spread moneyline accuracy to **`66.67%`** across 6,276 matches.
- PLAYER model `v15` adopts unified L1 median objectives across all props (`pts`, `reb`, `ast`) and tree regularization, reducing 5-season walk-forward PTS MAE to **`4.460`** pts, REB MAE to **`1.864`** pts, and AST MAE to **`1.279`** pts across 140,378 player-game rows (winning 100% of the 5 unseen seasons).
- 100% train-serve parity guaranteed between training datasets and live match pre-game features across all three model families.

---

## Active Production Models

| Model | Artifact | Status | Release | Architecture & Features |
|---|---|:---:|:---:|---|
| **WIN** | `models/production/win_model.pkl` | **ACTIVE** | **v15** | Uncalibrated Logistic Regression, 11 features (Elo diff, home, clean net rtg diff, win-rate diff, rest diff, B2B flags, `ABS_DIFF`, `MISSING_ROT_MINS_DIFF`, `ROT_CONTINUITY_DIFF`, `ACTIVE_WT_GS_DIFF`) |
| **SCORE** | `models/production/score_model_*.pkl` | **ACTIVE** | **v15** | Ridge pace (2 feats), Off-Rtg (4 feats each), Ridge margin on 11 features (WIN inputs + rotation continuity), Ridge residual corrections; actual-point targets |
| **PLAYER** | `models/production/player_model_*.pkl` | **ACTIVE** | **v15** | LightGBM per target with unified L1 median objectives, 24 explicit features (16 form/role + 5 opponent allowances + 3 team rotation context features) |

All three model families are trained on 2020-21 through 2025-26. 
Expanding walk-forward evaluation across 5 unseen seasons (`2021-22` to `2025-26`):
- **WIN**: Brier **`0.2098`** (vs Elo baseline `0.2158`), Log-Loss **`0.6065`**, ROC-AUC **`0.7217`**, Accuracy **`66.30%`** (6,276 games).
- **SCORE**: Total MAE **`14.85 pts`** (vs last-10 `14.95 pts`), Margin MAE **`10.809 pts`** (vs last-10 `11.41 pts`), Winner Accuracy **`66.67%`**, Conformal 80% coverage **`80.5%`** (6,276 games).
- **PLAYER**: PTS MAE **`4.460`** (vs EMA-10 `4.632`), REB MAE **`1.864`** (vs EMA-10 `1.927`), AST MAE **`1.279`** (vs EMA-10 `1.332`) (140,378 rows, won 100% of seasons).

---

## Completed Milestones

- [X] Decoupled rotation continuity, missing minutes and lineup Game Score weighting engineered (`v12`).
- [X] WIN model promoted with 5-season walk-forward validation and paired bootstrap significance audit ($P=96.72\%$).
- [X] SCORE margin model enhanced with decoupled rotation features, reducing Margin MAE to `10.809` pts and promoted to `v13`.
- [X] PLAYER models enhanced with team rotation context, cutting PTS MAE to `4.461`, REB MAE to `1.884`, AST MAE to `1.306` across 140,378 games (`v14`).
- [X] PLAYER models promoted with unified L1 median objectives, cutting REB MAE to `1.864` and AST MAE to `1.279` across 140k games (`v15`).
- [X] Train-serve parity guaranteed across `build_absence_deltas` and `live_roster_metrics` for team and player pipelines.
- [X] Continuous Elo engine scale alignment between training and live inference.
- [X] Garbage-time cleaned net rating (`CLEAN_NET_RTG_DIFF_LAST_10`) integrated into production.
- [X] Role-conditional starter minutes model (`src/features/starter_history.py`) and BoxScoreTraditionalV3 starters ingestion.
- [X] Pre-tip paper trading snapshot runner (`scripts/paper_trading_snapshot.py`) freezing pre-game calls into `paper_ledger_2026_27.jsonl`.
- [X] Early-season prior handover transitions (6 games for SCORE, 3 games for PLAYER, roster span for WIN).
- [X] Comprehensive test suite (298/298 tests passing).

---

## Next Steps

1. **2026-27 Kilitli Sezon Paper Trading İzleme**: Gerçek maç önü tahmin defterinin (`paper_ledger_2026_27.jsonl`) drift ve doğruluk takibi.
2. **Frontend Rotasyon ve Oyuncu Kartı Gösterimi**: Maç önü kartlarında ilk 5 ve ana rotasyon devamlılık skorunun ve oyuncu projeksiyonlarının Apple/Spotify sadeliğinde arayüze yansıtılması.
