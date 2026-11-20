# Paper Trading Defteri Raporu (2026-27)

> Bu dosya `scripts/paper_ledger_report.py` tarafından üretilir; elle düzenlenmez.
> Kilitli sezon: yalnızca prospektif izleme. Bu sonuçlar model seçimi veya ayar için kullanılmaz.

**Rapor Tarihi:** 2026-11-20T07:30:20Z
**Üretim Sürümü:** `v15`
**Defter:** 226 kayıt, 226 sonuçlanmış ve geçerli, 0 bekleyen, 0 geç (tip-off sonrası, sayılmaz). Son sonuçlanan maç: 2026-11-19

---

## 1. Güncel Sürüm, Canlı Kayıtlar (`v15` / live)

| Metrik | Model | Baseline | Baseline |
|---|---:|---:|---|
| Maç | 182 | 182 | saf Elo eşleşen |
| Doğruluk | %67.0 | %69.2 | saf Elo |
| Brier | 0.2044 | 0.2017 | saf Elo |
| ROC-AUC | 0.7504 | 0.7552 | saf Elo |
| Log-Loss | 0.5964 | - | |
| Ev sahibi kazanma oranı | %51.1 | - | |
| Toplam MAE | 14.65 | 14.49 | son-10 sayı (n=178) |
| Margin MAE | 11.81 | 12.14 | son-10 sayı + ev avantajı |

Not: model MAE satırları tüm maçlar üzerindedir; baseline sütunu yalnızca iki takımın da en az 3 önceki maçı olan alt kümede hesaplanır. Anlamlılık testi aynı alt kümede eşleştirilmiştir.

### Anlamlılık (fark = model - baseline, negatif = model daha iyi, date-block bootstrap %95)

| Karşılaştırma | Ortalama Fark | %95 CI | Model daha iyi olasılığı | Yorum |
|---|---:|---:|---:|---|
| Brier vs saf Elo | +0.0027 | [-0.0113, +0.0180] | %33.7 | fark anlamlı değil (CI sıfırı kapsıyor) (n=182) |
| ROC-AUC vs saf Elo (pozitif = model iyi) | -0.0048 | [-0.0563, +0.0385] | %36.9 | fark anlamlı değil (CI sıfırı kapsıyor) (n=182) |
| Toplam MAE vs son-10 | +0.11 | [-0.29, +0.53] | %29.0 | fark anlamlı değil (CI sıfırı kapsıyor) (n=178) |
| Margin MAE vs son-10 | -0.28 | [-0.94, +0.47] | %78.5 | fark anlamlı değil (CI sıfırı kapsıyor) (n=178) |

### Kalibrasyon (tahmin edilen kazananın olasılığı)

| Güven Bandı | Maç | Ortalama Güven | Gerçekleşen Doğruluk |
|---|---:|---:|---:|
| 50-60% | 50 | %54.5 | %52.0 |
| 60-70% | 58 | %64.5 | %65.5 |
| 70-80% | 53 | %74.8 | %75.5 |
| 80-100% | 21 | %84.8 | %85.7 |

---

## 2. Sürüm ve Kaynak Bazında Döküm

| Sürüm / Kaynak | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| `v11/backfill` | 24 | %54.2 | 0.2360 | 0.2182 | 14.70 | 12.47 |
| `v11/live` | 12 | %50.0 | 0.2335 | 0.2227 | 14.25 | 13.13 |
| `v12/live` | 7 | %42.9 | 0.2934 | 0.2406 | 17.10 | 15.87 |
| `v15/backfill` | 1 | %100.0 | 0.2159 | 0.5863 | 18.40 | 13.80 |
| `v15/live` | 182 | %67.0 | 0.2044 | 0.2017 | 14.65 | 11.81 |
| **Tümü (karışık sürüm)** | 226 | %64.2 | 0.2121 | 0.2075 | 14.72 | 12.09 |

`backfill` kayıtları dondurulmuş çağrı değildir (maç tarihinden önceki verilerle sonradan üretildi, sakatlık raporu yok); güncel sürümün başarısı yalnızca `live` satırlarıyla ölçülür.

---

## 3. Haftalık Seyir (`v15` / live)

| Hafta | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| 2026-10-26 | 48 | %62.5 | 0.2100 | 0.2082 | 16.69 | 11.57 |
| 2026-11-02 | 54 | %74.1 | 0.1641 | 0.1723 | 13.11 | 10.55 |
| 2026-11-09 | 51 | %68.6 | 0.2058 | 0.1880 | 13.82 | 12.99 |
| 2026-11-16 | 29 | %58.6 | 0.2678 | 0.2698 | 15.59 | 12.50 |

---

## 4. Gölge WIN Adayları (`v15` / live)

Aynı maç önü kaydında üretim modelinin yanına yazılan aday olasılıkları. Fark = aday - karşılaştırılan, negatif = aday daha iyi.

| Aday | Maç | Aday Brier | Üretim Brier | Elo Brier | Aday - Üretim (%95 CI) | Aday - Elo (%95 CI) |
|---|---:|---:|---:|---:|---|---|
| `win_live_roster_v1` | 29 | 0.2635 | 0.2678 | 0.2698 | - | - |

Karar kuralı (kayıt başlamadan sabitlendi, `reports/backtests/2026-11-16_win_live_roster_shadow/README.md`): aday yalnızca izlenir; normal sezon bitmeden ve en az 600 ortak maç birikmeden terfi değerlendirilmez.

---

## 5. Oyuncu Projeksiyonları (`v15` / live)

29 maç, oynaması beklenen ve oynayan 567 oyuncu satırı. Oynaması beklenenlerin %93.3'i sahaya çıktı; sahaya çıkanların %98.9'i projeksiyon listesindeydi. Dakika MAE 5.00; ham model sayı MAE 5.160.

| İstatistik | Satır | Model MAE | EMA-10 MAE | Fark (%95 CI) | Yorum |
|---|---:|---:|---:|---|---|
| PTS | 567 | 4.518 | 4.552 | - | yetersiz veri |
| REB | 567 | 1.989 | 1.990 | - | yetersiz veri |
| AST | 567 | 1.380 | 1.367 | - | yetersiz veri |

Model sütunu, sayfada gösterilen (takım skoruyla uzlaştırılmış, sakatlık raporu uygulanmış) projeksiyondur. EMA-10, oyuncunun önceki maçlarının üstel ortalamasıdır ve maçta oynayacağını bilerek hesaplanır; model ise dakikayı da tahmin eder, bu yüzden karşılaştırma walk-forward'daki koşullu ölçümden daha zordur.

---

## Okuma Notları

- Tek sezonda eşleştirilmiş MAE farkının standart hatası yaklaşık 0.09 sayıdır; 0.2 sayının altındaki farklar yüzlerce maç birikmeden doğrulanamaz. Erken sezonda CI'lar geniştir.
- Walk-forward referansı (2021-22 .. 2025-26): `reports/evaluation/multi_season_walk_forward_backtest.md`.
