# Paper Trading Defteri Raporu (2026-27)

> Bu dosya `scripts/paper_ledger_report.py` tarafından üretilir; elle düzenlenmez.
> Kilitli sezon: yalnızca prospektif izleme. Bu sonuçlar model seçimi veya ayar için kullanılmaz.

**Rapor Tarihi:** 2026-11-26T06:47:39Z
**Üretim Sürümü:** `v15`
**Defter:** 270 kayıt, 270 sonuçlanmış ve geçerli, 0 bekleyen, 0 geç (tip-off sonrası, sayılmaz). Son sonuçlanan maç: 2026-11-25

---

## 1. Güncel Sürüm, Canlı Kayıtlar (`v15` / live)

| Metrik | Model | Baseline | Baseline |
|---|---:|---:|---|
| Maç | 226 | 226 | saf Elo eşleşen |
| Doğruluk | %66.8 | %68.1 | saf Elo |
| Brier | 0.2063 | 0.2031 | saf Elo |
| ROC-AUC | 0.7404 | 0.7474 | saf Elo |
| Log-Loss | 0.5995 | - | |
| Ev sahibi kazanma oranı | %53.1 | - | |
| Toplam MAE | 15.54 | 15.36 | son-10 sayı (n=222) |
| Margin MAE | 11.19 | 11.46 | son-10 sayı + ev avantajı |

Not: model MAE satırları tüm maçlar üzerindedir; baseline sütunu yalnızca iki takımın da en az 3 önceki maçı olan alt kümede hesaplanır. Anlamlılık testi aynı alt kümede eşleştirilmiştir.

### Anlamlılık (fark = model - baseline, negatif = model daha iyi, date-block bootstrap %95)

| Karşılaştırma | Ortalama Fark | %95 CI | Model daha iyi olasılığı | Yorum |
|---|---:|---:|---:|---|
| Brier vs saf Elo | +0.0031 | [-0.0087, +0.0155] | %30.3 | fark anlamlı değil (CI sıfırı kapsıyor) (n=226) |
| ROC-AUC vs saf Elo (pozitif = model iyi) | -0.0070 | [-0.0473, +0.0279] | %32.8 | fark anlamlı değil (CI sıfırı kapsıyor) (n=226) |
| Toplam MAE vs son-10 | +0.16 | [-0.37, +0.76] | %28.5 | fark anlamlı değil (CI sıfırı kapsıyor) (n=222) |
| Margin MAE vs son-10 | -0.24 | [-0.78, +0.33] | %78.7 | fark anlamlı değil (CI sıfırı kapsıyor) (n=222) |

### Kalibrasyon (tahmin edilen kazananın olasılığı)

| Güven Bandı | Maç | Ortalama Güven | Gerçekleşen Doğruluk |
|---|---:|---:|---:|
| 50-60% | 65 | %54.4 | %52.3 |
| 60-70% | 70 | %64.6 | %67.1 |
| 70-80% | 61 | %74.6 | %72.1 |
| 80-100% | 30 | %84.4 | %86.7 |

---

## 2. Sürüm ve Kaynak Bazında Döküm

| Sürüm / Kaynak | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| `v11/backfill` | 24 | %54.2 | 0.2360 | 0.2182 | 14.70 | 12.47 |
| `v11/live` | 12 | %50.0 | 0.2335 | 0.2227 | 14.25 | 13.13 |
| `v12/live` | 7 | %42.9 | 0.2934 | 0.2406 | 17.10 | 15.87 |
| `v15/backfill` | 1 | %100.0 | 0.2159 | 0.5863 | 18.40 | 13.80 |
| `v15/live` | 226 | %66.8 | 0.2063 | 0.2031 | 15.54 | 11.19 |
| **Tümü (karışık sürüm)** | 270 | %64.4 | 0.2124 | 0.2077 | 15.46 | 11.52 |

`backfill` kayıtları dondurulmuş çağrı değildir (maç tarihinden önceki verilerle sonradan üretildi, sakatlık raporu yok); güncel sürümün başarısı yalnızca `live` satırlarıyla ölçülür.

---

## 3. Haftalık Seyir (`v15` / live)

| Hafta | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| 2026-10-26 | 48 | %62.5 | 0.2100 | 0.2082 | 16.69 | 11.57 |
| 2026-11-02 | 54 | %74.1 | 0.1641 | 0.1723 | 13.11 | 10.55 |
| 2026-11-09 | 51 | %68.6 | 0.2058 | 0.1880 | 13.82 | 12.99 |
| 2026-11-16 | 51 | %66.7 | 0.2318 | 0.2353 | 17.60 | 9.96 |
| 2026-11-23 | 22 | %54.5 | 0.2437 | 0.2282 | 18.19 | 10.63 |

---

## 4. Gölge WIN Adayları (`v15` / live)

Aynı maç önü kaydında üretim modelinin yanına yazılan aday olasılıkları. Fark = aday - karşılaştırılan, negatif = aday daha iyi.

| Aday | Maç | Aday Brier | Üretim Brier | Elo Brier | Aday - Üretim (%95 CI) | Aday - Elo (%95 CI) |
|---|---:|---:|---:|---:|---|---|
| `win_live_roster_v1` | 73 | 0.2337 | 0.2354 | 0.2332 | -0.0017 [-0.0060, +0.0030] | +0.0005 [-0.0069, +0.0085] |

Karar kuralı (kayıt başlamadan sabitlendi, `reports/backtests/2026-11-16_win_live_roster_shadow/README.md`): aday yalnızca izlenir; normal sezon bitmeden ve en az 600 ortak maç birikmeden terfi değerlendirilmez.

---

## 5. Oyuncu Projeksiyonları (`v15` / live)

73 maç, oynaması beklenen ve oynayan 1408 oyuncu satırı. Oynaması beklenenlerin %90.9'i sahaya çıktı; sahaya çıkanların %98.4'i projeksiyon listesindeydi. Dakika MAE 4.96; ham model sayı MAE 5.202.

| İstatistik | Satır | Model MAE | EMA-10 MAE | Fark (%95 CI) | Yorum |
|---|---:|---:|---:|---|---|
| PTS | 1408 | 4.638 | 4.683 | -0.045 [-0.109, +0.016] | fark anlamlı değil (CI sıfırı kapsıyor) |
| REB | 1408 | 1.943 | 1.952 | -0.009 [-0.044, +0.033] | fark anlamlı değil (CI sıfırı kapsıyor) |
| AST | 1408 | 1.395 | 1.377 | +0.018 [-0.018, +0.059] | fark anlamlı değil (CI sıfırı kapsıyor) |

Model sütunu, sayfada gösterilen (takım skoruyla uzlaştırılmış, sakatlık raporu uygulanmış) projeksiyondur. EMA-10, oyuncunun önceki maçlarının üstel ortalamasıdır ve maçta oynayacağını bilerek hesaplanır; model ise dakikayı da tahmin eder, bu yüzden karşılaştırma walk-forward'daki koşullu ölçümden daha zordur.

---

## Okuma Notları

- Tek sezonda eşleştirilmiş MAE farkının standart hatası yaklaşık 0.09 sayıdır; 0.2 sayının altındaki farklar yüzlerce maç birikmeden doğrulanamaz. Erken sezonda CI'lar geniştir.
- Walk-forward referansı (2021-22 .. 2025-26): `reports/evaluation/multi_season_walk_forward_backtest.md`.
