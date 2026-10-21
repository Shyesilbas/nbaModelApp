# NBA Veri Toplama, İşleme ve Sezon Bootstrapping Mimarisi Araştırma Raporu

Bu rapor, NBA model tahmin uygulamasının (nbaModelApp) veri toplama, roster takibi, core player belirleme, takas günlüğü (trade log) çıkarma ve yeni sezon ekleme (bootstrapping) süreçlerinin teknik detaylarını, kod mimarisini ve iyileştirme önerilerini içermektedir.

---

## 1. Veri Toplama (Data Ingestion) Mimarisi

Sistemin veri toplama katmanı [src/ingestion/](../../src/ingestion) dizininde yer alır ve resmi NBA API'si ile entegredir. Veriler üç ana akışla toplanır:

1. **Schedule (Fikstür) Güncelleme**:
   - [src/ingestion/schedule_fetcher.py](../../src/ingestion/schedule_fetcher.py) modülü, NBA API (`ScheduleLeagueV2` ve `ScoreboardV3` API'leri) üzerinden hem normal sezon hem de final fikstürlerini çeker. Çekilen bu veriler sezon bazlı olarak `data/season={YYYY-YY}/raw/schedule.csv` altında saklanır.
   - [src/ingestion/schedule_loader.py](../../src/ingestion/schedule_loader.py) modülü, bu ham fikstürleri birleştirerek tamamlanmış ve gelecek maçları etiketler.

2. **Team Game Logs (Takım Maç Verileri)**:
   - [src/ingestion/team_games_fetcher.py](../../src/ingestion/team_games_fetcher.py) modülü tarafından yönetilir.
   - **Toplu Veri Çekimi (Bulk Ingest)**: `LeagueGameLog` API endpoint'i kullanılarak ilgili sezonun tüm takım verileri tek seferde indirilir.
   - **Artımlı Veri Çekimi (Incremental Ingest)**: Günlük veri güncellemelerinde tüm sezonu tekrar indirmemek ve NBA API'nin rate limit sınırlarına takılmamak için sadece eksik olan `GAME_ID`'ler tespit edilir. Bu eksik maçlar, multi-threading (`ThreadPoolExecutor`) kullanılarak `BoxScoreTraditionalV3` (ve geri çekilme/fallback olarak `V2`) üzerinden paralel olarak çekilir ve `data/season={YYYY-YY}/raw/team_games.csv` dosyasına eklenerek deduplicate (tekilleştirme) edilir.

3. **Player Game Logs (Oyuncu Maç Verileri)**:
   - [src/ingestion/player_games_fetcher.py](../../src/ingestion/player_games_fetcher.py) modülü tarafından yönetilir.
   - Takım verilerine benzer şekilde çalışır. Eksik maçlardaki oyuncu istatistikleri `BoxScoreTraditionalV3` (ve fallback olarak `V2`) üzerinden çekilir. Süre almayan (DNP - Did Not Play, Inactive) oyuncular filtrelenir ve veriler `data/season={YYYY-YY}/raw/player_games.csv` altına append edilir.
   - **Starter bayrakları**: `LeagueGameLog` starter bilgisi taşımaz. [src/ingestion/starters_fetcher.py](../../src/ingestion/starters_fetcher.py), `BoxScoreTraditionalV3` içinde yalnızca ilk beşte `position` dolu olmasından yararlanarak maç başı starter bayrağını sezonun raw dizinine append-only yazar. `--update-data` akışı eksik maçlar için bunu otomatik çağırır; geçmiş sezonlar için [scripts/backfill_starters.py](../../scripts/backfill_starters.py) kullanılır.

4. **API Hız Sınırları ve Güvenlik**:
   - Tüm API çağrıları [src/ingestion/nba_api_client.py](../../src/ingestion/nba_api_client.py) üzerinden yapılır.
   - Akamai CDN bloklarını aşmak amacıyla her istek arasına **0.6 - 1.2 saniye rastgele gecikme (jittered sleep)** eklenir. İsteklerin başarısız olması durumunda **üstel geri çekilme (exponential backoff)** algoritmasıyla 5 kez yeniden deneme yapılır.

5. **Play-by-Play Cache Üretimi**:
   - [scripts/build_play_by_play.py](../../scripts/build_play_by_play.py) CLI aracı, NBA API `PlayByPlayV3` endpoint'inden maç olaylarını çeker ve `data/season=YYYY-YY/raw/play_by_play/{GAME_ID}.json` olarak saklar. Maç listesi ve metadata pipeline verisinden (`schedule_combined` + `game_results`) okunur.
   - CLI iki ana modda çalışır:
     ```bash
     PYTHONPATH=. python3 scripts/build_play_by_play.py --game-id 0042500405
     PYTHONPATH=. python3 scripts/build_play_by_play.py --season 2025-26 --season-type "NBA Finals" --dry-run
     ```
   - Mevcut cache dosyaları varsayılan olarak atlanır; `--force`, `--sleep`, `--limit` seçenekleri vardır.
   - JSON kontratı: `game_id`, `home_team`, `away_team`, `quarter_scores` ve `events` (period, clock, action type, oyuncu, skor, running player totals, assist metadata, milestone badge'leri).
   - Frontend ham dosyayı değil, frontend store'un (`src/frontend_store/pbp_moments.py`) ürettiği sıkıştırılmış "moments" halini `/frontend-data-api/play-by-play/{GAME_ID}` üzerinden alır. Frontend'e kopya yazılmaz.

---

## 2. Sezon Yönetimi ve Yapılandırma

Sistemde sezon bazlı parametreler ve dosya yolları dinamik olarak yönetilir:

1. **Season Path Resolver**:
   - [src/core/data_paths.py](../../src/core/data_paths.py) içinde bulunan `get_data_paths(season)` fonksiyonu, sistemin tek dosya yolu yöneticisidir.
   - [config/data_sources.yaml](../../config/data_sources.yaml) içindeki tanımlara göre `data/raw/`, `data/processed/` ve `data/features/` dizinlerinin yollarını belirler. Sezon ismini (örn: `2024-25`) dosya token'ına (örn: `2024_25`) dönüştürerek dinamik dosya yolları oluşturur.
   - [src/core/season_utils.py](../../src/core/season_utils.py) sezon formatlarını normalize eder (örn: `2024-2025` veya `2024_25` girdilerini `2024-25` standardına getirir). Ayrıca veri kümelerine yanlış sezon verilerinin karışmasını engellemek için tarih ve `GAME_ID` prefix doğrulamaları yapar.

2. **Yeni Sezon Bootstrapping**:
   - Yeni bir sezon eklemek veya mevcut sezonu sıfırdan kurmak için tek bir CLI komutu kullanılır:
     ```bash
     python3 main.py --season YYYY-YY --bootstrap-season
     ```
   - Bu komut [src/orchestration/pipeline_workflows.py](../../src/orchestration/pipeline_workflows.py) içindeki `run_bootstrap_season_pipeline` fonksiyonunu tetikler ve sırasıyla şu işlemleri gerçekleştirir:
     1. Ham takım ve oyuncu özelliklerini senkronize eder (`sync_features`).
     2. Maç sonuçlarını ve kutu istatistiklerini yeniden üretir (`rebuild_game_results`).
     3. Rakip uyumlu V2 veri setini oluşturur (`run_build_enhanced_v2`).
     4. Veri tazeliğini (`DataFreshnessService`) denetler ve rapor üretir.
     5. Frontend export'larını sezon bazlı olarak yazılır (`export_data`).
     6. Başarılı bootstrap sonrasında [data/manifests/](../../data/manifests) dizinine o sezona ait tüm üretilen dosyaları ve durum bilgilerini içeren bir manifest JSON dosyası yazar.
   - **v3 eğitim veri seti (2026-10-21)**: Bootstrap, v2'den sonra sezonun `team_model_ready_v3` dosyasını da üretir (`scripts/rebuild_training_data.py::rebuild_season` + `enrich_v3_boxscore_features.enrich_all_seasons([season])`). `--update-data` bunu her gün tekrarlar. Sezonlar arası `player_model_ready_v4_usg` ise `scripts/rebuild_training_data.py` ile üretilir.
   - **Sezon içi görünüm yenileme**: [scripts/refresh_current_season_views.py](../../scripts/refresh_current_season_views.py) devam eden sezon için canlı roster'ı ([src/analysis/live_roster_refresh.py](../../src/analysis/live_roster_refresh.py) → `analysis/team_rosters_live.csv`), frontend JSON'ları, oyuncu profillerini ve opsiyonel olarak SQLite store'u yeniden üretir. `--update-data` sonunda otomatik çalışır. Canlı roster yalnızca frontend export'larında kullanılır; model girdisi olan bootstrap roster (`analysis/team_rosters.csv`) değiştirilmez.

---

## 3. Core Player Belirleme Mekanizması

Oyuncu sakatlıklarının veya kadro değişikliklerinin takım gücüne etkisini ölçmek için sistem her takımın "Core" (Çekirdek) oyuncularını veri odaklı olarak belirler.

1. **Importance Score (Önem Skoru)**:
   - [src/analysis/roster_analysis.py](../../src/analysis/roster_analysis.py) modülü, oyuncunun maç başı istatistiklerini (MIN, PTS, AST, REB) kullanarak bir önem skoru hesaplar:
     $$\text{Importance Score} = (\text{AVG\_MIN} \times 0.5) + (\text{AVG\_PTS} \times 1.0) + (\text{AVG\_AST} \times 0.8) + (\text{AVG\_REB} \times 0.6)$$
   - Bu formülde en yüksek ağırlık skor üretimine (PTS) ve pas dağıtımına (AST) verilmiştir.

2. **Sıralama ve Kategorizasyon**:
   - Her takımın oyuncuları bu skora göre büyükten küçüğe sıralanır.
   - **Ranks 1 - 3**: `IS_TOP3_CORE` olarak etiketlenir (Takımın ana yıldızları).
   - **Ranks 4 - 5**: `IS_TOP5_CORE` (fakat top 3 dışı) olarak etiketlenir (İkincil rotasyon elemanları).
   - Sonuçlar [data/production/core_players.csv](../../data/production/core_players.csv) dosyasına yazılır.

3. **Model Feature'ı Olarak Core Availability (2026-10-21'de yeniden yazıldı)**:
   - Yukarıdaki sezon sonu listesi yalnızca raporlar ve frontend için kullanılır. Model feature'ları ([src/features/core_player_availability_features.py](../../src/features/core_player_availability_features.py)) artık her maç için core listesini **yalnızca o maçtan önceki** bilgiyle seçer:
     - aday: takımın son 20 maçının en az 3'ünde oynamış ve bu maçtan önceki son maçını bu takımda oynamış oyuncu (takas edilen oyuncu eski takımın core'undan düşer);
     - sıralama: aynı importance formülü, bu 20 maçlık pencerede oynanan maçların ortalamasıyla.
   - `*_PLAYED_COUNT` oyuncunun bu maçta oynayıp oynamadığını kullanır (`ABS_DELTA` ile aynı varsayım: maç öncesi sakatlık raporundan bilinir). `*_MINUTES_SUM` artık bu maçın gerçek dakikası değil, oynayan core oyuncuların **beklenen** (pencere ortalaması) dakikasıdır.
   - Eski sürüm sezonun tamamından core seçiyor ve aynı maçın gerçek dakikasını kullanıyordu; `tests/test_core_player_availability.py` bu iki sızıntıyı test eder (eski kod "bu maçın dakikası değişirse feature değişmemeli" testinde 90 → 15 değişiyordu).
   - Bu feature'ları kullanan SCORE v9/v10 modelleri 2026-10-04'te `models/production/replaced_leaky/` altına taşınmıştı; aktif üretim modelleri (WIN v10, SCORE v10, PLAYER v9) bu kolonları kullanmaz. Veri setleri yeni kodla yeniden üretildi; walk-forward benchmark sonuçları birebir aynı kaldı.

