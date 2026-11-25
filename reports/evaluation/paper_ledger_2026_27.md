# Paper Trading Defteri Raporu (2026-27)

> Bu dosya `scripts/paper_ledger_report.py` tarafından üretilir; elle düzenlenmez.
> Kilitli sezon: yalnızca prospektif izleme. Bu sonuçlar model seçimi veya ayar için kullanılmaz.

**Rapor Tarihi:** 2026-11-25T06:47:48Z
**Üretim Sürümü:** `v15`
**Defter:** 261 kayıt, 261 sonuçlanmış ve geçerli, 0 bekleyen, 0 geç (tip-off sonrası, sayılmaz). Son sonuçlanan maç: 2026-11-24

---

## 1. Güncel Sürüm, Canlı Kayıtlar (`v15` / live)

| Metrik | Model | Baseline | Baseline |
|---|---:|---:|---|
| Maç | 217 | 217 | saf Elo eşleşen |
| Doğruluk | %67.3 | %68.7 | saf Elo |
| Brier | 0.2054 | 0.2034 | saf Elo |
| ROC-AUC | 0.7451 | 0.7474 | saf Elo |
| Log-Loss | 0.5977 | - | |
| Ev sahibi kazanma oranı | %52.5 | - | |
| Toplam MAE | 15.42 | 15.40 | son-10 sayı (n=213) |
| Margin MAE | 11.27 | 11.56 | son-10 sayı + ev avantajı |

Not: model MAE satırları tüm maçlar üzerindedir; baseline sütunu yalnızca iki takımın da en az 3 önceki maçı olan alt kümede hesaplanır. Anlamlılık testi aynı alt kümede eşleştirilmiştir.

### Anlamlılık (fark = model - baseline, negatif = model daha iyi, date-block bootstrap %95)

| Karşılaştırma | Ortalama Fark | %95 CI | Model daha iyi olasılığı | Yorum |
|---|---:|---:|---:|---|
| Brier vs saf Elo | +0.0020 | [-0.0100, +0.0151] | %37.8 | fark anlamlı değil (CI sıfırı kapsıyor) (n=217) |
| ROC-AUC vs saf Elo (pozitif = model iyi) | -0.0023 | [-0.0446, +0.0371] | %41.8 | fark anlamlı değil (CI sıfırı kapsıyor) (n=217) |
| Toplam MAE vs son-10 | +0.00 | [-0.49, +0.49] | %48.1 | fark anlamlı değil (CI sıfırı kapsıyor) (n=213) |
| Margin MAE vs son-10 | -0.26 | [-0.86, +0.37] | %79.8 | fark anlamlı değil (CI sıfırı kapsıyor) (n=213) |

### Kalibrasyon (tahmin edilen kazananın olasılığı)

| Güven Bandı | Maç | Ortalama Güven | Gerçekleşen Doğruluk |
|---|---:|---:|---:|
| 50-60% | 62 | %54.4 | %53.2 |
| 60-70% | 65 | %64.6 | %67.7 |
| 70-80% | 60 | %74.6 | %71.7 |
| 80-100% | 30 | %84.4 | %86.7 |

---

## 2. Sürüm ve Kaynak Bazında Döküm

| Sürüm / Kaynak | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| `v11/backfill` | 24 | %54.2 | 0.2360 | 0.2182 | 14.70 | 12.47 |
| `v11/live` | 12 | %50.0 | 0.2335 | 0.2227 | 14.25 | 13.13 |
| `v12/live` | 7 | %42.9 | 0.2934 | 0.2406 | 17.10 | 15.87 |
| `v15/backfill` | 1 | %100.0 | 0.2159 | 0.5863 | 18.40 | 13.80 |
| `v15/live` | 217 | %67.3 | 0.2054 | 0.2034 | 15.42 | 11.27 |
| **Tümü (karışık sürüm)** | 261 | %64.8 | 0.2119 | 0.2081 | 15.36 | 11.60 |

`backfill` kayıtları dondurulmuş çağrı değildir (maç tarihinden önceki verilerle sonradan üretildi, sakatlık raporu yok); güncel sürümün başarısı yalnızca `live` satırlarıyla ölçülür.

---

## 3. Haftalık Seyir (`v15` / live)

| Hafta | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| 2026-10-26 | 48 | %62.5 | 0.2100 | 0.2082 | 16.69 | 11.57 |
| 2026-11-02 | 54 | %74.1 | 0.1641 | 0.1723 | 13.11 | 10.55 |
| 2026-11-09 | 51 | %68.6 | 0.2058 | 0.1880 | 13.82 | 12.99 |
| 2026-11-16 | 51 | %66.7 | 0.2318 | 0.2353 | 17.60 | 9.96 |
| 2026-11-23 | 13 | %53.8 | 0.2551 | 0.2506 | 18.08 | 11.52 |

---

## 4. Gölge WIN Adayları (`v15` / live)

Aynı maç önü kaydında üretim modelinin yanına yazılan aday olasılıkları. Fark = aday - karşılaştırılan, negatif = aday daha iyi.

| Aday | Maç | Aday Brier | Üretim Brier | Elo Brier | Aday - Üretim (%95 CI) | Aday - Elo (%95 CI) |
|---|---:|---:|---:|---:|---|---|
| `win_live_roster_v1` | 64 | 0.2359 | 0.2365 | 0.2384 | -0.0006 [-0.0053, +0.0039] | -0.0025 [-0.0082, +0.0038] |

Karar kuralı (kayıt başlamadan sabitlendi, `reports/backtests/2026-11-16_win_live_roster_shadow/README.md`): aday yalnızca izlenir; normal sezon bitmeden ve en az 600 ortak maç birikmeden terfi değerlendirilmez.

---

## 5. Oyuncu Projeksiyonları (`v15` / live)

64 maç, oynaması beklenen ve oynayan 1234 oyuncu satırı. Oynaması beklenenlerin %91.0'i sahaya çıktı; sahaya çıkanların %98.4'i projeksiyon listesindeydi. Dakika MAE 4.98; ham model sayı MAE 5.274.

| İstatistik | Satır | Model MAE | EMA-10 MAE | Fark (%95 CI) | Yorum |
|---|---:|---:|---:|---|---|
| PTS | 1234 | 4.687 | 4.730 | -0.043 [-0.118, +0.026] | fark anlamlı değil (CI sıfırı kapsıyor) |
| REB | 1234 | 1.933 | 1.955 | -0.022 [-0.056, +0.014] | fark anlamlı değil (CI sıfırı kapsıyor) |
| AST | 1234 | 1.415 | 1.389 | +0.025 [-0.017, +0.064] | fark anlamlı değil (CI sıfırı kapsıyor) |

Model sütunu, sayfada gösterilen (takım skoruyla uzlaştırılmış, sakatlık raporu uygulanmış) projeksiyondur. EMA-10, oyuncunun önceki maçlarının üstel ortalamasıdır ve maçta oynayacağını bilerek hesaplanır; model ise dakikayı da tahmin eder, bu yüzden karşılaştırma walk-forward'daki koşullu ölçümden daha zordur.

---

## Okuma Notları

- Tek sezonda eşleştirilmiş MAE farkının standart hatası yaklaşık 0.09 sayıdır; 0.2 sayının altındaki farklar yüzlerce maç birikmeden doğrulanamaz. Erken sezonda CI'lar geniştir.
- Walk-forward referansı (2021-22 .. 2025-26): `reports/evaluation/multi_season_walk_forward_backtest.md`.
