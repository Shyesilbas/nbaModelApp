# Paper Trading Defteri Raporu (2026-27)

> Bu dosya `scripts/paper_ledger_report.py` tarafından üretilir; elle düzenlenmez.
> Kilitli sezon: yalnızca prospektif izleme. Bu sonuçlar model seçimi veya ayar için kullanılmaz.

**Rapor Tarihi:** 2026-11-23T00:03:56Z
**Üretim Sürümü:** `v15`
**Defter:** 246 kayıt, 242 sonuçlanmış ve geçerli, 4 bekleyen, 0 geç (tip-off sonrası, sayılmaz). Son sonuçlanan maç: 2026-11-22

---

## 1. Güncel Sürüm, Canlı Kayıtlar (`v15` / live)

| Metrik | Model | Baseline | Baseline |
|---|---:|---:|---|
| Maç | 198 | 198 | saf Elo eşleşen |
| Doğruluk | %67.7 | %69.7 | saf Elo |
| Brier | 0.2028 | 0.1999 | saf Elo |
| ROC-AUC | 0.7503 | 0.7557 | saf Elo |
| Log-Loss | 0.5926 | - | |
| Ev sahibi kazanma oranı | %53.0 | - | |
| Toplam MAE | 15.09 | 15.15 | son-10 sayı (n=194) |
| Margin MAE | 11.39 | 11.73 | son-10 sayı + ev avantajı |

Not: model MAE satırları tüm maçlar üzerindedir; baseline sütunu yalnızca iki takımın da en az 3 önceki maçı olan alt kümede hesaplanır. Anlamlılık testi aynı alt kümede eşleştirilmiştir.

### Anlamlılık (fark = model - baseline, negatif = model daha iyi, date-block bootstrap %95)

| Karşılaştırma | Ortalama Fark | %95 CI | Model daha iyi olasılığı | Yorum |
|---|---:|---:|---:|---|
| Brier vs saf Elo | +0.0029 | [-0.0097, +0.0166] | %32.9 | fark anlamlı değil (CI sıfırı kapsıyor) (n=198) |
| ROC-AUC vs saf Elo (pozitif = model iyi) | -0.0053 | [-0.0482, +0.0353] | %37.7 | fark anlamlı değil (CI sıfırı kapsıyor) (n=198) |
| Toplam MAE vs son-10 | -0.09 | [-0.55, +0.39] | %65.3 | fark anlamlı değil (CI sıfırı kapsıyor) (n=194) |
| Margin MAE vs son-10 | -0.30 | [-0.92, +0.39] | %81.5 | fark anlamlı değil (CI sıfırı kapsıyor) (n=194) |

### Kalibrasyon (tahmin edilen kazananın olasılığı)

| Güven Bandı | Maç | Ortalama Güven | Gerçekleşen Doğruluk |
|---|---:|---:|---:|
| 50-60% | 54 | %54.4 | %51.8 |
| 60-70% | 62 | %64.6 | %67.7 |
| 70-80% | 56 | %74.7 | %75.0 |
| 80-100% | 26 | %84.6 | %84.6 |

---

## 2. Sürüm ve Kaynak Bazında Döküm

| Sürüm / Kaynak | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| `v11/backfill` | 24 | %54.2 | 0.2360 | 0.2182 | 14.70 | 12.47 |
| `v11/live` | 12 | %50.0 | 0.2335 | 0.2227 | 14.25 | 13.13 |
| `v12/live` | 7 | %42.9 | 0.2934 | 0.2406 | 17.10 | 15.87 |
| `v15/backfill` | 1 | %100.0 | 0.2159 | 0.5863 | 18.40 | 13.80 |
| `v15/live` | 198 | %67.7 | 0.2028 | 0.1999 | 15.09 | 11.39 |
| **Tümü (karışık sürüm)** | 242 | %64.9 | 0.2103 | 0.2057 | 15.08 | 11.72 |

`backfill` kayıtları dondurulmuş çağrı değildir (maç tarihinden önceki verilerle sonradan üretildi, sakatlık raporu yok); güncel sürümün başarısı yalnızca `live` satırlarıyla ölçülür.

---

## 3. Haftalık Seyir (`v15` / live)

| Hafta | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| 2026-10-26 | 48 | %62.5 | 0.2100 | 0.2082 | 16.69 | 11.57 |
| 2026-11-02 | 54 | %74.1 | 0.1641 | 0.1723 | 13.11 | 10.55 |
| 2026-11-09 | 51 | %68.6 | 0.2058 | 0.1880 | 13.82 | 12.99 |
| 2026-11-16 | 45 | %64.4 | 0.2382 | 0.2378 | 17.22 | 10.39 |

---

## 4. Gölge WIN Adayları (`v15` / live)

Aynı maç önü kaydında üretim modelinin yanına yazılan aday olasılıkları. Fark = aday - karşılaştırılan, negatif = aday daha iyi.

| Aday | Maç | Aday Brier | Üretim Brier | Elo Brier | Aday - Üretim (%95 CI) | Aday - Elo (%95 CI) |
|---|---:|---:|---:|---:|---|---|
| `win_live_roster_v1` | 45 | 0.2369 | 0.2382 | 0.2378 | -0.0014 [-0.0046, +0.0029] | -0.0009 [-0.0098, +0.0084] |

Karar kuralı (kayıt başlamadan sabitlendi, `reports/backtests/2026-11-16_win_live_roster_shadow/README.md`): aday yalnızca izlenir; normal sezon bitmeden ve en az 600 ortak maç birikmeden terfi değerlendirilmez.

---

## 5. Oyuncu Projeksiyonları (`v15` / live)

45 maç, oynaması beklenen ve oynayan 865 oyuncu satırı. Oynaması beklenenlerin %91.2'i sahaya çıktı; sahaya çıkanların %98.8'i projeksiyon listesindeydi. Dakika MAE 4.99; ham model sayı MAE 5.356.

| İstatistik | Satır | Model MAE | EMA-10 MAE | Fark (%95 CI) | Yorum |
|---|---:|---:|---:|---|---|
| PTS | 865 | 4.738 | 4.763 | -0.025 [-0.114, +0.040] | fark anlamlı değil (CI sıfırı kapsıyor) |
| REB | 865 | 1.981 | 1.991 | -0.009 [-0.052, +0.047] | fark anlamlı değil (CI sıfırı kapsıyor) |
| AST | 865 | 1.390 | 1.384 | +0.006 [-0.009, +0.018] | fark anlamlı değil (CI sıfırı kapsıyor) |

Model sütunu, sayfada gösterilen (takım skoruyla uzlaştırılmış, sakatlık raporu uygulanmış) projeksiyondur. EMA-10, oyuncunun önceki maçlarının üstel ortalamasıdır ve maçta oynayacağını bilerek hesaplanır; model ise dakikayı da tahmin eder, bu yüzden karşılaştırma walk-forward'daki koşullu ölçümden daha zordur.

---

## Okuma Notları

- Tek sezonda eşleştirilmiş MAE farkının standart hatası yaklaşık 0.09 sayıdır; 0.2 sayının altındaki farklar yüzlerce maç birikmeden doğrulanamaz. Erken sezonda CI'lar geniştir.
- Walk-forward referansı (2021-22 .. 2025-26): `reports/evaluation/multi_season_walk_forward_backtest.md`.