---

## 4. Trade Log ve Roster Snapshot Pipeline

Oyuncuların sezon içinde takım değiştirmesi (Trade, Waiver, Release), statik bir kadro listesiyle analiz yapıldığında **veri sızıntısına (data leakage)** yol açar. Örn: Bir oyuncu Ocak ayında A takımından B takımına takas edildiyse, Kasım ayındaki A takımı maçlarının tahmininde o oyuncunun varlığı veya yokluğu hesaplanmamalıdır.

Sistem bu sorunu şu şekilde çözer:

1. **İşlem Günlüğü (Transactions Log) Durumu**:
   - [src/ingestion/ingest_transactions.py](../../src/ingestion/ingest_transactions.py) resmi NBA Player Movement feed'ini `data/transactions/player_movement.csv` dosyasına indirir; [scripts/ingest/ingest_espn_transactions.py](../../scripts/ingest/ingest_espn_transactions.py) ESPN hareket listesini `espn_transactions.csv` olarak tamamlar.
   - Feed `--update-data` akışında (Step 9a) her gün yenilenir.
   - [src/analysis/roster_transactions.py](../../src/analysis/roster_transactions.py) feed'deki Trade / Signing / AwardOnWaivers / Waive hareketlerini sezon roster'ına uygular. Canlı oyuncu tahmini (`src/api/services/player_projection.py`, maç tarihine kadarki hareketler) ve frontend canlı roster'ı (`live_roster_refresh.py`, oyuncunun son maçından sonraki hareketler) bu modülü kullanır. Öncesinde 6 Ekim'de dondurulmuş roster, 17 Ekim'de waive edilen 105 oyuncuyu hâlâ takımlarında gösteriyordu.
   - Trade export'u ve çok takımlı takas tarihlerinin zenginleştirilmesi de aynı feed'i kullanır.

