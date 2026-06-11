# Season Bootstrap Runbook

Bu doküman, yeni bir NBA sezonunu repo içine eklerken kullanılacak tek komutu ve bu komutun sırasıyla ne yaptığını tanımlar.

## Ana Komut

```bash
python3 main.py --season 2024-25 --bootstrap-season
```

`--season` parametresi zorunlu sezon girişidir. Sistem bu değeri normalize eder ve sezon token'ına çevirir:

- `2024-25` -> `2024_25`

## Akış Sırası

`--bootstrap-season` çalıştığında pipeline şu adımları izler:

1. Sezon normalize edilir.
2. Tüm season-aware path'ler tek resolver üzerinden çözülür.
3. Schedule dosyaları ilgili sezon için refresh edilir.
4. Raw team game logs ve player game logs kontrol edilir.
5. Eksik tamamlanmış oyunlar varsa fetch edilir ve raw dataset'lere append edilir.
6. Boxscore layer yeniden üretilir.
7. `game_results` yazılır.
8. `team_model_ready_v2` ve diğer feature çıktıları üretilir.
9. `schedule_combined` ve `upcoming_games_context` güncellenir.
10. Frontend export'ları sezon bazlı olarak yazılır.
11. Validation/freshness raporları güncellenir.
12. Training-ready manifest yazılır.

## Üretilen Temel Çıktılar

Bu akışın sonunda tipik olarak aşağıdaki artifact'ler oluşur:

- `data/raw/schedule/nba_schedule_<token>.csv`
- `data/raw/schedule/nba_finals_upcoming_<token>.csv`
- `data/raw/team_games/nba_team_games_<token>_regular_and_playoffs.csv`
- `data/raw/player_games/nba_player_games_<token>_regular_and_playoffs.csv`
- `data/raw/boxscores/team/nba_team_boxscores_<token>.csv`
- `data/raw/boxscores/player/nba_player_boxscores_<token>.csv`
- `data/processed/game_results_<token>.csv`
- `data/processed/schedule_combined_<token>.csv`
- `data/processed/upcoming_games_context_<token>.csv`
- `data/processed/team_model_ready_v2_<token>.csv`
- `frontend/public/data/*.json`
- `data/manifests/season_<token>_manifest.json`

## Manifest Şeması

Bootstrap sonunda yazılan manifest JSON şu üst alanları içerir:

```json
{
  "season": "2024-25",
  "season_token": "2024_25",
  "command": "python3 main.py --season 2024-25 --bootstrap-season",
  "generated_at": "2026-06-10T12:34:56.000000+00:00",
  "artifacts": {
    "team_features": "data/features/team_games_features_2024_25.csv",
    "player_features": "data/features/player_games_features_2024_25.csv",
    "game_results": "data/processed/game_results_2024_25.csv",
    "schedule_combined": "data/processed/schedule_combined_2024_25.csv",
    "upcoming_games_context": "data/processed/upcoming_games_context_2024_25.csv",
    "team_model_ready_v2": "data/processed/team_model_ready_v2_2024_25.csv",
    "frontend_export_dir": "frontend/public/data",
    "sync_passed": true
  }
}
```

Not:

- `generated_at` UTC timestamp olarak yazılır.
- `sync_passed` sync adımının başarı durumunu gösterir.
- Manifest, pipeline’ın ne ürettiğini tek dosyada özetler.

## Neden Bu Akış

Bu yaklaşım şunu sağlar:

- Sezon tek giriş parametresi olur.
- Path karmaşası ortadan kalkar.
- Script'ler tek tek çalıştırılmak zorunda kalmaz.
- Aynı pipeline yeni sezonlar için tekrar kullanılabilir.
- Üretilen artifact'ler tek bir manifest altında izlenebilir.

## Operasyon Notları

- Varsayılan sezon, `config/data_sources.yaml` içindeki `current_season` veya `NBA_CURRENT_SEASON` env var üzerinden çözülür.
- Yeni sezon başlatırken mümkünse önce raw data kaynakları hazır olmalıdır.
- Bootstrap tamamlandıktan sonra manifest dosyası kontrol edilmelidir.

## Yeni Sezon Açılış Checklist'i

1. `config/data_sources.yaml` içindeki `current_season` değerini doğrula.
2. Gerekirse `NBA_CURRENT_SEASON` env var ile sezonu override et.
3. Raw schedule, team logs ve player logs dosyalarının ilgili sezon için hazır olduğunu kontrol et.
4. `python3 main.py --season <season> --bootstrap-season` komutunu çalıştır.
5. `data/manifests/season_<token>_manifest.json` dosyasını açıp artifact listesini doğrula.
6. Frontend'de `frontend/public/data/*.json` çıktılarının güncellendiğini kontrol et.
7. Training için kullanılacak `team_model_ready_v2_<token>.csv` ve bağlı dataset'leri doğrula.

## Troubleshooting

### 1. `get_default_season()` hata veriyor

Bu, sezonda default kaynağın bulunmadığı anlamına gelir.

- `config/data_sources.yaml` içinde `current_season` tanımlı mı kontrol et.
- Alternatif olarak `NBA_CURRENT_SEASON` environment variable ayarla.

### 2. Raw schedule veya raw game logs bulunamıyor

Bu durumda ilgili sezonun source CSV'leri henüz yoktur veya yanlış path'e yazılmıştır.

- `scripts/data_paths.py` tarafından üretilen path'leri kontrol et.
- İlgili raw klasörlerde `<token>` suffix'li dosyaların varlığını doğrula.

### 3. Frontend export çalışıyor ama veri görünmüyor

Genellikle downstream artifact'lerden biri eksiktir.

- `game_results_<token>.csv` var mı bak.
- `team_model_ready_v2_<token>.csv` var mı bak.
- `upcoming_games_context_<token>.csv` var mı bak.

### 4. Manifest yazılıyor ama `sync_passed` false

Bu, raw feature sync katmanında uyuşmazlık olduğunu gösterir.

- Raw row count ile feature row count karşılaştır.
- Eksik season-aware path kullanımını kontrol et.
- Gerekirse sadece `--sync-pipeline` çalıştırıp farkı izole et.

## Komut Örnekleri

Sadece sync adımını çalıştırmak için:

```bash
python3 main.py --season 2024-25 --sync-pipeline
```

Sadece frontend export için:

```bash
python3 main.py --season 2024-25 --export-frontend-data
```

Sadece schedule context için:

```bash
python3 main.py --season 2024-25 --build-schedule-context
```

Sadece manifest üretimini izlemek için bootstrap sonrası şu path'i kontrol et:

```bash
data/manifests/season_2024_25_manifest.json
```
