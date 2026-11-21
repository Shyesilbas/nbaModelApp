# Paper Trading Defteri Raporu (2026-27)

> Bu dosya `scripts/paper_ledger_report.py` tarafından üretilir; elle düzenlenmez.
> Kilitli sezon: yalnızca prospektif izleme. Bu sonuçlar model seçimi veya ayar için kullanılmaz.

**Rapor Tarihi:** 2026-11-21T08:36:50Z
**Üretim Sürümü:** `v15`
**Defter:** 235 kayıt, 235 sonuçlanmış ve geçerli, 0 bekleyen, 0 geç (tip-off sonrası, sayılmaz). Son sonuçlanan maç: 2026-11-20

---

## 1. Güncel Sürüm, Canlı Kayıtlar (`v15` / live)

| Metrik | Model | Baseline | Baseline |
|---|---:|---:|---|
| Maç | 191 | 191 | saf Elo eşleşen |
| Doğruluk | %67.5 | %69.6 | saf Elo |
| Brier | 0.2032 | 0.2006 | saf Elo |
| ROC-AUC | 0.7537 | 0.7588 | saf Elo |
| Log-Loss | 0.5942 | - | |
| Ev sahibi kazanma oranı | %51.3 | - | |
| Toplam MAE | 14.83 | 14.75 | son-10 sayı (n=187) |
| Margin MAE | 11.58 | 11.89 | son-10 sayı + ev avantajı |

Not: model MAE satırları tüm maçlar üzerindedir; baseline sütunu yalnızca iki takımın da en az 3 önceki maçı olan alt kümede hesaplanır. Anlamlılık testi aynı alt kümede eşleştirilmiştir.

### Anlamlılık (fark = model - baseline, negatif = model daha iyi, date-block bootstrap %95)

| Karşılaştırma | Ortalama Fark | %95 CI | Model daha iyi olasılığı | Yorum |
|---|---:|---:|---:|---|
| Brier vs saf Elo | +0.0027 | [-0.0108, +0.0176] | %33.3 | fark anlamlı değil (CI sıfırı kapsıyor) (n=191) |
| ROC-AUC vs saf Elo (pozitif = model iyi) | -0.0052 | [-0.0494, +0.0352] | %38.2 | fark anlamlı değil (CI sıfırı kapsıyor) (n=191) |
| Toplam MAE vs son-10 | +0.05 | [-0.34, +0.48] | %41.7 | fark anlamlı değil (CI sıfırı kapsıyor) (n=187) |
| Margin MAE vs son-10 | -0.27 | [-0.90, +0.42] | %79.5 | fark anlamlı değil (CI sıfırı kapsıyor) (n=187) |

### Kalibrasyon (tahmin edilen kazananın olasılığı)

| Güven Bandı | Maç | Ortalama Güven | Gerçekleşen Doğruluk |
|---|---:|---:|---:|
| 50-60% | 52 | %54.4 | %51.9 |
| 60-70% | 61 | %64.6 | %67.2 |
| 70-80% | 54 | %74.7 | %75.9 |
| 80-100% | 24 | %84.4 | %83.3 |

---

## 2. Sürüm ve Kaynak Bazında Döküm

| Sürüm / Kaynak | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| `v11/backfill` | 24 | %54.2 | 0.2360 | 0.2182 | 14.70 | 12.47 |
| `v11/live` | 12 | %50.0 | 0.2335 | 0.2227 | 14.25 | 13.13 |
| `v12/live` | 7 | %42.9 | 0.2934 | 0.2406 | 17.10 | 15.87 |
| `v15/backfill` | 1 | %100.0 | 0.2159 | 0.5863 | 18.40 | 13.80 |
| `v15/live` | 191 | %67.5 | 0.2032 | 0.2006 | 14.83 | 11.58 |
| **Tümü (karışık sürüm)** | 235 | %64.7 | 0.2109 | 0.2063 | 14.87 | 11.89 |

`backfill` kayıtları dondurulmuş çağrı değildir (maç tarihinden önceki verilerle sonradan üretildi, sakatlık raporu yok); güncel sürümün başarısı yalnızca `live` satırlarıyla ölçülür.

---

## 3. Haftalık Seyir (`v15` / live)

| Hafta | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| 2026-10-26 | 48 | %62.5 | 0.2100 | 0.2082 | 16.69 | 11.57 |
| 2026-11-02 | 54 | %74.1 | 0.1641 | 0.1723 | 13.11 | 10.55 |
| 2026-11-09 | 51 | %68.6 | 0.2058 | 0.1880 | 13.82 | 12.99 |
| 2026-11-16 | 38 | %63.2 | 0.2470 | 0.2479 | 16.31 | 11.17 |

---

## 4. Gölge WIN Adayları (`v15` / live)

Aynı maç önü kaydında üretim modelinin yanına yazılan aday olasılıkları. Fark = aday - karşılaştırılan, negatif = aday daha iyi.

| Aday | Maç | Aday Brier | Üretim Brier | Elo Brier | Aday - Üretim (%95 CI) | Aday - Elo (%95 CI) |
|---|---:|---:|---:|---:|---|---|
| `win_live_roster_v1` | 38 | 0.2440 | 0.2470 | 0.2479 | -0.0029 [-0.0055, +0.0001] | -0.0039 [-0.0136, +0.0043] |

Karar kuralı (kayıt başlamadan sabitlendi, `reports/backtests/2026-11-16_win_live_roster_shadow/README.md`): aday yalnızca izlenir; normal sezon bitmeden ve en az 600 ortak maç birikmeden terfi değerlendirilmez.

---

## 5. Oyuncu Projeksiyonları (`v15` / live)

38 maç, oynaması beklenen ve oynayan 734 oyuncu satırı. Oynaması beklenenlerin %91.6'i sahaya çıktı; sahaya çıkanların %98.8'i projeksiyon listesindeydi. Dakika MAE 4.95; ham model sayı MAE 5.231.

| İstatistik | Satır | Model MAE | EMA-10 MAE | Fark (%95 CI) | Yorum |
|---|---:|---:|---:|---|---|
| PTS | 734 | 4.628 | 4.665 | -0.036 [-0.142, +0.032] | fark anlamlı değil (CI sıfırı kapsıyor) |
| REB | 734 | 1.951 | 1.956 | -0.005 [-0.039, +0.040] | fark anlamlı değil (CI sıfırı kapsıyor) |
| AST | 734 | 1.386 | 1.382 | +0.004 [-0.014, +0.016] | fark anlamlı değil (CI sıfırı kapsıyor) |

Model sütunu, sayfada gösterilen (takım skoruyla uzlaştırılmış, sakatlık raporu uygulanmış) projeksiyondur. EMA-10, oyuncunun önceki maçlarının üstel ortalamasıdır ve maçta oynayacağını bilerek hesaplanır; model ise dakikayı da tahmin eder, bu yüzden karşılaştırma walk-forward'daki koşullu ölçümden daha zordur.

---

## Okuma Notları

- Tek sezonda eşleştirilmiş MAE farkının standart hatası yaklaşık 0.09 sayıdır; 0.2 sayının altındaki farklar yüzlerce maç birikmeden doğrulanamaz. Erken sezonda CI'lar geniştir.
- Walk-forward referansı (2021-22 .. 2025-26): `reports/evaluation/multi_season_walk_forward_backtest.md`.