2. **Çıkarımsal Takas Hesaplama (Observed Stints)**:
   - [scripts/ingest/build_observed_affiliation_events.py](../../scripts/ingest/build_observed_affiliation_events.py) modülü çalıştırılır.
   - Bu script ham oyuncu maç günlüklerini kronolojik olarak tarar. Bir oyuncunun ardışık olarak oynadığı takımları tespit eder. Takım değiştiği gün, oyuncunun o takımdaki görevinin bittiğini (end_date) ve yeni takımındaki görevinin başladığını (start_date) belirler.
   - Bu stints (dönem) verileri `observed_affiliation_events_<season>.csv` dosyasına yazılır.

3. **Günlük Roster Snapshots (kullanılmıyor)**:
   - [scripts/ingest/roster_snapshot_generator.py](../../scripts/ingest/roster_snapshot_generator.py) stints pencerelerinden günlük roster matrisi üretebilir (`get_roster_as_of`), ancak 2026-10-21 itibarıyla hiçbir eğitim veya inference kodu bu modülü çağırmaz. Canlı roster çözümlemesi `roster_transactions.py` üzerinden yapılır; eğitim tarafında takım bağlantısı her maçın kendi box score'undan gelir.

---

## 5. Hangi Kod Ne Yapıyor? (Kritik Girdiler ve Kod Eşleşmeleri)

