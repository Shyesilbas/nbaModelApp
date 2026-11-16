# nbaModelApp Mimari Dokümantasyonu (`/docs`)

Bu dizin, modül README'lerinin ötesine geçen, birden fazla modülü kesen mimari konuları, artifact envanterini ve model tasarım raporlarını içerir. Modül iş kuralları `src/<module>/README.md` ve `frontend/src/<module>/README.md` içindedir.

---

## Doküman Haritası

### Yönetişim, Durum ve Envanter
| Doküman | Kapsam |
| :--- | :--- |
| **[artifact_registry.md](artifact_registry.md)** | Üretim model artifact'ları (`v15`), training veri setleri, frontend SQLite store dosyaları ve denetim envanteri. |
| **[project_status.md](project_status.md)** | Güncel release durumu, kilitli `2026-27` sezon paper trading özeti, bilinen canlı kadro sınırları ve sonraki adımlar. |
| **[reporting_and_validation_guide.md](reporting_and_validation_guide.md)** | Veri tazeliği denetimi, model yapı özetleri, sezon değerlendirme CLI'ları ve drift/leakage kontrol rehberi. |

### Veri Pipeline ve Inference Mimarisi
| Doküman | Kapsam |
| :--- | :--- |
| **[pipeline_overview.md](pipeline_overview.md)** | Uçtan uca ingestion, temizlik, CSV veri katmanı, SQLite frontend store, `shift(1)` feature engineering ve inference akışı. |
| **[early_season_transitions.md](early_season_transitions.md)** | Sezon başındaki ilk 3-6 maçta WIN, SCORE ve PLAYER modellerinin prior handover ve Elo blend mekanizması. |
| **[season_onboarding_guide.md](season_onboarding_guide.md)** | Yeni bir NBA sezonunu sıfırdan ingest etme, kadro/stint çıkarımı, dataset derleme ve store hazırlama runbook'u. |
| **[nba_prediction_integration.md](nba_prediction_integration.md)** | FastAPI ML servisi (`/predict/*`, `/frontend-data-api/*`), servis başlatma, rate limiting ve CORS yapılandırması. |
| **[ai_compact_game_payload.md](ai_compact_game_payload.md)** | LLM context bütçesini koruyan kompakt maç ve boxscore JSON payload formatı. |

### Üretim Model Mimari Raporları
| Doküman | Kapsam |
| :--- | :--- |
| **[reports/nba_models_comprehensive_report.md](reports/nba_models_comprehensive_report.md)** | Üç model ailesinin (`WIN`, `SCORE`, `PLAYER`) uçtan uca sistem mimarisi ve referans indeks raporu. |
| **[reports/models/win_probability_model.md](reports/models/win_probability_model.md)** | 11 özellikli `WIN` lojistik regresyon modeli, `v12` rotasyon ayrıştırması ve walk-forward sonuçları. |
| **[reports/models/score_model.md](reports/models/score_model.md)** | Ridge pace, hücum reytingi, 11 özellikli fark modeli, temporal OOF artık düzeltmesi ve conformal aralıklar. |
| **[reports/models/player_props_model.md](reports/models/player_props_model.md)** | 24 özellikli LightGBM L1 medyan PTS/REB/AST modelleri, pozisyon eşleşmesi ve takım rotasyon bağlamı. |

---

## Üretilmiş Benchmarklar ve Tarihsel Kayıtlar (`/reports`)

Otomatik üretilen değerlendirmeler ve tarih damgalı deney/audit kayıtları [`reports/README.md`](../reports/README.md) altında yönetilir:
- **[multi_season_walk_forward_backtest.md](../reports/evaluation/multi_season_walk_forward_backtest.md)** — 5 sezonluk expanding walk-forward benchmark ve date-block bootstrap güven aralıkları.
- **[paper_ledger_2026_27.md](../reports/evaluation/paper_ledger_2026_27.md)** — Kilitli `2026-27` sezonu prospektif maç öncesi dondurulmuş tahmin karnesi.
- **[model_performance_and_architecture_report.md](../reports/production/model_performance_and_architecture_report.md)** — Aktif model mimarisi, `2026-10-20` denetim değişiklikleri ve bilinen sınırlar.

## Temel Mimari Prensipler

1. **Sıfır Sızıntı (`shift(1)`) ve Train-Serve Parity:** Offline eğitim ve canlı API tahminleri aynı `build_features`, `build_absence_deltas` ve `add_player_matchup_features` fonksiyonlarını kullanır.
2. **Kilitli Sezon Disiplini (`2026-27`):** Aktif sezon yalnızca prospektif paper trading (`paper_ledger_2026_27.jsonl`) içindir; eğitim ve tuning kararlarında kullanılmaz.
3. **Tek Kaynak ve Otomatik Senkronizasyon:** Metrik tabloları `scripts/refresh_reports.py` tarafından JSON raporlardan üretilir; el ile düzenlenmez ve `tests/test_docs_consistency.py` ile doğrulanır.
4. **Atomik Veri Yazımı ve Contract Kontrolü:** Ham ingestion ve frontend SQLite store dosyaları geçici dosyaya yazılıp `os.replace` ile atomik olarak devreye alınır.
