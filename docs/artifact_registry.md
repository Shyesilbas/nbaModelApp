# Artifact Registry — NBA Model App

> **Canonical Source of Truth** for all data, model, and report paths. Never overwrite production paths listed here without explicit user approval.

---

## 1. Production Model Artifacts

| Model Family | Artifact Path | Release / Ver | Features / Spec | Status | Rapor / Doküman |
|---|---|---|---|:---:|---|
| **WIN Probability** | `models/production/win_model.pkl` | **v15** | 11 özellik (Lojistik Regresyon) | **ACTIVE** | [`docs/reports/models/win_probability_model.md`](docs/reports/models/win_probability_model.md) |
| **WIN Feature List** | `models/production/win_features.json` | **v15** | 11 özellik listesi | **ACTIVE** | [`config/features/win.yaml`](config/features/win.yaml) |
| **WIN Metadata** | `models/production/win_metadata.json` | **v15** | Eğitim tarihi, CV ve holdout metrikleri | **ACTIVE** | [`models/production/win_metadata.json`](models/production/win_metadata.json) |
| **SCORE Home Rtg** | `models/production/score_model_home_rtg.pkl` | **v15** | RidgeCV (4 özellik: Off Rtg, Opp Def Rtg, Abs Delta) | **ACTIVE** | [`docs/reports/models/score_model.md`](docs/reports/models/score_model.md) |
| **SCORE Away Rtg** | `models/production/score_model_away_rtg.pkl` | **v15** | RidgeCV (4 özellik: Away Off Rtg, Opp Def Rtg, Abs Delta) | **ACTIVE** | [`docs/reports/models/score_model.md`](docs/reports/models/score_model.md) |
| **SCORE Pace** | `models/production/score_model_pace.pkl` | **v15** | RidgeCV (2 özellik: Pace, Opp Pace) | **ACTIVE** | [`docs/reports/models/score_model.md`](docs/reports/models/score_model.md) |
| **SCORE Margin** | `models/production/score_model_margin.pkl` | **v15** | RidgeCV (11 özellik: WIN seti + rotasyon devamlılığı) | **ACTIVE** | [`docs/reports/models/score_model.md`](docs/reports/models/score_model.md) |
| **SCORE Residuals** | `models/production/score_model_ridge_total.pkl` / `margin.pkl` | **v15** | Temporal OOF artık düzeltmesi | **ACTIVE** | [`docs/reports/models/score_model.md`](docs/reports/models/score_model.md) |
| **SCORE Metadata** | `models/production/score_metadata.json` | **v15** | Metrikler ve conformal eşikleri | **ACTIVE** | [`models/production/score_metadata.json`](models/production/score_metadata.json) |
| **PLAYER PTS** | `models/production/player_model_pts.pkl` | **v15** | LightGBM L1 (24 özellik: form + rotasyon + leaves=20) | **ACTIVE** | [`docs/reports/models/player_props_model.md`](docs/reports/models/player_props_model.md) |
| **PLAYER REB** | `models/production/player_model_reb.pkl` | **v15** | LightGBM L1 (24 özellik: form + rotasyon + medyan L1) | **ACTIVE** | [`docs/reports/models/player_props_model.md`](docs/reports/models/player_props_model.md) |
| **PLAYER AST** | `models/production/player_model_ast.pkl` | **v15** | LightGBM L1 (24 özellik: form + rotasyon + medyan L1) | **ACTIVE** | [`docs/reports/models/player_props_model.md`](docs/reports/models/player_props_model.md) |
| **PLAYER Features** | `models/production/player_features.pkl` | **v15** | 24 özellik listesi | **ACTIVE** | [`config/features/player.yaml`](config/features/player.yaml) |
| **PLAYER Metadata** | `models/production/player_metadata.json` | **v15** | MAE metrikleri ve hiperparametreler | **ACTIVE** | [`models/production/player_metadata.json`](models/production/player_metadata.json) |

---

## 2. Core Datasets & Processing Layer