| Dosya Yolu | Görevi / İşlevi |
| :--- | :--- |
| [main.py](../../main.py) | Projenin ana CLI giriş noktası. Parametrelere göre orchestrator'ı çağırır ve roster/feature analizlerini başlatır. |
| [src/core/data_paths.py](../../src/core/data_paths.py) | Sezon parametresini alarak tüm okuma/yazma işlemlerinin dosya yollarını merkezi olarak çözen sınıf. |
| [src/core/season_utils.py](../../src/core/season_utils.py) | Sezon isimlerini normalize eder ve veri setlerinin tarihsel sınırlarını denetler. |
| [src/ingestion/update_data_service.py](../../src/ingestion/update_data_service.py) | Fikstürü güncelleyen, eksik tamamlanmış maçları tespit edip NBA API'den çeken ve veri setlerini güncelleyen ana servis. |
| [src/validation/data_freshness.py](../../src/validation/data_freshness.py) | Yerel verilerin güncelliğini fikstürle karşılaştırarak eksik maçları raporlar, Markdown ve JSON formatında rapor yazar. |
| [src/analysis/roster_analysis.py](../../src/analysis/roster_analysis.py) | Oyuncu istatistiklerini derleyerek her takım için Core oyuncuları ve Importance skorlarını hesaplar. |
| [scripts/ingest/build_observed_affiliation_events.py](../../scripts/ingest/build_observed_affiliation_events.py) | Oyuncu maç günlüklerinden takas tarihleri ve stints çıkarımını yapan veri üretim betiği. |
| [scripts/ingest/roster_snapshot_generator.py](../../scripts/ingest/roster_snapshot_generator.py) | Oyuncu dönemlerini (stints) kullanarak günlük kadro snapshots matrisini üreten sızıntısız roster oluşturucu. |
| [scripts/build_play_by_play.py](../../scripts/build_play_by_play.py) | Game ID veya sezon bazında NBA `PlayByPlayV3` verisini çekerek frontend için `play_by_play/{GAME_ID}.json` cache dosyalarını üreten CLI. |
| [src/features/core_player_availability_features.py](../../src/features/core_player_availability_features.py) | Belirlenen core oyuncuların maçlardaki oynama/süre istatistiklerini takım ve rakip bazlı olarak birleştiren özellik üretici. |
| [src/processing/upcoming_context_builder.py](../../src/processing/upcoming_context_builder.py) | Gelecek maçları, takımların en güncel V2 rolling istatistikleri ve core oyuncu listeleriyle birleştirerek arayüze hazır hale getiren servis. |
| [src/api/services/player_projection.py](../../src/api/services/player_projection.py) | Canlı tahmin sırasında gelecek maçlar için oyuncuların geçmiş sürelerini (EMA) kullanarak aktif oyuncuları belirleyen mikroservis kodu. |

