# Paper Trading Defteri Raporu (2026-27)

> Bu dosya `scripts/paper_ledger_report.py` tarafından üretilir; elle düzenlenmez.
> Kilitli sezon: yalnızca prospektif izleme. Bu sonuçlar model seçimi veya ayar için kullanılmaz.

**Rapor Tarihi:** 2026-11-22T00:03:55Z
**Üretim Sürümü:** `v15`
**Defter:** 236 kayıt, 236 sonuçlanmış ve geçerli, 0 bekleyen, 0 geç (tip-off sonrası, sayılmaz). Son sonuçlanan maç: 2026-11-21

---

## 1. Güncel Sürüm, Canlı Kayıtlar (`v15` / live)

| Metrik | Model | Baseline | Baseline |
|---|---:|---:|---|
| Maç | 192 | 192 | saf Elo eşleşen |
| Doğruluk | %67.7 | %69.8 | saf Elo |
| Brier | 0.2023 | 0.1996 | saf Elo |
| ROC-AUC | 0.7559 | 0.7612 | saf Elo |
| Log-Loss | 0.5920 | - | |
| Ev sahibi kazanma oranı | %51.6 | - | |
| Toplam MAE | 14.80 | 14.85 | son-10 sayı (n=188) |
| Margin MAE | 11.57 | 11.86 | son-10 sayı + ev avantajı |

Not: model MAE satırları tüm maçlar üzerindedir; baseline sütunu yalnızca iki takımın da en az 3 önceki maçı olan alt kümede hesaplanır. Anlamlılık testi aynı alt kümede eşleştirilmiştir.

### Anlamlılık (fark = model - baseline, negatif = model daha iyi, date-block bootstrap %95)

| Karşılaştırma | Ortalama Fark | %95 CI | Model daha iyi olasılığı | Yorum |
|---|---:|---:|---:|---|
| Brier vs saf Elo | +0.0027 | [-0.0108, +0.0172] | %33.9 | fark anlamlı değil (CI sıfırı kapsıyor) (n=192) |
| ROC-AUC vs saf Elo (pozitif = model iyi) | -0.0052 | [-0.0518, +0.0378] | %37.0 | fark anlamlı değil (CI sıfırı kapsıyor) (n=192) |
| Toplam MAE vs son-10 | -0.08 | [-0.58, +0.38] | %62.9 | fark anlamlı değil (CI sıfırı kapsıyor) (n=188) |
| Margin MAE vs son-10 | -0.26 | [-0.89, +0.40] | %76.8 | fark anlamlı değil (CI sıfırı kapsıyor) (n=188) |

### Kalibrasyon (tahmin edilen kazananın olasılığı)

| Güven Bandı | Maç | Ortalama Güven | Gerçekleşen Doğruluk |
|---|---:|---:|---:|
| 50-60% | 52 | %54.4 | %51.9 |
| 60-70% | 61 | %64.6 | %67.2 |
| 70-80% | 54 | %74.7 | %75.9 |
| 80-100% | 25 | %84.4 | %84.0 |

---

## 2. Sürüm ve Kaynak Bazında Döküm

| Sürüm / Kaynak | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| `v11/backfill` | 24 | %54.2 | 0.2360 | 0.2182 | 14.70 | 12.47 |
| `v11/live` | 12 | %50.0 | 0.2335 | 0.2227 | 14.25 | 13.13 |
| `v12/live` | 7 | %42.9 | 0.2934 | 0.2406 | 17.10 | 15.87 |
| `v15/backfill` | 1 | %100.0 | 0.2159 | 0.5863 | 18.40 | 13.80 |
| `v15/live` | 192 | %67.7 | 0.2023 | 0.1996 | 14.80 | 11.57 |
| **Tümü (karışık sürüm)** | 236 | %64.8 | 0.2101 | 0.2055 | 14.85 | 11.87 |

`backfill` kayıtları dondurulmuş çağrı değildir (maç tarihinden önceki verilerle sonradan üretildi, sakatlık raporu yok); güncel sürümün başarısı yalnızca `live` satırlarıyla ölçülür.

---

## 3. Haftalık Seyir (`v15` / live)

| Hafta | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| 2026-10-26 | 48 | %62.5 | 0.2100 | 0.2082 | 16.69 | 11.57 |
| 2026-11-02 | 54 | %74.1 | 0.1641 | 0.1723 | 13.11 | 10.55 |
| 2026-11-09 | 51 | %68.6 | 0.2058 | 0.1880 | 13.82 | 12.99 |
| 2026-11-16 | 39 | %64.1 | 0.2413 | 0.2420 | 16.11 | 11.11 |

---

## 4. Gölge WIN Adayları (`v15` / live)

Aynı maç önü kaydında üretim modelinin yanına yazılan aday olasılıkları. Fark = aday - karşılaştırılan, negatif = aday daha iyi.

| Aday | Maç | Aday Brier | Üretim Brier | Elo Brier | Aday - Üretim (%95 CI) | Aday - Elo (%95 CI) |
|---|---:|---:|---:|---:|---|---|
| `win_live_roster_v1` | 39 | 0.2384 | 0.2413 | 0.2420 | -0.0029 [-0.0053, +0.0001] | -0.0035 [-0.0137, +0.0052] |

Karar kuralı (kayıt başlamadan sabitlendi, `reports/backtests/2026-11-16_win_live_roster_shadow/README.md`): aday yalnızca izlenir; normal sezon bitmeden ve en az 600 ortak maç birikmeden terfi değerlendirilmez.

---

## 5. Oyuncu Projeksiyonları (`v15` / live)

39 maç, oynaması beklenen ve oynayan 751 oyuncu satırı. Oynaması beklenenlerin %91.1'i sahaya çıktı; sahaya çıkanların %98.8'i projeksiyon listesindeydi. Dakika MAE 4.96; ham model sayı MAE 5.278.

| İstatistik | Satır | Model MAE | EMA-10 MAE | Fark (%95 CI) | Yorum |
|---|---:|---:|---:|---|---|
| PTS | 751 | 4.676 | 4.725 | -0.049 [-0.185, +0.020] | fark anlamlı değil (CI sıfırı kapsıyor) |
| REB | 751 | 1.959 | 1.973 | -0.014 [-0.061, +0.032] | fark anlamlı değil (CI sıfırı kapsıyor) |
| AST | 751 | 1.394 | 1.391 | +0.003 [-0.016, +0.015] | fark anlamlı değil (CI sıfırı kapsıyor) |

Model sütunu, sayfada gösterilen (takım skoruyla uzlaştırılmış, sakatlık raporu uygulanmış) projeksiyondur. EMA-10, oyuncunun önceki maçlarının üstel ortalamasıdır ve maçta oynayacağını bilerek hesaplanır; model ise dakikayı da tahmin eder, bu yüzden karşılaştırma walk-forward'daki koşullu ölçümden daha zordur.

---

## Okuma Notları

- Tek sezonda eşleştirilmiş MAE farkının standart hatası yaklaşık 0.09 sayıdır; 0.2 sayının altındaki farklar yüzlerce maç birikmeden doğrulanamaz. Erken sezonda CI'lar geniştir.
- Walk-forward referansı (2021-22 .. 2025-26): `reports/evaluation/multi_season_walk_forward_backtest.md`.
