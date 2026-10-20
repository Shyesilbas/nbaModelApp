# Veri Saklama ve Frontend'e Veri Gönderme Analizi (2026-10-21)

Bağlam: Production/deploy hedefi yok (Vercel, Docker ve runtime bundle 2026-10-21'de kaldırıldı). Uygulama lokal çalışıyor: Vite dev server (frontend) + FastAPI `ml-service`.

## 1. Bugünkü durum: aynı veri için üç katman

| Katman | Yer | Boyut | Kim okuyor |
|---|---|---|---|
| Pipeline verisi | `data/season=*/{raw,features,processed,analysis}`, `data/processed`, `data/experimental` | ~800 MB (234 MB'ı 2024-25 play-by-play raw) | pipeline, eğitim, inference |
| Frontend statik JSON | `frontend/public/data/` (52 girdi) | ~520 MB JSON | tarayıcı (Vite `/data/...`) ve API |
| SQLite | `frontend/public/data/nba_frontend.db` | 282 MB | API (`/frontend-data-api/*`) |

`data/frontend`, `frontend/public/data` klasörüne işaret eden bir **symlink**. API'nin okuduğu "frontend verisi" ile tarayıcıya statik olarak sunulan klasör fiziksel olarak aynı yer.

### Frontend veriyi nasıl alıyor
`frontend/src/lib/dataCache.ts` iki ayrı yol kullanıyor:

1. `loadJson("/data/x.json")`: önce Vite'tan statik dosyayı dener, olmazsa API'den `/frontend-data/x.json` ister. Bu yolda çekilen dosyalar: `seasons`, `games`, `all_seasons_games`, `game_results`, `game_details`, `team_boxscores_*`, `player_boxscores_*`, `player_profiles`, `player_season_averages`, `team_rosters`, `seasons/<s>/team_rosters`, `seasons/<s>/multi_team_players`, `multi_team_players`, `trades`, `dataset_summary`, `player_games/<id>`, `play_by_play_moments/<s>/<gid>`.
2. `loadPrivateApi*("/frontend-data-api/...")`: API endpoint'leri, önce SQLite'a bakar, olmazsa JSON dosyalarına düşer. Bunlar: games, weeks, game detail, refresh, play-by-play, players, team-rosters.

Oyuncu sayfası ikisini birden kullanıyor: önce `/frontend-data-api/players/<id>`, olmazsa statik `player_games/<id>.json`.

## 2. Tekrar eden veri

| Veri | Kopyalar | Toplam |
|---|---|---|
| Oyuncu maç geçmişi | `player_games/*.json` (1251 dosya, **git'te**), `player_season_games.json`, SQLite `player_history` | 184 + 149 MB + DB |
| Box score'lar | `player_boxscores_*.json` + `team_boxscores_*.json`, SQLite `player_boxscores` / `team_boxscores` (≈82 MB JSON) | ~100 MB JSON + DB |
| Maç listesi | `games.json`, `all_seasons_games.json` (ikisi de ~3.6 MB, git'te, her gün değişiyor), SQLite `games_index` | 7 MB + DB |
| Play-by-play | `data/season=*/raw/play_by_play` (API buradan okuyor), `public/data/play_by_play` (95 dosya, frontend kullanmıyor) | 50 MB gereksiz |
| Analiz çıktıları | `data/season=*/analysis/*.csv`, `data/canonical/`, `data/production/`, `data/*.json` (kök, sadece bootstrap script'i yazıyor), `public/data/*.json` | küçük ama 4-5 kopya |
| Tablo verisi | Çoğu katmanda hem `.csv` hem `.parquet` | ~2x |

## 3. Üretilen ama kullanılmayanlar

- Frontend hiç istemiyor: `upcoming_games_context.json` (1.4 MB, git'te), `schedule.json` (git'te), `schedule_details_*.json`, `core_players.json`, `player_name_lookup.json`, `star_candidates.json`, `highlights.json`, `model_ready_v2_summary.json`, `archive/`, `play_by_play/`. Bir kısmı API'nin izin listesinde ama frontend çağırmıyor.
- `prefetchManifestFiles()` tanımlı ama hiçbir yerden çağrılmıyor.
- `PlayerMatchupModal` içindeki `/data/static_bundles/players_preview_<season>.json` fallback'i: bu dosyayı üreten kod yok.
- `data/odds/`, `data/features/` boş klasörler.
- PostgreSQL katmanı: hiçbir kod kullanmıyordu, 2026-10-21'de kaldırıldı (`db/`, `scripts/db/`, `docker-compose.yml`, `psycopg`).

## 4. Git'e etkisi

- Git'te izlenen veri ~215 MB; bunun **184 MB'ı `player_games/*.json`**. `.git` klasörü 216 MB.
- Her `--update-data` sonrası `games.json`, `all_seasons_games.json`, `manifest.json`, `dataset_summary.json`, `highlights.json`, `schedule.json` değişiyor. Son 30 commit'te 13-15 kez.
- Bu dosyalar sadece Vercel statik servis edebilsin diye git'teydi. Deploy olmadığına göre izlenmeleri için bir sebep kalmadı.

## 5. Tutarsızlıklar

- `game_details.json` ve SQLite `game_details` tablosunda sadece 68 maç var. Diğer maçların detayı API'de box score'lardan anlık birleştiriliyor; yani "game details" iki farklı yoldan üretiliyor.
- 282 MB'lık SQLite dosyası `public/` altında. Vite onu `/data/nba_frontend.db` olarak tarayıcıya sunabilir.

## 6. Önerilen hedef yapı (UYGULANDI, bkz. Bölüm 10)

```
data/                       pipeline'ın tek kaynağı (raw → features → processed → training)
data/frontend.db            SQLite, build_frontend_db.py üretir (public/ dışında, symlink yok)
ml-service (FastAPI)        frontend'in tek veri kaynağı: tüm okumalar SQLite'tan
frontend                    sadece API çağırır; public/data kalmaz
```

### Adımlar (her biri kendi başına çalışır durumda bırakılabilir)

1. **Git temizliği**: `frontend/public/data/` tamamen gitignore'a alınır, izlenen dosyalar index'ten çıkarılır (`git rm --cached`, dosyalar diskte kalır). Bu sadece ileriye dönük etki eder; `.git`'i küçültmek için geçmişi yeniden yazmak gerekir (`git filter-repo`). O adım remote'a force-push ister ve ayrı bir karardır.
2. **Ölü/tekrar eden çıktıları kaldırmak**: Bölüm 3'teki dosyalar ve üreticileri, `public/data/play_by_play`, `data/*.json` kök kopyaları, `prefetchManifestFiles`, `static_bundles` fallback'i, boş klasörler.
3. **SQLite'ı `public/` dışına taşımak**: `data/frontend` symlink'i yerine gerçek bir klasör (ya da `data/frontend.db`); `build_frontend_db.py` ve `FRONTEND_DATA_DIR` güncellenir.
4. **Frontend'i tek kanala almak**: `loadJson("/data/...")` çağrıları karşılık gelen API endpoint'lerine taşınır (eksik olanlar için endpoint eklenir). API JSON fallback'leri ve statik → API zinciri kaldırılır. Bu yapıldıktan sonra `export_frontend_data.py` / `export_player_profiles.py` JSON yerine sadece SQLite'a yazar; `player_games/`, `player_season_games.json` ve sezonluk box score JSON'ları (~500 MB) üretilmez.
5. **(Sonra) `data/` formatı**: her katman için tek format (CSV ya da Parquet). Okuyucu sayısı fazla olduğu için ayrı bir iş.

Kazanç: ~500 MB üretilen JSON ve 184 MB git yükü gider, her günlük güncelleme git diff'i üretmez, frontend'in "önce statik, sonra API" fallback mantığı tek bir yola iner, aynı verinin 3-4 kopyasının birbirinden kayma riski ortadan kalkar.

## 7. Günlük güncellemenin maliyeti (ölçüm, 2026-10-21)

`--update-data` sonrasındaki frontend yenilemesi (`refresh_current_season_views`):

| Adım | Süre | Kapsam |
|---|---|---|
| `build_live_roster` | 0.2 sn | aktif sezon |
| `BoxscoreService.run_and_export` | 1.2 sn | aktif sezon |
| `export_data` | 1.9 sn | aktif sezon (+ tüm sezonların roster / multi-team dosyaları) |
| `export_player_profiles` | **117.5 sn** | **6 sezonun tamamı**, her seferinde |
| `build_frontend_db` | 18.6 sn | 282 MB'lık DB'yi sıfırdan |

- `data/frontend` → `frontend/public/data` symlink'i yüzünden export'lar aynı klasöre iki kez çalışıyordu (her güncellemede +2 dk). 2026-10-21'de düzeltildi: fiziksel klasör başına tek export.
- Kalan maliyetin ~%95'i, hiç değişmeyen geçmiş sezonları yeniden işlemekten geliyor.
- `public/data/player_games/*.json` (1251 dosya, 184 MB, git'te) için artık bir üretici yok; dosyalar 2026-07-17 tarihli. Oyuncu sayfası API'ye ulaşamazsa bu bayat veriye düşüyor.

## 8. Plan: geçmiş sezonları dondurmak (UYGULANDI, bkz. Bölüm 10)

İlke: bir sezon bitince (playoff'lar tamamlanınca) o sezonun tüm türev çıktıları **bir kez** üretilir ve mühürlenir. Günlük iş sadece aktif sezona dokunur.

1. **Sezon durumu**: `data/season=<s>/manifest.json` dosyasına `status: closed | active` ve kapandığı tarih eklenir. Kapalı sezonlara yazmaya çalışan export/rebuild adımı varsayılan olarak atlanır (`--force` ile bilinçli yeniden üretim).
2. **Sezon başına çıktı**: Şu an tüm sezonları tek dosyada birleştiren çıktılar (`player_season_games.json`, `player_season_averages.json`, `all_seasons_games.json`, tek `nba_frontend.db`) sezon başına bölünür. Böylece aktif sezon tek başına yeniden üretilebilir.
3. **Kapalı sezon artefaktları**: her kapalı sezon için bir kez üretilen salt-okunur bir dosya (ör. `data/frontend/season_2024_25.db`). Aktif sezon için küçük, her gün yeniden üretilen `season_2026_27.db`.
4. **Okuma tarafı**: API sezon dosyalarını birlikte açar (SQLite `ATTACH` ya da sezon → bağlantı eşlemesi). "Tüm sezonlar" sorguları (oyuncu kariyeri vb.) sezon tablolarının birleşimi olur.
5. **Eğitim verisi**: zaten sezon başına (`team_model_ready_v3_<s>`); günlük akış sadece aktif sezonu yeniliyor. Tüm sezonları yeniden üretmek yalnızca feature kodu değiştiğinde (`scripts/rebuild_training_data.py`) yapılır.

Beklenen etki: günlük frontend yenilemesi ~140 sn'den birkaç saniyeye iner. Geçmiş sezon dosyaları bir daha değişmez.

## 9. Karar: frontend'e veri nasıl gidecek? (A seçildi, UYGULANDI)

| | A. Tek kanal: SQLite + API | B. Statik JSON (git dışı) |
|---|---|---|
| Frontend | sadece `fetch(API)` | `/data/*.json` (Vite) |
| Veri kopyası | sezon başına 1 DB | sezon başına JSON setleri |
| Büyük veri (oyuncu geçmişi, box score) | nokta sorgusu, sadece istenen satır | dosyanın tamamı indirilir (ör. 15 MB box score) |
| API kapalıyken | uygulama veri gösteremez | sayfalar çalışır, tahminler çalışmaz |
| İş miktarı | frontend'de ~17 `loadJson` çağrısının endpoint'e taşınması, eksik endpoint'ler | export'ları sezon bazına bölmek ve git'ten çıkarmak |
| Dondurma ile uyum | doğal (kapalı sezon DB'si salt-okunur) | doğal (kapalı sezon JSON'ları değişmez) |

Öneri A. Uygulama zaten tahmin için API'ye bağımlı, oyuncu ve maç detayı zaten API'den geliyor; B, sadece deploy için var olan ikinci bir yolu yaşatmak olur.

## 10. Uygulama sonucu (2026-10-21, ÇÖZÜLDÜ)

Karar: A (tek kanal: SQLite + API). Sezon, Finalleri bir takım 4 galibiyetle kazandığında kapalı sayılır.

**Depo** (`src/frontend_store/`, CLI `scripts/build_frontend_store.py`):
- `season_status.py`: Finals galibiyetlerinden kapanış tespiti. Sonuç: 2020-21 MIL, 2021-22 GSW, 2022-23 DEN, 2023-24 BOS, 2024-25 OKC, 2025-26 NYK kapalı; 2026-27 aktif.
- `builders.py`: sezon başına `season_YYYY_YY.db` (games, game_details, team/player box score, player_games, pbp_moments, docs: game_results, team_rosters, multi_team_players, player_index) ve `global.db` (seasons, player_profiles, player_season_averages, trades). Kaynak doğrudan `data/`. Ara JSON yok.
- Kapalı sezon `meta.status = closed` ve `store_version` ile mühürlenir, sonraki çalıştırmalarda atlanır. Builder değişince `STORE_VERSION` artırılır ve her kapalı sezon bir kez yeniden kurulur.
- Dosyalar geçici dosyada kurulup `os.replace` ile değiştirilir; API yarım DB okumaz.

**Doğrulama** (eski JSON çıktılarıyla birebir karşılaştırma, 2024-25 ve global):
- oyuncu maç logları 569/569 ve ortalamalar: fark 0;
- takım ve oyuncu box score'ları: eşit;
- maç listesi (1320 maç, tüm alanlar): fark 0;
- PBP moments: eşit;
- oyuncu profilleri (1229), sezon ortalamaları, takaslar: eşit.

**Süreler**:

| | Önce | Sonra |
|---|---|---|
| Günlük frontend yenilemesi (`refresh_current_season_views`) | ~140 sn (symlink ile ~255 sn) | **~7 sn** (aktif sezon 3 sn + global 2 sn) |
| Tek maç yenileme sonrası export | `export_player_profiles` dahil ~2 dk | aktif sezon + global ~5 sn |
| Kapalı sezon | her güncellemede yeniden işleniyordu | bir kez (20-30 sn), sonra hiç |

**Boyut**: `frontend/public/data` (~800 MB) + `data/frontend` symlink'i + `data/*.json` kopyaları kaldırıldı. Yerine `data/frontend_store/` geldi (7 sezon + global, ~294 MB). Git'ten 1266 dosya çıkarıldı.

**API** (`ml-service/app/services/frontend_data.py`): sadece depodan okur. Yeni endpoint'ler: `seasons`, `player-profiles`, `player-season-averages`, `trades`, `multi-team-players`, `game-results`. `/frontend-data/{file}` ve manifest kaldırıldı. Testler: `tests/test_frontend_store_api.py`.

**Frontend**: `dataCache.ts` statik dosya, manifest ve CacheStorage mantığı olmadan sadece API çağırır. Hiçbir bileşen `/data/...` okumaz. `npx tsc -b` ve `vite build` geçti; ana sayfa headless Chrome'da API verisiyle render edildi.

**Kaldırılan üreticiler**: `export_frontend_data.py`, `export_player_profiles.py`, `export_all_seasons_games.py`, `build_frontend_db.py`, `export_archive_pack.py`, `src/export/`, `src/processing/schedule_context_service.py` (kullanılmıyordu). `BoxscoreService` artık JSON, game_details ve highlights yazmıyor; sadece aktif sezonun maç özeti önbelleğini dolduruyor. `build_play_by_play.py` maç listesini pipeline verisinden okuyor ve frontend'e kopya yazmıyor. PBP sıkıştırma kodu `src/frontend_store/pbp_moments.py` dosyasına taşındı.

**Açık kalanlar**:
- `.git` geçmişi eski frontend JSON'larını hâlâ içeriyor (~216 MB). Küçültmek için geçmişin yeniden yazılması (`git filter-repo`) ve force-push gerekiyor.
- ~~`data/` katmanlarında CSV + Parquet ikilisi~~ ÇÖZÜLDÜ (2026-10-21): tek format CSV. 119 çiftin 3'ünde içerik farklıydı ve hepsinde CSV daha yeniydi; 14 Parquet bayattı. Bütün Parquet yazımları ve "ikisinden yenisini oku" mantığı kaldırıldı, `pbp_situational_features` CSV'ye çevrildi. Kopyalar `data/`'dan çıkarıldı (43 MB). WIN, skor ve oyuncu tahminleri 4 maçta (2 güncel, 2 geçmiş sezon) önce ve sonra birebir aynı.
- ~~Git'te izlenen `data/` dosyaları~~ ÇÖZÜLDÜ (2026-10-21): sadece yeniden üretilemeyen girdiler (oyuncu metadata'sı, 2026-27 bootstrap roster/core/Elo) izleniyor.

