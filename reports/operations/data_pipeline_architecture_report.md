# NBA Veri Toplama, İşleme ve Sezon Bootstrapping Mimarisi Araştırma Raporu

Bu rapor, NBA model tahmin uygulamasının (nbaModelApp) veri toplama, roster takibi, core player belirleme, takas günlüğü (trade log) çıkarma ve yeni sezon ekleme (bootstrapping) süreçlerinin teknik detaylarını, kod mimarisini ve iyileştirme önerilerini içermektedir.

---

## 1. Veri Toplama (Data Ingestion) Mimarisi

Sistemin veri toplama katmanı [src/ingestion/](file:///Users/serhat/agProjects/nbaModelApp/src/ingestion) dizininde yer alır ve resmi NBA API'si ile entegredir. Veriler üç ana akışla toplanır:

1. **Schedule (Fikstür) Güncelleme**:
   - [src/ingestion/schedule_fetcher.py](file:///Users/serhat/agProjects/nbaModelApp/src/ingestion/schedule_fetcher.py) modülü, NBA API (`ScheduleLeagueV2` ve `ScoreboardV3` API'leri) üzerinden hem normal sezon hem de final fikstürlerini çeker. Çekilen bu veriler [data/raw/schedule/](file:///Users/serhat/agProjects/nbaModelApp/data/raw/schedule) altında CSV formatında saklanır.
   - [src/ingestion/schedule_loader.py](file:///Users/serhat/agProjects/nbaModelApp/src/ingestion/schedule_loader.py) modülü, bu ham fikstürleri birleştirerek tamamlanmış ve gelecek maçları etiketler.

2. **Team Game Logs (Takım Maç Verileri)**:
   - [src/ingestion/team_games_fetcher.py](file:///Users/serhat/agProjects/nbaModelApp/src/ingestion/team_games_fetcher.py) modülü tarafından yönetilir.
   - **Toplu Veri Çekimi (Bulk Ingest)**: `LeagueGameLog` API endpoint'i kullanılarak ilgili sezonun tüm takım verileri tek seferde indirilir.
   - **Artımlı Veri Çekimi (Incremental Ingest)**: Günlük veri güncellemelerinde tüm sezonu tekrar indirmemek ve NBA API'nin rate limit sınırlarına takılmamak için sadece eksik olan `GAME_ID`'ler tespit edilir. Bu eksik maçlar, multi-threading (`ThreadPoolExecutor`) kullanılarak `BoxScoreTraditionalV2` (TeamStats tablosu) üzerinden paralel olarak çekilir ve ham CSV/Parquet dosyasına eklenerek deduplicate (tekilleştirme) edilir.

3. **Player Game Logs (Oyuncu Maç Verileri)**:
   - [src/ingestion/player_games_fetcher.py](file:///Users/serhat/agProjects/nbaModelApp/src/ingestion/player_games_fetcher.py) modülü tarafından yönetilir.
   - Takım verilerine benzer şekilde çalışır. Eksik maçlardaki oyuncu istatistikleri `BoxScoreTraditionalV2` (PlayerStats tablosu) üzerinden çekilir. Süre almayan (DNP - Did Not Play, Inactive) oyuncular filtrelenir ve veriler [data/raw/player_games/](file:///Users/serhat/agProjects/nbaModelApp/data/raw/player_games) altına append edilir.

4. **API Hız Sınırları ve Güvenlik**:
   - Tüm API çağrıları [src/ingestion/nba_api_client.py](file:///Users/serhat/agProjects/nbaModelApp/src/ingestion/nba_api_client.py) üzerinden yapılır.
   - Akamai CDN bloklarını aşmak amacıyla her istek arasına **0.6 - 1.2 saniye rastgele gecikme (jittered sleep)** eklenir. İsteklerin başarısız olması durumunda **üstel geri çekilme (exponential backoff)** algoritmasıyla 5 kez yeniden deneme yapılır.

5. **Play-by-Play Cache Üretimi**:
   - [scripts/build_play_by_play.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/build_play_by_play.py) CLI aracı, NBA API `PlayByPlayV3` endpoint'inden maç olaylarını çeker ve React frontend için yapılandırılmış JSON cache üretir.
   - Varsayılan çıktı dizini [frontend/public/data/play_by_play/](file:///Users/serhat/agProjects/nbaModelApp/frontend/public/data/play_by_play) olup her maç `frontend/public/data/play_by_play/{GAME_ID}.json` formatında saklanır.
   - Ayrıca sezon bazında küçük bir özet dosyası üretir: `frontend/public/data/schedule_details_YYYY_YY.json`. Bu dosya game-card ekranlarında quarter skorları, top scorer listesi, event sayısı ve `has_play_by_play` durumunu göstermek için kullanılır; full event loglarını içermez.
   - CLI iki ana modda çalışır:
     ```bash
     PYTHONPATH=. python3 scripts/build_play_by_play.py --game-id 0042500405
     PYTHONPATH=. python3 scripts/build_play_by_play.py --season 2025-26
     ```
   - Sezon modu varsayılan olarak [frontend/public/data/all_seasons_games.json](file:///Users/serhat/agProjects/nbaModelApp/frontend/public/data/all_seasons_games.json) dosyasını metadata kaynağı olarak kullanır. Bu dosyadaki `GAME_ID`, `HOME_TEAM_ABBREVIATION`, `AWAY_TEAM_ABBREVIATION`, `GAME_DATE`, `SEASON`, `SEASON_TYPE`, `GAME_STATUS` alanları maç seçimi ve çıktı metadata'sı için yeterlidir.
   - Güvenli batch kullanımı için önce dry-run önerilir:
     ```bash
     PYTHONPATH=. python3 scripts/build_play_by_play.py --season 2025-26 --season-type "NBA Finals" --dry-run
     ```
   - Mevcut cache dosyaları varsayılan olarak atlanır. Yeniden üretmek için `--force`, API çağrıları arasındaki bekleme için `--sleep`, küçük smoke testleri için `--limit` kullanılabilir:
     ```bash
     PYTHONPATH=. python3 scripts/build_play_by_play.py --season 2025-26 --limit 5 --sleep 0.8
     PYTHONPATH=. python3 scripts/build_play_by_play.py --game-id 0042500405 --force
     ```
   - Sadece küçük sezon özet dosyasını mevcut PBP cache'lerinden yeniden üretmek için:
     ```bash
     PYTHONPATH=. python3 scripts/build_play_by_play.py --season 2025-26 --summary-only
     ```
   - Üretilen JSON kontratı şu alanları içerir:
     - `game_id`, `home_team`, `away_team`
     - `quarter_scores`: quarter bazında ev/deplasman sayı ve kümülatif toplamlar
     - `events`: her olay için period, clock, action type, oyuncu kimliği, skor, gerçek event puanı, running player totals, assist metadata, quarter katkısı ve milestone badge'leri
   - Frontend entegrasyonu iki katmanlıdır:
     - [frontend/src/components/GameResults.tsx](file:///Users/serhat/agProjects/nbaModelApp/frontend/src/components/GameResults.tsx), liste ekranında sadece `schedule_details_YYYY_YY.json` dosyasını yükler. Bu küçük dosya maç kartlarında quarter skorları ve top scorer bilgisini gösterir.
     - [frontend/src/components/game-results/GameCardDetail.tsx](file:///Users/serhat/agProjects/nbaModelApp/frontend/src/components/game-results/GameCardDetail.tsx), kullanıcı Play-by-Play tabını açtığında yalnızca ilgili `play_by_play/{GAME_ID}.json` dosyasını on-demand çeker. UI quarter accordion, oyuncu fotoğrafı, running stat line, assist chip ve özel highlight badge'leri gösterir.

---

## 2. Sezon Yönetimi ve Yapılandırma

Sistemde sezon bazlı parametreler ve dosya yolları dinamik olarak yönetilir:

1. **Season Path Resolver**:
   - [scripts/data_paths.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/data_paths.py) içinde bulunan `get_data_paths(season)` fonksiyonu, sistemin tek dosya yolu yöneticisidir.
   - [config/data_sources.yaml](file:///Users/serhat/agProjects/nbaModelApp/config/data_sources.yaml) içindeki tanımlara göre `data/raw/`, `data/processed/` ve `data/features/` dizinlerinin yollarını belirler. Sezon ismini (örn: `2024-25`) dosya token'ına (örn: `2024_25`) dönüştürerek dinamik dosya yolları oluşturur.
   - [scripts/season_utils.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/season_utils.py) sezon formatlarını normalize eder (örn: `2024-2025` veya `2024_25` girdilerini `2024-25` standardına getirir). Ayrıca veri kümelerine yanlış sezon verilerinin karışmasını engellemek için tarih ve `GAME_ID` prefix doğrulamaları yapar.

2. **Yeni Sezon Bootstrapping**:
   - Yeni bir sezon eklemek veya mevcut sezonu sıfırdan kurmak için tek bir CLI komutu kullanılır:
     ```bash
     python3 main.py --season YYYY-YY --bootstrap-season
     ```
   - Bu komut [src/orchestration/pipeline_workflows.py](file:///Users/serhat/agProjects/nbaModelApp/src/orchestration/pipeline_workflows.py) içindeki `run_bootstrap_season_pipeline` fonksiyonunu tetikler ve sırasıyla şu işlemleri gerçekleştirir:
     1. Ham takım ve oyuncu özelliklerini senkronize eder (`sync_features`).
     2. Maç sonuçlarını ve kutu istatistiklerini yeniden üretir (`rebuild_game_results`).
     3. Rakip uyumlu V2 veri setini oluşturur (`run_build_enhanced_v2`).
     4. Veri tazeliğini (`DataFreshnessService`) denetler ve rapor üretir.
     5. Frontend export'larını sezon bazlı olarak yazılır (`export_data`).
     6. Başarılı bootstrap sonrasında [data/manifests/](file:///Users/serhat/agProjects/nbaModelApp/data/manifests) dizinine o sezona ait tüm üretilen dosyaları ve durum bilgilerini içeren bir manifest JSON dosyası yazar.

---

## 3. Core Player Belirleme Mekanizması

Oyuncu sakatlıklarının veya kadro değişikliklerinin takım gücüne etkisini ölçmek için sistem her takımın "Core" (Çekirdek) oyuncularını veri odaklı olarak belirler.

1. **Importance Score (Önem Skoru)**:
   - [src/analysis/roster_analysis.py](file:///Users/serhat/agProjects/nbaModelApp/src/analysis/roster_analysis.py) modülü, oyuncunun maç başı istatistiklerini (MIN, PTS, AST, REB) kullanarak bir önem skoru hesaplar:
     $$\text{Importance Score} = (\text{AVG\_MIN} \times 0.5) + (\text{AVG\_PTS} \times 1.0) + (\text{AVG\_AST} \times 0.8) + (\text{AVG\_REB} \times 0.6)$$
   - Bu formülde en yüksek ağırlık skor üretimine (PTS) ve pas dağıtımına (AST) verilmiştir.

2. **Sıralama ve Kategorizasyon**:
   - Her takımın oyuncuları bu skora göre büyükten küçüğe sıralanır.
   - **Ranks 1 - 3**: `IS_TOP3_CORE` olarak etiketlenir (Takımın ana yıldızları).
   - **Ranks 4 - 5**: `IS_TOP5_CORE` (fakat top 3 dışı) olarak etiketlenir (İkincil rotasyon elemanları).
   - Sonuçlar [data/core_players.csv](file:///Users/serhat/agProjects/nbaModelApp/data/core_players.csv) dosyasına yazılır.

3. **Inference Modunda Kullanım**:
   - Canlı tahmin sırasında, bir oyuncunun maça çıkıp çıkmayacağı (availability) test edilirken bu listedeki yeri kontrol edilir. Eğer takımın en önemli 3 oyuncusundan biri eksikse, takımın o maçtaki gücü ve dolayısıyla galibiyet olasılığı düşürülür.

---

## 4. Trade Log ve Roster Snapshot Pipeline

Oyuncuların sezon içinde takım değiştirmesi (Trade, Waiver, Release), statik bir kadro listesiyle analiz yapıldığında **veri sızıntısına (data leakage)** yol açar. Örn: Bir oyuncu Ocak ayında A takımından B takımına takas edildiyse, Kasım ayındaki A takımı maçlarının tahmininde o oyuncunun varlığı veya yokluğu hesaplanmamalıdır.

Sistem bu sorunu şu şekilde çözer:

1. **İşlem Günlüğü (Transactions Log) Durumu**:
   - Resmi takas beslemelerini çeken [scripts/ingest/ingest_transactions.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/ingest/ingest_transactions.py) modülü şu anda bir **stub (boş şablon)** durumundadır.
   - Bu nedenle sistem, takas hareketlerini **gerçekleşen oyuncu maç loglarından çıkarımsal olarak (observed events)** hesaplar.

2. **Çıkarımsal Takas Hesaplama (Observed Stints)**:
   - [scripts/ingest/build_observed_affiliation_events.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/ingest/build_observed_affiliation_events.py) modülü çalıştırılır.
   - Bu script ham oyuncu maç günlüklerini kronolojik olarak tarar. Bir oyuncunun ardışık olarak oynadığı takımları tespit eder. Takım değiştiği gün, oyuncunun o takımdaki görevinin bittiğini (end_date) ve yeni takımındaki görevinin başladığını (start_date) belirler.
   - Bu stints (dönem) verileri `observed_affiliation_events_<season>.csv` dosyasına yazılır.

3. **Günlük Roster Snapshots**:
   - [scripts/ingest/roster_snapshot_generator.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/ingest/roster_snapshot_generator.py) modülü, çıkarılan bu stints pencerelerini alır ve sezonun her günü için **hangi takımda hangi oyuncuların aktif olduğunu** gösteren günlük roster snapshots matrisini oluşturur.
   - Tahmin yapılacak $T$ günündeki maç için, $T$ tarihinden küçük veya eşit en güncel roster snapshot verisi çekilir (`get_roster_as_of`). Böylece gelecekteki takasların geçmiş tahminleri etkilemesi (leakage) kesin olarak engellenir.

---

## 5. Hangi Kod Ne Yapıyor? (Kritik Girdiler ve Kod Eşleşmeleri)

| Dosya Yolu | Görevi / İşlevi |
| :--- | :--- |
| [main.py](file:///Users/serhat/agProjects/nbaModelApp/main.py) | Projenin ana CLI giriş noktası. Parametrelere göre orchestrator'ı çağırır ve roster/feature analizlerini başlatır. |
| [scripts/data_paths.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/data_paths.py) | Sezon parametresini alarak tüm okuma/yazma işlemlerinin dosya yollarını merkezi olarak çözen sınıf. |
| [scripts/season_utils.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/season_utils.py) | Sezon isimlerini normalize eder ve veri setlerinin tarihsel sınırlarını denetler. |
| [src/ingestion/update_data_service.py](file:///Users/serhat/agProjects/nbaModelApp/src/ingestion/update_data_service.py) | Fikstürü güncelleyen, eksik tamamlanmış maçları tespit edip NBA API'den çeken ve veri setlerini güncelleyen ana servis. |
| [src/validation/data_freshness.py](file:///Users/serhat/agProjects/nbaModelApp/src/validation/data_freshness.py) | Yerel verilerin güncelliğini fikstürle karşılaştırarak eksik maçları raporlar, Markdown ve JSON formatında rapor yazar. |
| [src/analysis/roster_analysis.py](file:///Users/serhat/agProjects/nbaModelApp/src/analysis/roster_analysis.py) | Oyuncu istatistiklerini derleyerek her takım için Core oyuncuları ve Importance skorlarını hesaplar. |
| [scripts/ingest/build_observed_affiliation_events.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/ingest/build_observed_affiliation_events.py) | Oyuncu maç günlüklerinden takas tarihleri ve stints çıkarımını yapan veri üretim betiği. |
| [scripts/ingest/roster_snapshot_generator.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/ingest/roster_snapshot_generator.py) | Oyuncu dönemlerini (stints) kullanarak günlük kadro snapshots matrisini üreten sızıntısız roster oluşturucu. |
| [scripts/build_play_by_play.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/build_play_by_play.py) | Game ID veya sezon bazında NBA `PlayByPlayV3` verisini çekerek frontend için `play_by_play/{GAME_ID}.json` cache dosyalarını üreten CLI. |
| [src/features/core_player_availability_features.py](file:///Users/serhat/agProjects/nbaModelApp/src/features/core_player_availability_features.py) | Belirlenen core oyuncuların maçlardaki oynama/süre istatistiklerini takım ve rakip bazlı olarak birleştiren özellik üretici. |
| [src/processing/upcoming_context_builder.py](file:///Users/serhat/agProjects/nbaModelApp/src/processing/upcoming_context_builder.py) | Gelecek maçları, takımların en güncel V2 rolling istatistikleri ve core oyuncu listeleriyle birleştirerek arayüze hazır hale getiren servis. |
| [ml-service/app/player_service.py](file:///Users/serhat/agProjects/nbaModelApp/ml-service/app/player_service.py) | Canlı tahmin sırasında gelecek maçlar için oyuncuların geçmiş sürelerini (EMA) kullanarak aktif oyuncuları belirleyen mikroservis kodu. |

---

## 6. Mevcut Durum, Çözülen Darboğazlar ve Geliştirme Alanları

Yapılan kod incelemeleri ve refaktör çalışmaları sonucunda veri hattında çözülen kritik noktalar ve gelecek geliştirme alanları aşağıda listelenmiştir:

### 1. Ingestion Kodlarında Sabit Kodlanmış (Hardcoded) Sezon Tanımları (ÇÖZÜLDÜ)
- **Çözüm**: [build_observed_affiliation_events.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/ingest/build_observed_affiliation_events.py) ve [roster_snapshot_generator.py](file:///Users/serhat/agProjects/nbaModelApp/scripts/ingest/roster_snapshot_generator.py) script'leri CLI parametresi olarak `--season` kabul edecek ve yolları doğrudan `scripts.data_paths.get_data_paths` üzerinden dinamik çözecek şekilde refaktör edilmiştir.

### 2. Core Player Listesinin Statik Üretim Yolu ve Manuel Senkronizasyon (ÇÖZÜLDÜ)
- **Çözüm**: Roster analizi çalıştırıldığında (`main.py --run-roster-analysis`) üretilen `core_players.csv` dosyası manifest kurallarına göre `data/production/` ve `data/canonical/` dizinlerine otomatik olarak kopyalanmakta ve senkronize edilmektedir.

### 3. Takas (Transactions) Ingestion Katmanının Geliştirilmesi
- **Durum**: Şu anda observed stints pencereleri zekice tasarlanmış bir fallback mekanizması olarak sızıntısız çalışmaktadır. Ancak resmi lig hareket listesi (Transactions API) entegre edilerek roster snapshot doğruluğu daha da yükseltilebilir.

### 4. V3 Oyuncu Özelliklerindeki Proxy Feature Sızıntısı (ÇÖZÜLDÜ)
- **Çözüm**: Win probability ve player-prediction modellerimiz V9/V9_Ridge aşamasına geçirilmiş, V3 sürümünde post-tipoff gözlemlenen attendance sızıntıları tamamen temizlenmiştir. Tüm özellikler pre-game projection'lara dayandırılmıştır.

### 5. Multi-Season (Çoklu Sezon) Doğrulama Bölünmesi (Validation Split) Eksikliği
- **Sıkıntı**: Modeller eğitilirken veriler rastgele bölünmekte (train/test split) veya tek sezon üzerinde doğrulanmaktadır. Bu durum sezonlar arası veri sızıntılarına ve modelin geçmiş sezonların dinamiklerini ezberlemesine sebep olabilir.
- **Öneri**: Çoklu sezon geçiş planına uygun olarak **Kronolojik Genişleyen Pencere Çapraz Doğrulaması (Chronological Expanding Window Cross-Validation)** entegre edilmelidir. Model örneğin 2022-23 ve 2023-24 verileriyle eğitilmeli, 2024-25 ile doğrulanmalı ve 2025-26 verileri holdout test seti olarak saklanmalıdır.
