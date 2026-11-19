# Paper Trading Defteri Raporu (2026-27)

> Bu dosya `scripts/paper_ledger_report.py` tarafından üretilir; elle düzenlenmez.
> Kilitli sezon: yalnızca prospektif izleme. Bu sonuçlar model seçimi veya ayar için kullanılmaz.

**Rapor Tarihi:** 2026-11-19T07:56:40Z
**Üretim Sürümü:** `v15`
**Defter:** 222 kayıt, 222 sonuçlanmış ve geçerli, 0 bekleyen, 0 geç (tip-off sonrası, sayılmaz). Son sonuçlanan maç: 2026-11-18

---

## 1. Güncel Sürüm, Canlı Kayıtlar (`v15` / live)

| Metrik | Model | Baseline | Baseline |
|---|---:|---:|---|
| Maç | 178 | 178 | saf Elo eşleşen |
| Doğruluk | %66.3 | %69.1 | saf Elo |
| Brier | 0.2063 | 0.2031 | saf Elo |
| ROC-AUC | 0.7445 | 0.7512 | saf Elo |
| Log-Loss | 0.6006 | - | |
| Ev sahibi kazanma oranı | %51.1 | - | |
| Toplam MAE | 14.63 | 14.56 | son-10 sayı (n=174) |
| Margin MAE | 11.91 | 12.24 | son-10 sayı + ev avantajı |

Not: model MAE satırları tüm maçlar üzerindedir; baseline sütunu yalnızca iki takımın da en az 3 önceki maçı olan alt kümede hesaplanır. Anlamlılık testi aynı alt kümede eşleştirilmiştir.

### Anlamlılık (fark = model - baseline, negatif = model daha iyi, date-block bootstrap %95)

| Karşılaştırma | Ortalama Fark | %95 CI | Model daha iyi olasılığı | Yorum |
|---|---:|---:|---:|---|
| Brier vs saf Elo | +0.0032 | [-0.0113, +0.0179] | %33.0 | fark anlamlı değil (CI sıfırı kapsıyor) (n=178) |
| ROC-AUC vs saf Elo (pozitif = model iyi) | -0.0067 | [-0.0556, +0.0401] | %37.3 | fark anlamlı değil (CI sıfırı kapsıyor) (n=178) |
| Toplam MAE vs son-10 | +0.03 | [-0.36, +0.43] | %43.1 | fark anlamlı değil (CI sıfırı kapsıyor) (n=174) |
| Margin MAE vs son-10 | -0.28 | [-0.98, +0.43] | %77.3 | fark anlamlı değil (CI sıfırı kapsıyor) (n=174) |

### Kalibrasyon (tahmin edilen kazananın olasılığı)

| Güven Bandı | Maç | Ortalama Güven | Gerçekleşen Doğruluk |
|---|---:|---:|---:|
| 50-60% | 48 | %54.5 | %50.0 |
| 60-70% | 58 | %64.5 | %65.5 |
| 70-80% | 52 | %74.7 | %75.0 |
| 80-100% | 20 | %85.0 | %85.0 |

---

## 2. Sürüm ve Kaynak Bazında Döküm

| Sürüm / Kaynak | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| `v11/backfill` | 24 | %54.2 | 0.2360 | 0.2182 | 14.70 | 12.47 |
| `v11/live` | 12 | %50.0 | 0.2335 | 0.2227 | 14.25 | 13.13 |
| `v12/live` | 7 | %42.9 | 0.2934 | 0.2406 | 17.10 | 15.87 |
| `v15/backfill` | 1 | %100.0 | 0.2159 | 0.5863 | 18.40 | 13.80 |
| `v15/live` | 178 | %66.3 | 0.2063 | 0.2031 | 14.63 | 11.91 |
| **Tümü (karışık sürüm)** | 222 | %63.5 | 0.2138 | 0.2087 | 14.71 | 12.17 |

`backfill` kayıtları dondurulmuş çağrı değildir (maç tarihinden önceki verilerle sonradan üretildi, sakatlık raporu yok); güncel sürümün başarısı yalnızca `live` satırlarıyla ölçülür.

---

## 3. Haftalık Seyir (`v15` / live)

| Hafta | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| 2026-10-26 | 48 | %62.5 | 0.2100 | 0.2082 | 16.69 | 11.57 |
| 2026-11-02 | 54 | %74.1 | 0.1641 | 0.1723 | 13.11 | 10.55 |
| 2026-11-09 | 51 | %68.6 | 0.2058 | 0.1880 | 13.82 | 12.99 |
| 2026-11-16 | 25 | %52.0 | 0.2915 | 0.2906 | 15.64 | 13.30 |

---

## 4. Gölge WIN Adayları (`v15` / live)

Aynı maç önü kaydında üretim modelinin yanına yazılan aday olasılıkları. Fark = aday - karşılaştırılan, negatif = aday daha iyi.

| Aday | Maç | Aday Brier | Üretim Brier | Elo Brier | Aday - Üretim (%95 CI) | Aday - Elo (%95 CI) |
|---|---:|---:|---:|---:|---|---|
| `win_live_roster_v1` | 25 | 0.2873 | 0.2915 | 0.2906 | - | - |

Karar kuralı (kayıt başlamadan sabitlendi, `reports/backtests/2026-11-16_win_live_roster_shadow/README.md`): aday yalnızca izlenir; normal sezon bitmeden ve en az 600 ortak maç birikmeden terfi değerlendirilmez.

---

## 5. Oyuncu Projeksiyonları (`v15` / live)

25 maç, oynaması beklenen ve oynayan 488 oyuncu satırı. Oynaması beklenenlerin %93.3'i sahaya çıktı; sahaya çıkanların %98.8'i projeksiyon listesindeydi. Dakika MAE 5.11; ham model sayı MAE 5.182.

| İstatistik | Satır | Model MAE | EMA-10 MAE | Fark (%95 CI) | Yorum |
|---|---:|---:|---:|---|---|
| PTS | 488 | 4.583 | 4.572 | - | yetersiz veri |
| REB | 488 | 2.010 | 2.003 | - | yetersiz veri |
| AST | 488 | 1.397 | 1.385 | - | yetersiz veri |

Model sütunu, sayfada gösterilen (takım skoruyla uzlaştırılmış, sakatlık raporu uygulanmış) projeksiyondur. EMA-10, oyuncunun önceki maçlarının üstel ortalamasıdır ve maçta oynayacağını bilerek hesaplanır; model ise dakikayı da tahmin eder, bu yüzden karşılaştırma walk-forward'daki koşullu ölçümden daha zordur.

---

## Okuma Notları

- Tek sezonda eşleştirilmiş MAE farkının standart hatası yaklaşık 0.09 sayıdır; 0.2 sayının altındaki farklar yüzlerce maç birikmeden doğrulanamaz. Erken sezonda CI'lar geniştir.
- Walk-forward referansı (2021-22 .. 2025-26): `reports/evaluation/multi_season_walk_forward_backtest.md`.
