# API ile CLI farklı WIN olasılığı veriyor

**Durum:** Çözüldü (2026-10-21, seçenek A).
**Bulunduğu yer:** 3. aşama doğrulaması. API çıktısı taşımadan önce ve sonra birebir aynıydı, yani fark yeniden düzenlemeden gelmiyor; önceden de vardı.

## Belirti

LAL - BOS, `prediction_date = 2026-10-22`:

| Yol | P(LAL kazanır) |
|---|---|
| `POST /predict/win-probability` | **0.4589** |
| `POST /predict/game_full`, `POST /predict/score` (içinde WIN) | **0.4589** |
| `scripts/predict_daily_schedule.py` | 0.4589 (aynı harmanlamayı kendi kopyasıyla yapıyor) |
| `scripts/predict_matchup.py` | **0.3934** |
| `POST /predict/explain` (`final_prediction`) | **0.3934** |

Tekrar üretmek için:

```bash
PYTHONPATH=. python3 scripts/predict_matchup.py --home LAL --away BOS --prediction-date 2026-10-22
curl -s -X POST localhost:8001/predict/win-probability -H 'content-type: application/json' \
  -d '{"home_team":"LAL","away_team":"BOS","prediction_date":"2026-10-22"}'
```

## Sebep

Sezon başında servis, model olasılığını saf Elo olasılığıyla harmanlıyor (`src/api/services/win_prediction.py:73`):

```
w = max(0, 1 - n_min / EARLY_SEASON_BLEND_GAMES) * 0.40      # build_matchup_features.py:667
p = (1 - w) * p_model + w * p_elo
```

Bu örnekte LAL 0, BOS 1 maç oynamış, yani `n_min = 0` ve `w = 0.40`. Model 0.3934 diyor, Elo + ev sahibi avantajı (1551.9 + 50 - 1561.9) 0.5572 diyor; harmanlama 0.6 × 0.3934 + 0.4 × 0.5572 = 0.4589 çıkıyor.

`predict_matchup.py` ve SHAP açıklaması bu adımı uygulamıyor, ham model olasılığını gösteriyor. Harmanlama sadece ilk `EARLY_SEASON_BLEND_GAMES = 6` maçta devrede olduğu için fark sezonun ilk 1-2 haftasında görünür, sonra kaybolur.

## Bağlantılı tutarsızlıklar

1. **Harmanlama kodu iki kopya:** `src/api/services/win_prediction.py` ve `scripts/predict_daily_schedule.py:112` aynı formülü ayrı ayrı yazıyor. Biri değişirse diğeri sessizce ayrışır.
2. **`src/inference/win_predictor.py` (`WinPredictor`) da harmanlamıyor.** Bu sınıf `predict_matchup.py`'den ayrı, üçüncü bir WIN yolu.
3. **Dokümanla kod uyuşmuyor:** `reports/production/model_performance_and_architecture_report.md:91` "ilk 12 maç" diyor, kod 6 maç (`EARLY_SEASON_BLEND_GAMES = 6`).
4. **SHAP açıklaması API'nin döndürdüğü olasılığı açıklamıyor:** sezon başında arayüzdeki olasılıkla açıklamadaki `final_prediction` farklı.
5. **Değerlendirme hangi olasılığı ölçüyor?** `scripts/backtest/live.py` ikisini de kaydediyor (`P_HOME_WIN` harmanlanmış, `P_HOME_WIN_MODEL_ONLY` ham). Walk-forward ve offline backtest'in hangisini ölçtüğü ayrıca kontrol edilmeli; README metrikleri hangi olasılığa ait, netleşmeli.

## Çözüm seçenekleri

- **A (önerilen):** Harmanlamayı tek bir fonksiyona taşımak (örneğin `src/inference/`) ve bütün WIN yollarının bunu kullanması: API, `predict_matchup`, `predict_daily_schedule`, `WinPredictor`. SHAP yanıtına harmanlama ağırlığını ve Elo payını ayrı bir kalem olarak eklemek.
- **B:** CLI ve explain ham olasılığı göstermeye devam etsin, ama çıktıda "model only" diye etiketlensin ve harmanlanmış değer de yanında verilsin.

Her iki durumda da madde 3'teki doküman düzeltilmeli. Harmanlamanın kendisi tutuyor mu (0.40 tavan, 6 maç), sezon başı maçlarında `live.py` replay'inin iki sütunu karşılaştırılarak ölçülebilir.

## Takip

Ek bulgu: `predict_daily_schedule.py` Elo payında ev avantajını 100 alıyordu, API 50 (`HOME_COURT_ADVANTAGE`); ortak fonksiyonla düzeldi.

- [x] Seçenek kararı (A / B)
- [x] Tek harmanlama fonksiyonu (`src/inference/win_blend.py`), API, predict_matchup, predict_daily_schedule, WinPredictor ve SHAP ona bağlı
- [x] SHAP yanıtı harmanlamayı gösteriyor
- [x] Model raporundaki "12 maç" düzeltildi
- [x] Backtest'lerin ölçtüğü olasılık netleşti, README metrikleri etiketlendi (offline walk-forward = ham model, `live.py` = harmanlı; ilk 250 maçta harmanlı Brier 0.2185 vs ham 0.2204, harmanlı 95 maçta)