| Dataset | Yol | Satır / Boyut | Rolü |
|---|---|---:|---|
| **Takım Model Verisi (V3)** | `data/training/team_model_ready_{YYYY_YY}.csv` | 2.500+ / sezon | Continuous Elo, Dean Oliver Four Factors, Kadro Devamlılığı ve Ayrıştırılmış Eksik Dakika (`v12`) |
| **Oyuncu Model Verisi (V4)** | `data/training/player_model_ready.csv` | 165.988 satır | 6 sezonluk oyuncu form, kullanım, pozisyon ve rakip izin özellikleri |
| **Sezonluk Takım Özellikleri** | `data/season={YYYY-YY}/features/team_features.csv` | Sezonluk | Maç öncesi `shift(1)` taktiksel ve tempo özellikleri |
| **Sezonluk Oyuncu Özellikleri** | `data/season={YYYY-YY}/features/player_features.csv` | Sezonluk | Maç öncesi oyuncu form ve dakika özellikleri |
| **İlk 5 / Starter Bayrakları** | `data/season={YYYY-YY}/raw/player_starters.csv` | Maç başı 10 satır | BoxScoreTraditionalV3 teyitli ilk 5 oyuncuları |
| **Kadro Analizi & Çekirdek** | `data/season={YYYY-YY}/analysis/core_players.csv` | Takım başı | Takımların ana rotasyon oyuncuları |
| **Açılış Elo Puanları** | `data/season=2026-27/analysis/team_elo_initial.json` | 30 takım | Önceki sezon zinciri + 2 sezonluk yetenek düzeltmesi |

---

## 3. Frontend Store & Servis Veritabanları

| Depo | Yol | Durum | Açıklama |
|---|---|:---:|---|
| **Sezon SQLite Veritabanı** | `data/frontend_store/season_{YYYY_YY}.db` | **ACTIVE** | Maçlar, detaylı kutu istatistikleri, oyuncu formları ve PBP anları |
| **Küresel SQLite Veritabanı** | `data/frontend_store/global.db` | **ACTIVE** | Oyuncu profilleri, takas geçmişi ve lig geneli özetler |
| **Canlı Tahmin Kaydı** | `data/predictions/shadow_predictions.jsonl` | **ACTIVE** | API'den üretilen canlı maç öncesi tahmin kayıtları |
| **Paper Trading Defteri** | `data/predictions/paper_ledger_2026_27.jsonl` | **ACTIVE** | 2026-27 kilitli sezon maç öncesi dondurulmuş tahminler |

---

## 4. Rapor ve Denetim Envanteri

| Rapor | Yol | Kapsam |
|---|---|---|
| **Kapsamlı Ana Rapor** | [`docs/reports/nba_models_comprehensive_report.md`](docs/reports/nba_models_comprehensive_report.md) | Sistem mimarisi, model aileleri ve entegrasyon |
| **Model Benchmark Karnesi** | [`docs/reports/model_benchmarks.md`](docs/reports/model_benchmarks.md) | 5 sezonluk expanding walk-forward sonuçları |
| **WIN Modeli Raporu** | [`docs/reports/models/win_probability_model.md`](docs/reports/models/win_probability_model.md) | Release `v12` 11 özellikli WIN modeli denetimi |
| **SCORE Modeli Raporu** | [`docs/reports/models/score_model.md`](docs/reports/models/score_model.md) | Tempo, hücum reytingi ve fark modelleri |
| **PLAYER Modeli Raporu** | [`docs/reports/models/player_props_model.md`](docs/reports/models/player_props_model.md) | PTS/REB/AST modelleri ve rakip izinleri |
| **Rotasyon Ayrıştırma Deneyi**| [`reports/backtests/2026-10-25_win_rotation_continuity/README.md`](reports/backtests/2026-10-25_win_rotation_continuity/README.md) | `v12` rotasyon devamlılığı ve eksik dakika deneyi |
| **Kadro Elo Düzeltme Deneyi** | [`reports/backtests/2026-10-24_roster_elo_adjustment/README.md`](reports/backtests/2026-10-24_roster_elo_adjustment/README.md) | Açılış Elo kadro yetenek düzeltmesi analizi |
| **Erken Sezon Geçiş Raporu** | [`docs/early_season_transitions.md`](docs/early_season_transitions.md) | Sezon başı prior devir kuralları |