---

## 6. Mevcut Durum, Çözülen Darboğazlar ve Geliştirme Alanları

Yapılan kod incelemeleri ve refaktör çalışmaları sonucunda veri hattında çözülen kritik noktalar ve gelecek geliştirme alanları aşağıda listelenmiştir:

### 1. Ingestion Kodlarında Sabit Kodlanmış (Hardcoded) Sezon Tanımları (ÇÖZÜLDÜ)
- **Çözüm**: [build_observed_affiliation_events.py](../../scripts/ingest/build_observed_affiliation_events.py) ve [roster_snapshot_generator.py](../../scripts/ingest/roster_snapshot_generator.py) script'leri CLI parametresi olarak `--season` kabul edecek ve yolları doğrudan `src.core.data_paths.get_data_paths` üzerinden dinamik çözecek şekilde refaktör edilmiştir.

### 2. Core Player Listesinin Statik Üretim Yolu ve Manuel Senkronizasyon (ÇÖZÜLDÜ)
- **Çözüm**: Roster analizi çalıştırıldığında (`main.py --run-roster-analysis`) üretilen `core_players.csv` dosyası manifest kurallarına göre `data/production/` ve `data/canonical/` dizinlerine otomatik olarak kopyalanmakta ve senkronize edilmektedir.

### 3. Takas (Transactions) Verisinin Canlı Roster'a Bağlanması (ÇÖZÜLDÜ)
- **Çözüm**: `src/analysis/roster_transactions.py` resmi hareket feed'ini canlı oyuncu tahminine ve frontend roster'ına uygular; feed günlük güncellenir. Testler: `tests/test_roster_transactions.py`.

### 4. V3 Oyuncu Özelliklerindeki Proxy Feature Sızıntısı (ÇÖZÜLDÜ)
- **Çözüm**: Win probability ve player-prediction modellerimiz V9/V9_Ridge aşamasına geçirilmiş, V3 sürümünde post-tipoff gözlemlenen attendance sızıntıları tamamen temizlenmiştir. Tüm özellikler pre-game projection'lara dayandırılmıştır.

### 5. Multi-Season (Çoklu Sezon) Doğrulama Bölünmesi (ÇÖZÜLDÜ)
- **Çözüm**: [src/training/validation_utils.py](../../src/training/validation_utils.py) `season_holdout_train_test_split`, `chronological_train_test_split` ve `expanding_window_date_splits` sağlar; WIN/SCORE/PLAYER trainer'ları rastgele split kullanmaz. Ek olarak [scripts/walk_forward_benchmark.py](../../scripts/walk_forward_benchmark.py) modelleri sezon bazlı walk-forward olarak Elo / last-10 baseline'larına karşı ölçer.

