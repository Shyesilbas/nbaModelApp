# Sezon ve path çözümlemesi denetimi (2026-10-20)

Kaynak: graphify bilgi grafı (`src`, `scripts`, `ml-service`; 152 dosya, 1.327 node, 4.115 edge) ve elle kod okuma.
Grafta en çok bağlantısı olan node `get_data_paths()` (91 edge, 28 community arasında köprü). Ondan sonra `get_default_season()` (62) ve `normalize_season()` (46) geliyor. Bu üç fonksiyon tüm pipeline'ın ortak bağımlılığı. Ingestion, feature, eğitim, backtest, export ve canlı servis aynı sezon/path mantığına dayanıyor.

## Özet

| # | Problem | Önem | Doğrulandı mı |
|---|---|---|---|
| 1 | `NBA_CURRENT_SEASON` env değişkeni `get_data_paths()` tarafından yok sayılıyor | Yüksek | Evet, çalıştırıldı |
| 2 | `normalize_season("2026-2027")` sonucu `"2026-20"` oluyor | Orta | Evet, çalıştırıldı |
| 3 | Sezon başlangıç sınırı 4 farklı ayda tanımlı (Ağustos/Eylül/Ekim) | Orta | Evet, kodda |
| 4 | Bozuk config sessizce yutuluyor | Orta | Kodda |
| 5 | `config/data_sources.yaml` içindeki 5 anahtar hiçbir yerde kullanılmıyor | Düşük | grep ile |
| 6 | `ml-service` `scripts/` paketine sys.path hack'i ile bağımlı | Düşük–Orta | Kodda |
| 7 | Her `get_data_paths()` çağrısı YAML'ı diskten yeniden okuyor | Düşük | Kodda |

---

## 1. Env değişkeni önceliği tutarsız (Yüksek)

`scripts/season_utils.py:get_default_season()` önce `NBA_CURRENT_SEASON`'a, sonra `config/data_sources.yaml`'a bakıyor.
`scripts/data_paths.py:get_data_paths()` ise sezon verilmediğinde **önce YAML'a** bakıyor (`config.get("current_season") or get_default_season()`). Yani YAML'da `current_season` olduğu sürece env değişkeni hiç okunmuyor.

Test çıktısı:
```
NBA_CURRENT_SEASON=2025-26
get_default_season()            -> 2025-26
get_data_paths().season_dir     -> data/season=2026-27
```

**Etkisi:** Env ile sezon değiştiren bir iş (container, cron, backtest) sezonu `get_default_season()` ile alan kodda bir sezonu, `get_data_paths()` ile path çözen kodda başka bir sezonu kullanır. Örneğin 2025-26 etiketiyle 2026-27 dosyaları okunup yazılabilir. `get_default_season()` 25 dosyada çağrılıyor. Bugün sadece `scripts/audit/validate_season_path_refactor.py` argümansız `get_data_paths()` çağırıyor ama `season=None` alıp aynen ileten çağıranlar da aynı yola düşer.

**Düzeltme (1 satır):** `get_data_paths()` içinde `season = config.get(...) or get_default_season()` yerine sadece `season = get_default_season()` kullanılmalı. Bu fonksiyon YAML'ı zaten okuyor. Ardından `get_data_paths` içindeki YAML okuma bloğu tamamen silinebilir.

## 2. `normalize_season` uzun formatı yanlış kırpıyor (Orta)

Regex `(\d{4})[-_]?(\d{2})` ilk 4+2 haneyi alıyor:

| Girdi | Çıktı |
|---|---|
| `2026-2027` | **`2026-20`** (yanlış) |
| `2026-27-x` | `2026-27` (sessizce kabul) |
| `2026/27` | hata |
| `26-27` | hata |

`2026-2027` formatı NBA API, ESPN ve kullanıcı girdisinde yaygın. Hata vermek yerine **var olmayan** `data/season=2026-20` path'ini üretiyor. Okuma tarafında bu "dosya yok → önceki sezona fallback" olarak gizlenebilir (`build_matchup_features.py:120` vb.). Yazma tarafında ise yeni bir sahte sezon klasörü açılır.

**Düzeltme:** Regex'i `^\D*(\d{4})[-_]?(\d{2}|\d{4})$` gibi tam eşleşmeye çevirmek, 4 haneli bitişte son iki haneyi almak ve ikinci yılın `start+1` olduğunu doğrulamak. Küçük bir test eklenmeli.

## 3. Sezon sınırı her yerde farklı (Orta)

| Yer | Kural |
|---|---|
| `ml-service/app/player_service.py:20`, `scripts/build_matchup_features.py:318,795`, `src/features/continuous_elo.py:23`, `src/training/validation_utils.py:44` | Ekim ve sonrası → yeni sezon |
| `scripts/build_matchup_features.py:454,692`, `src/features/player_form.py:119` | 1 Eylül → sezon başı |
| `scripts/backtest/offline.py:40` | Ağustos ve sonrası → yeni sezon |
| `scripts/season_utils.py:58` `validate_season_data` | 1 Ekim – 1 Temmuz arası geçerli |

