# Paper Trading Defteri Raporu (2026-27)

> Bu dosya `scripts/paper_ledger_report.py` tarafından üretilir; elle düzenlenmez.
> Kilitli sezon: yalnızca prospektif izleme. Bu sonuçlar model seçimi veya ayar için kullanılmaz.

**Rapor Tarihi:** 2026-11-28T06:47:45Z
**Üretim Sürümü:** `v15`
**Defter:** 281 kayıt, 281 sonuçlanmış ve geçerli, 0 bekleyen, 0 geç (tip-off sonrası, sayılmaz). Son sonuçlanan maç: 2026-11-27

---

## 1. Güncel Sürüm, Canlı Kayıtlar (`v15` / live)

| Metrik | Model | Baseline | Baseline |
|---|---:|---:|---|
| Maç | 237 | 237 | saf Elo eşleşen |
| Doğruluk | %66.2 | %67.5 | saf Elo |
| Brier | 0.2073 | 0.2045 | saf Elo |
| ROC-AUC | 0.7402 | 0.7458 | saf Elo |
| Log-Loss | 0.6016 | - | |
| Ev sahibi kazanma oranı | %52.3 | - | |
| Toplam MAE | 15.74 | 15.40 | son-10 sayı (n=233) |
| Margin MAE | 11.09 | 11.41 | son-10 sayı + ev avantajı |

Not: model MAE satırları tüm maçlar üzerindedir; baseline sütunu yalnızca iki takımın da en az 3 önceki maçı olan alt kümede hesaplanır. Anlamlılık testi aynı alt kümede eşleştirilmiştir.

### Anlamlılık (fark = model - baseline, negatif = model daha iyi, date-block bootstrap %95)

| Karşılaştırma | Ortalama Fark | %95 CI | Model daha iyi olasılığı | Yorum |
|---|---:|---:|---:|---|
| Brier vs saf Elo | +0.0028 | [-0.0085, +0.0143] | %30.6 | fark anlamlı değil (CI sıfırı kapsıyor) (n=237) |
| ROC-AUC vs saf Elo (pozitif = model iyi) | -0.0056 | [-0.0430, +0.0302] | %35.6 | fark anlamlı değil (CI sıfırı kapsıyor) (n=237) |
| Toplam MAE vs son-10 | +0.33 | [-0.26, +0.97] | %14.7 | fark anlamlı değil (CI sıfırı kapsıyor) (n=233) |
| Margin MAE vs son-10 | -0.30 | [-0.82, +0.28] | %85.0 | fark anlamlı değil (CI sıfırı kapsıyor) (n=233) |

### Kalibrasyon (tahmin edilen kazananın olasılığı)

| Güven Bandı | Maç | Ortalama Güven | Gerçekleşen Doğruluk |
|---|---:|---:|---:|
| 50-60% | 66 | %54.3 | %51.5 |
| 60-70% | 75 | %64.5 | %65.3 |
| 70-80% | 66 | %74.7 | %72.7 |
| 80-100% | 30 | %84.4 | %86.7 |

---

## 2. Sürüm ve Kaynak Bazında Döküm

| Sürüm / Kaynak | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| `v11/backfill` | 24 | %54.2 | 0.2360 | 0.2182 | 14.70 | 12.47 |
| `v11/live` | 12 | %50.0 | 0.2335 | 0.2227 | 14.25 | 13.13 |
| `v12/live` | 7 | %42.9 | 0.2934 | 0.2406 | 17.10 | 15.87 |
| `v15/backfill` | 1 | %100.0 | 0.2159 | 0.5863 | 18.40 | 13.80 |
| `v15/live` | 237 | %66.2 | 0.2073 | 0.2045 | 15.74 | 11.09 |
| **Tümü (karışık sürüm)** | 281 | %64.1 | 0.2130 | 0.2087 | 15.63 | 11.43 |

`backfill` kayıtları dondurulmuş çağrı değildir (maç tarihinden önceki verilerle sonradan üretildi, sakatlık raporu yok); güncel sürümün başarısı yalnızca `live` satırlarıyla ölçülür.

---

## 3. Haftalık Seyir (`v15` / live)

| Hafta | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| 2026-10-26 | 48 | %62.5 | 0.2100 | 0.2082 | 16.69 | 11.57 |
| 2026-11-02 | 54 | %74.1 | 0.1641 | 0.1723 | 13.11 | 10.55 |
| 2026-11-09 | 51 | %68.6 | 0.2058 | 0.1880 | 13.82 | 12.99 |
| 2026-11-16 | 51 | %66.7 | 0.2318 | 0.2353 | 17.60 | 9.96 |
| 2026-11-23 | 33 | %54.5 | 0.2385 | 0.2295 | 18.77 | 10.11 |

---

## 4. Gölge WIN Adayları (`v15` / live)

Aynı maç önü kaydında üretim modelinin yanına yazılan aday olasılıkları. Fark = aday - karşılaştırılan, negatif = aday daha iyi.

| Aday | Maç | Aday Brier | Üretim Brier | Elo Brier | Aday - Üretim (%95 CI) | Aday - Elo (%95 CI) |
|---|---:|---:|---:|---:|---|---|
| `win_live_roster_v1` | 84 | 0.2332 | 0.2344 | 0.2330 | -0.0012 [-0.0055, +0.0029] | +0.0002 [-0.0062, +0.0071] |

Karar kuralı (kayıt başlamadan sabitlendi, `reports/backtests/2026-11-16_win_live_roster_shadow/README.md`): aday yalnızca izlenir; normal sezon bitmeden ve en az 600 ortak maç birikmeden terfi değerlendirilmez.

---

## 5. Oyuncu Projeksiyonları (`v15` / live)

84 maç, oynaması beklenen ve oynayan 1622 oyuncu satırı. Oynaması beklenenlerin %90.9'i sahaya çıktı; sahaya çıkanların %98.5'i projeksiyon listesindeydi. Dakika MAE 4.90; ham model sayı MAE 5.091.

| İstatistik | Satır | Model MAE | EMA-10 MAE | Fark (%95 CI) | Yorum |
|---|---:|---:|---:|---|---|
| PTS | 1622 | 4.559 | 4.620 | -0.061 [-0.124, -0.002] | model daha iyi (CI sıfırın altında) |
| REB | 1622 | 1.934 | 1.948 | -0.014 [-0.046, +0.024] | fark anlamlı değil (CI sıfırı kapsıyor) |
| AST | 1622 | 1.399 | 1.389 | +0.009 [-0.027, +0.048] | fark anlamlı değil (CI sıfırı kapsıyor) |

Model sütunu, sayfada gösterilen (takım skoruyla uzlaştırılmış, sakatlık raporu uygulanmış) projeksiyondur. EMA-10, oyuncunun önceki maçlarının üstel ortalamasıdır ve maçta oynayacağını bilerek hesaplanır; model ise dakikayı da tahmin eder, bu yüzden karşılaştırma walk-forward'daki koşullu ölçümden daha zordur.

---

## Okuma Notları

- Tek sezonda eşleştirilmiş MAE farkının standart hatası yaklaşık 0.09 sayıdır; 0.2 sayının altındaki farklar yüzlerce maç birikmeden doğrulanamaz. Erken sezonda CI'lar geniştir.
- Walk-forward referansı (2021-22 .. 2025-26): `reports/evaluation/multi_season_walk_forward_backtest.md`.