### 6. Core Player Feature Sızıntısı (ÇÖZÜLDÜ, 2026-10-21)
- **Çözüm**: `TEAM_CORE_*` / `OPP_CORE_*` maç öncesi bilgiyle yeniden yazıldı (Bölüm 3.3). Kolon adları korunduğu için şema değişmedi; tüm v3 veri setleri yeniden üretildi.

### 7. Bootstrap ile Eğitim Veri Setleri Arasındaki Kopukluk (ÇÖZÜLDÜ, 2026-10-21)
- **Çözüm**: `--bootstrap-season` artık sezonun `team_model_ready_v3` dosyasını da üretir (`rebuild_season` + boxscore enrichment) ve manifest'e ekler. `--update-data` aynı adımı her gün çalıştırır (Step 8b), böylece devam eden sezonun v3'ü güncel kalır. `player_model_ready_v4_usg` sezonlar arası bir eğitim seti olduğu için `scripts/rebuild_training_data.py` ile üretilmeye devam eder.

### 8. Atomik Olmayan CSV Yazımları (ÇÖZÜLDÜ, 2026-10-21)
- **Çözüm**: `src/ingestion/atomic_io.py` (`write_csv_atomic`) geçici dosyaya yazıp `os.replace` ile değiştirir. `src/ingestion/` altındaki tüm raw/processed yazımları buna geçirildi. Test: `tests/test_atomic_io.py`.

### 9. Veri Doğrulama Sözleşmesi (ÇÖZÜLDÜ, 2026-10-21)
- **Çözüm**: `src/validation/contracts.py` raw team/player game log'ları ve team model-ready veri setleri için kural seti tanımlar: zorunlu kolonlar, 10 haneli `GAME_ID`, `(GAME_ID, TEAM_ID)` / `(Game_ID, Player_ID)` tekilliği, maç başına en fazla iki takım satırı, parse edilebilen tarih ve maç başına `WIN` toplamı = 1. Kontroller `team_games_fetcher`, `player_games_fetcher` ve `rebuild_training_data` içinde yazımdan önce çalışır; ihlalde `ContractViolation` fırlatılır ve atomik yazım sayesinde eski dosya korunur. Mevcut tüm sezonlar (2020-21 → 2026-27) kontratları geçiyor. Test: `tests/test_contracts.py`.

### 10. Depo Boyutu ve Frontend Veri Teslimi (ÇÖZÜLDÜ, 2026-10-21)
- **Çözüm**: Deploy kaldırıldıktan sonra frontend tamamen API'ye taşındı. `frontend/public/data/` (~800 MB üretilmiş JSON + eski SQLite) kaldırıldı ve git'ten çıkarıldı (1266 dosya, 184 MB'ı `player_games/*.json`). Yerine sezon başına SQLite deposu geldi (`data/frontend_store/`, gitignore'da). Ayrıntılar: [data_storage_and_delivery_analysis.md](data_storage_and_delivery_analysis.md).
- Git geçmişi de temizlendi (2026-10-21): `git filter-repo` ile üretilmiş veri dosyaları bütün commit'lerden çıkarıldı ve `main` force-push edildi. `.git` 216 MB'tan 6.6 MB'a indi, HEAD ağacı değişmedi. Eski uzak dallar ve Codex worktree'si silindi.

### 11. Ölçülmemiş Performans İddiaları (ÇÖZÜLDÜ, 2026-10-21)
- **Çözüm**: `docs/pipeline_overview.md` içindeki rakamlar ölçülüp düzeltildi (MacBook, sıcak cache):
  - Parquet ve CSV karşılaştırması (`team_model_ready_v3_2025_26`): iddia "ZSTD, 12x, %76". Ölçülen: **Snappy**, okuma 95 → 21 ms (**4.5x**), boyut 5.9 → 2.7 MB (**%55**).
  - SQLite lookup: iddia "<1 ms". Ölçülen p50: `game_details` 0.02 ms, `player_history` 0.14 ms. İddia doğru.
  - WIN inference: iddia "sub-20ms". Ölçülen: ısınmış durumda **p50 ~430 ms, p95 ~820 ms**. Süreyi feature üretimi belirliyor (CSV log okuma + roll-forward); model çağrısının kendisi değil.
