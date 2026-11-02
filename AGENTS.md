# Project Rules — NBA Model App

NBA maçları için makine öğrenmesi tahmin motoru, analitik veri hattı, FastAPI backend ve React/Tailwind arayüzü.

## Uzmanlaşmış Agent Skill'leri (`.agents/skills/`)
Detaylı iş akışları ve standartlar `.agents/skills/` altındadır; ilgili görevlerde mutlaka bu skill'leri oku ve uygula:
- **`quant-model-experiment-and-audit`** (`.agents/skills/quant-model-experiment-and-audit/SKILL.md`): Model deneyleri, özellik ablasyonları, sıfır sızıntı (`shift(1)` ve OOF kalibrasyon), kilitli sezon (`2026-27`), dış sezon skill gate (saf Elo / prior karşılaştırması), bootstrap CI, train-serve paritesi ve rapor/registry güncelleme zinciri.
- **`sports-pipeline-and-paper-trading`** (`.agents/skills/sports-pipeline-and-paper-trading/SKILL.md`): Günlük veri çekme/ETL, BoxScoreTraditionalV3 ilk 5 takibi, SQLite frontend store (`data/frontend_store/season_YYYY_YY.db`), maç öncesi dondurulmuş tahmin kaydı (`paper_ledger_2026_27.jsonl`) ve shadow logging.
- **`restrained-ui-design-standard`** (`.agents/skills/restrained-ui-design-standard/SKILL.md`): Apple/Spotify-tier sade arayüz tasarım kuralları, semantik tokenlar, radius tavanı (`rounded-md`), 4 veri durumu (loading/empty/error/pending) ve iş bitimi zorunlu lint/regex kontrolleri.

## Hızlı Komutlar
- **Uygulamayı Başlat (Backend + Frontend):** `./scripts/start_all.sh` (veya `python3 main.py --serve-api`)
- **Günlük Veri Güncelleme:** `PYTHONPATH=. python3 main.py --update-data`
- **Maç Öncesi Tahmin Kaydı (Paper Trading):** `PYTHONPATH=. python3 scripts/paper_trading_snapshot.py --season 2026-27`
- **Paper Trading Raporu (Elo / son-10 baseline, bootstrap CI):** `PYTHONPATH=. python3 scripts/paper_ledger_report.py --season 2026-27`
- **Walk-Forward Benchmark Raporu:** `PYTHONPATH=. python3 scripts/walk_forward_benchmark.py`
- **Frontend SQLite Store Derleme:** `PYTHONPATH=. python3 scripts/build_frontend_store.py`
- **Testleri Çalıştır:** `PYTHONPATH=. python3 -m pytest tests -q`
- **Frontend Geliştirme & Doğrulama:** `cd frontend && npm run lint:design && npm run build`
- **Veritabanı Sorgulama:** `sqlite3 data/frontend_store/season_2025_26.db "SELECT ... LIMIT 5;"` (`.db` ve `.parquet` dosyalarını asla metin olarak doğrudan okuma).

## Mimari Özeti & Dokümantasyon Haritası
- **Aktif Üretim Modelleri (`models/production/`):**
  - Release `v15` (`config/production_artifacts.yaml`; her `*_metadata.json` aynı sürümü taşır).
  - `win_model.pkl`: 11 özellikli Lojistik Regresyon (Elo farkı, dinlenme, B2B, temiz net rating, `ABS_DIFF`, `MISSING_ROT_MINS_DIFF`, `ROT_CONTINUITY_DIFF`, `ACTIVE_WT_GS_DIFF`).
  - `score_model_*.pkl`: Ridge pace (2 özellik), hücum reytingi (4 özellik her biri), Ridge sayı farkı (11 özellik, WIN girdi seti) ve temporal OOF artık düzeltmeleri; hedefler gerçek sayılardır.
  - `player_model_*.pkl`: 24 özellikli LightGBM (tüm hedeflerde L1 medyan), pozisyon bayrakları, pozisyona izin verilen rakip savunması ve takım rotasyon bağlamı.
- **Referans Belgeler (Tek Kaynak Sırası):**
  1. `ARTIFACT_REGISTRY.md` — Veri, model ve rapor envanteri.
  2. `PROJECT_STATUS.md` — Güncel sezon, model durumu ve bilinen sınırlar.
  3. `docs/reports/models/*.md` — Her modelin kendi mimari, denetim ve reddedilen deney raporu (`win_probability_model.md`, `score_model.md`, `player_props_model.md`).
  4. `docs/reports/nba_models_comprehensive_report.md` — Ana rapor indeksi.
  5. `AI_CONTEXT.md` — Makine okunabilir özet ve veri/API şema kataloğu.
  6. Otomatik raporlar (`reports/evaluation/multi_season_walk_forward_backtest.md` <- `scripts/walk_forward_benchmark.py`, `reports/evaluation/paper_ledger_2026_27.md` <- `scripts/paper_ledger_report.py`) elle düzenlenmez; başlık rakamları bu raporlardan alınır. Model yeniden eğitildiğinde walk-forward raporu yeniden üretilir (`tests/test_docs_consistency.py` sürüm uyuşmazlığını yakalar).

## Kod ve Bağlam Verimliliği
- **Sıfır Emoji:** Kod, yorum satırı, docstring, commit mesajı, UI ve raporlarda kesinlikle emoji kullanma.
- **Nokta Atışı Okuma ve Düzenleme:** Büyük dosyaları tamamen okumak yerine `grep` ve satır aralıklı okuma kullan; veri dosyalarında yalnızca şema veya ilk birkaç satırı incele.
- **Kilitli Sezon:** `2026-27` sezonu sadece prospektif izleme içindir; asla model eğitimi, hiperparametre optimizasyonu veya özellik seçimi için kullanılmaz.
