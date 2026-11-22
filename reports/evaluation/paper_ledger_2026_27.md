# Paper Trading Defteri Raporu (2026-27)

> Bu dosya `scripts/paper_ledger_report.py` tarafından üretilir; elle düzenlenmez.
> Kilitli sezon: yalnızca prospektif izleme. Bu sonuçlar model seçimi veya ayar için kullanılmaz.

**Rapor Tarihi:** 2026-11-22T06:47:44Z
**Üretim Sürümü:** `v15`
**Defter:** 241 kayıt, 241 sonuçlanmış ve geçerli, 0 bekleyen, 0 geç (tip-off sonrası, sayılmaz). Son sonuçlanan maç: 2026-11-21

---

## 1. Güncel Sürüm, Canlı Kayıtlar (`v15` / live)

| Metrik | Model | Baseline | Baseline |
|---|---:|---:|---|
| Maç | 197 | 197 | saf Elo eşleşen |
| Doğruluk | %68.0 | %70.0 | saf Elo |
| Brier | 0.2022 | 0.1996 | saf Elo |
| ROC-AUC | 0.7530 | 0.7572 | saf Elo |
| Log-Loss | 0.5913 | - | |
| Ev sahibi kazanma oranı | %52.8 | - | |
| Toplam MAE | 15.04 | 15.10 | son-10 sayı (n=193) |
| Margin MAE | 11.39 | 11.73 | son-10 sayı + ev avantajı |

Not: model MAE satırları tüm maçlar üzerindedir; baseline sütunu yalnızca iki takımın da en az 3 önceki maçı olan alt kümede hesaplanır. Anlamlılık testi aynı alt kümede eşleştirilmiştir.

### Anlamlılık (fark = model - baseline, negatif = model daha iyi, date-block bootstrap %95)

| Karşılaştırma | Ortalama Fark | %95 CI | Model daha iyi olasılığı | Yorum |
|---|---:|---:|---:|---|
| Brier vs saf Elo | +0.0026 | [-0.0106, +0.0169] | %34.3 | fark anlamlı değil (CI sıfırı kapsıyor) (n=197) |
| ROC-AUC vs saf Elo (pozitif = model iyi) | -0.0042 | [-0.0505, +0.0376] | %38.2 | fark anlamlı değil (CI sıfırı kapsıyor) (n=197) |
| Toplam MAE vs son-10 | -0.08 | [-0.56, +0.38] | %63.6 | fark anlamlı değil (CI sıfırı kapsıyor) (n=193) |
| Margin MAE vs son-10 | -0.31 | [-0.93, +0.36] | %81.8 | fark anlamlı değil (CI sıfırı kapsıyor) (n=193) |

### Kalibrasyon (tahmin edilen kazananın olasılığı)

| Güven Bandı | Maç | Ortalama Güven | Gerçekleşen Doğruluk |
|---|---:|---:|---:|
| 50-60% | 53 | %54.4 | %52.8 |
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
| `v15/live` | 197 | %68.0 | 0.2022 | 0.1996 | 15.04 | 11.39 |
| **Tümü (karışık sürüm)** | 241 | %65.1 | 0.2098 | 0.2054 | 15.04 | 11.72 |

`backfill` kayıtları dondurulmuş çağrı değildir (maç tarihinden önceki verilerle sonradan üretildi, sakatlık raporu yok); güncel sürümün başarısı yalnızca `live` satırlarıyla ölçülür.

---

## 3. Haftalık Seyir (`v15` / live)

| Hafta | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| 2026-10-26 | 48 | %62.5 | 0.2100 | 0.2082 | 16.69 | 11.57 |
| 2026-11-02 | 54 | %74.1 | 0.1641 | 0.1723 | 13.11 | 10.55 |
| 2026-11-09 | 51 | %68.6 | 0.2058 | 0.1880 | 13.82 | 12.99 |
| 2026-11-16 | 44 | %65.9 | 0.2361 | 0.2370 | 17.05 | 10.36 |

---

## 4. Gölge WIN Adayları (`v15` / live)

Aynı maç önü kaydında üretim modelinin yanına yazılan aday olasılıkları. Fark = aday - karşılaştırılan, negatif = aday daha iyi.

| Aday | Maç | Aday Brier | Üretim Brier | Elo Brier | Aday - Üretim (%95 CI) | Aday - Elo (%95 CI) |
|---|---:|---:|---:|---:|---|---|
| `win_live_roster_v1` | 44 | 0.2346 | 0.2361 | 0.2370 | -0.0014 [-0.0048, +0.0025] | -0.0024 [-0.0116, +0.0053] |

Karar kuralı (kayıt başlamadan sabitlendi, `reports/backtests/2026-11-16_win_live_roster_shadow/README.md`): aday yalnızca izlenir; normal sezon bitmeden ve en az 600 ortak maç birikmeden terfi değerlendirilmez.

---

## 5. Oyuncu Projeksiyonları (`v15` / live)

44 maç, oynaması beklenen ve oynayan 847 oyuncu satırı. Oynaması beklenenlerin %91.4'i sahaya çıktı; sahaya çıkanların %98.8'i projeksiyon listesindeydi. Dakika MAE 4.97; ham model sayı MAE 5.308.

| İstatistik | Satır | Model MAE | EMA-10 MAE | Fark (%95 CI) | Yorum |
|---|---:|---:|---:|---|---|
| PTS | 847 | 4.684 | 4.710 | -0.027 [-0.121, +0.038] | fark anlamlı değil (CI sıfırı kapsıyor) |
| REB | 847 | 1.976 | 1.994 | -0.019 [-0.057, +0.026] | fark anlamlı değil (CI sıfırı kapsıyor) |
| AST | 847 | 1.377 | 1.373 | +0.004 [-0.012, +0.015] | fark anlamlı değil (CI sıfırı kapsıyor) |

Model sütunu, sayfada gösterilen (takım skoruyla uzlaştırılmış, sakatlık raporu uygulanmış) projeksiyondur. EMA-10, oyuncunun önceki maçlarının üstel ortalamasıdır ve maçta oynayacağını bilerek hesaplanır; model ise dakikayı da tahmin eder, bu yüzden karşılaştırma walk-forward'daki koşullu ölçümden daha zordur.

---

## Okuma Notları

- Tek sezonda eşleştirilmiş MAE farkının standart hatası yaklaşık 0.09 sayıdır; 0.2 sayının altındaki farklar yüzlerce maç birikmeden doğrulanamaz. Erken sezonda CI'lar geniştir.
- Walk-forward referansı (2021-22 .. 2025-26): `reports/evaluation/multi_season_walk_forward_backtest.md`.
