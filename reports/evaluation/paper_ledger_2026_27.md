# Paper Trading Defteri Raporu (2026-27)

> Bu dosya `scripts/paper_ledger_report.py` tarafından üretilir; elle düzenlenmez.
> Kilitli sezon: yalnızca prospektif izleme. Bu sonuçlar model seçimi veya ayar için kullanılmaz.

**Rapor Tarihi:** 2026-11-24T06:47:48Z
**Üretim Sürümü:** `v15`
**Defter:** 258 kayıt, 258 sonuçlanmış ve geçerli, 0 bekleyen, 0 geç (tip-off sonrası, sayılmaz). Son sonuçlanan maç: 2026-11-23

---

## 1. Güncel Sürüm, Canlı Kayıtlar (`v15` / live)

| Metrik | Model | Baseline | Baseline |
|---|---:|---:|---|
| Maç | 214 | 214 | saf Elo eşleşen |
| Doğruluk | %67.8 | %68.7 | saf Elo |
| Brier | 0.2039 | 0.2024 | saf Elo |
| ROC-AUC | 0.7473 | 0.7485 | saf Elo |
| Log-Loss | 0.5944 | - | |
| Ev sahibi kazanma oranı | %53.3 | - | |
| Toplam MAE | 15.30 | 15.28 | son-10 sayı (n=210) |
| Margin MAE | 11.17 | 11.50 | son-10 sayı + ev avantajı |

Not: model MAE satırları tüm maçlar üzerindedir; baseline sütunu yalnızca iki takımın da en az 3 önceki maçı olan alt kümede hesaplanır. Anlamlılık testi aynı alt kümede eşleştirilmiştir.

### Anlamlılık (fark = model - baseline, negatif = model daha iyi, date-block bootstrap %95)

| Karşılaştırma | Ortalama Fark | %95 CI | Model daha iyi olasılığı | Yorum |
|---|---:|---:|---:|---|
| Brier vs saf Elo | +0.0015 | [-0.0111, +0.0140] | %40.4 | fark anlamlı değil (CI sıfırı kapsıyor) (n=214) |
| ROC-AUC vs saf Elo (pozitif = model iyi) | -0.0012 | [-0.0404, +0.0383] | %42.8 | fark anlamlı değil (CI sıfırı kapsıyor) (n=214) |
| Toplam MAE vs son-10 | -0.01 | [-0.48, +0.50] | %49.4 | fark anlamlı değil (CI sıfırı kapsıyor) (n=210) |
| Margin MAE vs son-10 | -0.31 | [-0.88, +0.28] | %83.2 | fark anlamlı değil (CI sıfırı kapsıyor) (n=210) |

### Kalibrasyon (tahmin edilen kazananın olasılığı)

| Güven Bandı | Maç | Ortalama Güven | Gerçekleşen Doğruluk |
|---|---:|---:|---:|
| 50-60% | 61 | %54.4 | %54.1 |
| 60-70% | 64 | %64.5 | %67.2 |
| 70-80% | 59 | %74.6 | %72.9 |
| 80-100% | 30 | %84.4 | %86.7 |

---

## 2. Sürüm ve Kaynak Bazında Döküm

| Sürüm / Kaynak | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| `v11/backfill` | 24 | %54.2 | 0.2360 | 0.2182 | 14.70 | 12.47 |
| `v11/live` | 12 | %50.0 | 0.2335 | 0.2227 | 14.25 | 13.13 |
| `v12/live` | 7 | %42.9 | 0.2934 | 0.2406 | 17.10 | 15.87 |
| `v15/backfill` | 1 | %100.0 | 0.2159 | 0.5863 | 18.40 | 13.80 |
| `v15/live` | 214 | %67.8 | 0.2039 | 0.2024 | 15.30 | 11.17 |
| **Tümü (karışık sürüm)** | 258 | %65.1 | 0.2107 | 0.2074 | 15.25 | 11.52 |

`backfill` kayıtları dondurulmuş çağrı değildir (maç tarihinden önceki verilerle sonradan üretildi, sakatlık raporu yok); güncel sürümün başarısı yalnızca `live` satırlarıyla ölçülür.

---

## 3. Haftalık Seyir (`v15` / live)

| Hafta | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| 2026-10-26 | 48 | %62.5 | 0.2100 | 0.2082 | 16.69 | 11.57 |
| 2026-11-02 | 54 | %74.1 | 0.1641 | 0.1723 | 13.11 | 10.55 |
| 2026-11-09 | 51 | %68.6 | 0.2058 | 0.1880 | 13.82 | 12.99 |
| 2026-11-16 | 51 | %66.7 | 0.2318 | 0.2353 | 17.60 | 9.96 |
| 2026-11-23 | 10 | %60.0 | 0.2379 | 0.2431 | 16.24 | 9.42 |

---

## 4. Gölge WIN Adayları (`v15` / live)

Aynı maç önü kaydında üretim modelinin yanına yazılan aday olasılıkları. Fark = aday - karşılaştırılan, negatif = aday daha iyi.

| Aday | Maç | Aday Brier | Üretim Brier | Elo Brier | Aday - Üretim (%95 CI) | Aday - Elo (%95 CI) |
|---|---:|---:|---:|---:|---|---|
| `win_live_roster_v1` | 61 | 0.2333 | 0.2328 | 0.2366 | +0.0005 [-0.0032, +0.0049] | -0.0033 [-0.0093, +0.0027] |

Karar kuralı (kayıt başlamadan sabitlendi, `reports/backtests/2026-11-16_win_live_roster_shadow/README.md`): aday yalnızca izlenir; normal sezon bitmeden ve en az 600 ortak maç birikmeden terfi değerlendirilmez.

---

## 5. Oyuncu Projeksiyonları (`v15` / live)

61 maç, oynaması beklenen ve oynayan 1176 oyuncu satırı. Oynaması beklenenlerin %91.0'i sahaya çıktı; sahaya çıkanların %98.4'i projeksiyon listesindeydi. Dakika MAE 5.00; ham model sayı MAE 5.301.

| İstatistik | Satır | Model MAE | EMA-10 MAE | Fark (%95 CI) | Yorum |
|---|---:|---:|---:|---|---|
| PTS | 1176 | 4.700 | 4.740 | -0.039 [-0.117, +0.028] | fark anlamlı değil (CI sıfırı kapsıyor) |
| REB | 1176 | 1.943 | 1.960 | -0.017 [-0.049, +0.020] | fark anlamlı değil (CI sıfırı kapsıyor) |
| AST | 1176 | 1.426 | 1.392 | +0.034 [-0.001, +0.072] | fark anlamlı değil (CI sıfırı kapsıyor) |

Model sütunu, sayfada gösterilen (takım skoruyla uzlaştırılmış, sakatlık raporu uygulanmış) projeksiyondur. EMA-10, oyuncunun önceki maçlarının üstel ortalamasıdır ve maçta oynayacağını bilerek hesaplanır; model ise dakikayı da tahmin eder, bu yüzden karşılaştırma walk-forward'daki koşullu ölçümden daha zordur.

---

## Okuma Notları

- Tek sezonda eşleştirilmiş MAE farkının standart hatası yaklaşık 0.09 sayıdır; 0.2 sayının altındaki farklar yüzlerce maç birikmeden doğrulanamaz. Erken sezonda CI'lar geniştir.
- Walk-forward referansı (2021-22 .. 2025-26): `reports/evaluation/multi_season_walk_forward_backtest.md`.