**Etkisi:**
- Eylül sonunda oynanan bir maç (hazırlık maçı ya da erken açılış) `build_features` içinde **önceki sezona** atanıyor (`month < 10`). Erken sezon sayacı ise o önceki sezonun 1 Eylül'ünden saymaya başlıyor. Sonuçta takım tüm geçen sezonu "bu sezon oynanan maç" gibi görür, `n_min ≥ 12` olur ve Elo blend ağırlığı 0'a düşer. Bunun nedeni önceki konuşmada açıklanan karışım mantığının yanlış sezona uygulanması.
- Offline backtest Ağustos'u yeni sezona sayarken canlı servis Ekim'i sayıyor. Ağustos–Eylül tarihli satırlar backtest ile canlıda farklı sezonlara düşer, yani backtest canlı davranışı birebir yansıtmaz.
- `validate_season_data` 1 Ekim öncesi satırları reddediyor. Eylül'de başlayan bir sezon (lokavt sonrası, özel takvim) doğrulamada patlar.

**Düzeltme:** `season_utils.py` içine tek bir `date_to_season(dt)` fonksiyonu konmalı ve tüm bu yerler onu çağırmalı. Sınır tek yerde seçilmeli; Ağustos sınırı (offline.py) üç durumu da güvenle kapsar.

## 4. Bozuk config sessizce yutuluyor (Orta)

`data_paths.py:51` ve `season_utils.py:23` YAML okurken `except Exception: pass` kullanıyor. Bozuk ya da yarım yazılmış bir YAML'da:
- `get_data_paths` env'e düşer, env yoksa `ValueError` fırlatır. Hata mesajı "No default season configured" olur ve asıl sebep (YAML parse hatası) gizlenir.
- Yanlış girinti gibi hatalar `current_season`'ı `None` yapıp yukarıdaki fallback zincirini tetikleyebilir.

**Düzeltme:** Dosya varsa parse hatası yeniden fırlatılmalı. Sadece "dosya yok" durumu sessiz geçilmeli.

## 5. Kullanılmayan config anahtarları (Düşük)

`config/data_sources.yaml` içindeki `canonical_data_root`, `processed_data_root`, `features_data_root`, `raw_data_root` ve `season_file_token_format` hiçbir Python dosyasında okunmuyor. Gerçek path'ler `data_paths.py` içinde sabit yazılı (`data/season=.../raw` vb.). Config'i değiştiren biri hiçbir şeyin değişmediğini fark etmeyebilir. Ayrıca `get_data_paths` içindeki `token = season_to_file_token(season)` hesaplanıp kullanılmıyor.

**Düzeltme:** Bu anahtarlar ve `token` satırı silinmeli.

## 6. Servis ile script'ler arası bağımlılık (Düşük–Orta)

`ml-service/app/{main,service,model_loader,player_service}.py` repo kökünü `sys.path`'e ekleyip `scripts.build_matchup_features`, `scripts.artifact_paths` ve `scripts.data_paths` modüllerini import ediyor. Graf bunu "beklenmedik bağlantı" olarak da işaretledi: `scripts/backtest/live.py`, `ml-service/app/schemas.py` şemalarını kullanıyor.

**Etkisi:** `scripts/` altındaki bir yeniden adlandırma ya da import yan etkisi canlı servisi kırar. Deploy paketi bu yüzden `scripts/` klasörünün tamamını taşımak zorunda (`export_backend_runtime_bundle.py:25`). Şu an çalışıyor; risk refactor sırasında ortaya çıkar.

**Öneri:** Acil değil. Paylaşılan kod (`data_paths`, `season_utils`, `build_matchup_features`) uzun vadede `src/` altına taşınabilir.

## 7. YAML her çağrıda yeniden okunuyor (Düşük)

`build_features` tek bir tahmin isteğinde `get_data_paths`'i 12'ye kadar çağırıyor (`build_matchup_features.py`). Her çağrı `data_sources.yaml`'ı diskten okuyup parse ediyor. Maliyet milisaniye düzeyinde. 1. maddedeki düzeltme bu okumayı zaten `get_default_season`'a indirir; istenirse oraya `functools.lru_cache` eklenebilir.

---

## Önerilen sıra

1. **Madde 1 + 4 + 5:** `data_paths.py` içindeki YAML bloğunu silip `get_default_season()` kullanmak. Tek PR, yaklaşık −15 satır.
2. **Madde 2:** `normalize_season` regex'ini düzeltmek ve test eklemek.
3. **Madde 3:** Tek `date_to_season` fonksiyonu. Bu davranış değişikliği olduğu için sonrasında walk-forward backtest yeniden çalıştırılmalı.

## Kontrol edilmeyenler

- `season=None` ileten her çağıranı tek tek izlemedim. 1. maddenin canlıda tetiklenip tetiklenmediği deploy ortamında `NBA_CURRENT_SEASON` set edilip edilmediğine bağlı.
- `frontend/` ve `reports/` graf kapsamı dışındaydı.
- Graf sağlık uyarısı: 1.035 edge'in bir ucu boşta (büyük ihtimalle dış kütüphane import'ları), 212 edge birleşmiş. Graf tabanlı bağlantı sayıları alt sınır olarak okunmalı.
