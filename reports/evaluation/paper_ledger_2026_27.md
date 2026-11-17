# Paper Trading Defteri Raporu (2026-27)

> Bu dosya `scripts/paper_ledger_report.py` tarafından üretilir; elle düzenlenmez.
> Kilitli sezon: yalnızca prospektif izleme. Bu sonuçlar model seçimi veya ayar için kullanılmaz.

**Rapor Tarihi:** 2026-11-17T13:54:23Z
**Üretim Sürümü:** `v15`
**Defter:** 205 kayıt, 205 sonuçlanmış ve geçerli, 0 bekleyen, 0 geç (tip-off sonrası, sayılmaz). Son sonuçlanan maç: 2026-11-16

---

## 1. Güncel Sürüm, Canlı Kayıtlar (`v15` / live)

| Metrik | Model | Baseline | Baseline |
|---|---:|---:|---|
| Maç | 161 | 161 | saf Elo eşleşen |
| Doğruluk | %68.3 | %70.8 | saf Elo |
| Brier | 0.1975 | 0.1933 | saf Elo |
| ROC-AUC | 0.7679 | 0.7753 | saf Elo |
| Log-Loss | 0.5811 | - | |
| Ev sahibi kazanma oranı | %53.4 | - | |
| Toplam MAE | 14.64 | 14.65 | son-10 sayı (n=157) |
| Margin MAE | 11.80 | 12.17 | son-10 sayı + ev avantajı |

Not: model MAE satırları tüm maçlar üzerindedir; baseline sütunu yalnızca iki takımın da en az 3 önceki maçı olan alt kümede hesaplanır. Anlamlılık testi aynı alt kümede eşleştirilmiştir.

### Anlamlılık (fark = model - baseline, negatif = model daha iyi, date-block bootstrap %95)

| Karşılaştırma | Ortalama Fark | %95 CI | Model daha iyi olasılığı | Yorum |
|---|---:|---:|---:|---|
| Brier vs saf Elo | +0.0042 | [-0.0111, +0.0203] | %30.1 | fark anlamlı değil (CI sıfırı kapsıyor) (n=161) |
| ROC-AUC vs saf Elo (pozitif = model iyi) | -0.0074 | [-0.0603, +0.0420] | %37.2 | fark anlamlı değil (CI sıfırı kapsıyor) (n=161) |
| Toplam MAE vs son-10 | -0.05 | [-0.45, +0.35] | %59.9 | fark anlamlı değil (CI sıfırı kapsıyor) (n=157) |
| Margin MAE vs son-10 | -0.31 | [-1.09, +0.47] | %79.2 | fark anlamlı değil (CI sıfırı kapsıyor) (n=157) |

### Kalibrasyon (tahmin edilen kazananın olasılığı)

| Güven Bandı | Maç | Ortalama Güven | Gerçekleşen Doğruluk |
|---|---:|---:|---:|
| 50-60% | 43 | %54.6 | %51.2 |
| 60-70% | 53 | %64.5 | %66.0 |
| 70-80% | 47 | %74.6 | %78.7 |
| 80-100% | 18 | %85.4 | %88.9 |

---

## 2. Sürüm ve Kaynak Bazında Döküm

| Sürüm / Kaynak | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| `v11/backfill` | 24 | %54.2 | 0.2360 | 0.2182 | 14.70 | 12.47 |
| `v11/live` | 12 | %50.0 | 0.2335 | 0.2227 | 14.25 | 13.13 |
| `v12/live` | 7 | %42.9 | 0.2934 | 0.2406 | 17.10 | 15.87 |
| `v15/backfill` | 1 | %100.0 | 0.2159 | 0.5863 | 18.40 | 13.80 |
| `v15/live` | 161 | %68.3 | 0.1975 | 0.1933 | 14.64 | 11.80 |
| **Tümü (karışık sürüm)** | 205 | %64.9 | 0.2075 | 0.2015 | 14.73 | 12.11 |

`backfill` kayıtları dondurulmuş çağrı değildir (maç tarihinden önceki verilerle sonradan üretildi, sakatlık raporu yok); güncel sürümün başarısı yalnızca `live` satırlarıyla ölçülür.

---

## 3. Haftalık Seyir (`v15` / live)

| Hafta | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| 2026-10-26 | 48 | %62.5 | 0.2100 | 0.2082 | 16.69 | 11.57 |
| 2026-11-02 | 54 | %74.1 | 0.1641 | 0.1723 | 13.11 | 10.55 |
| 2026-11-09 | 51 | %68.6 | 0.2058 | 0.1880 | 13.82 | 12.99 |
| 2026-11-16 | 8 | %62.5 | 0.2954 | 0.2793 | 18.00 | 14.15 |

---

## 4. Gölge WIN Adayları (`v15` / live)

Aynı maç önü kaydında üretim modelinin yanına yazılan aday olasılıkları. Fark = aday - karşılaştırılan, negatif = aday daha iyi.

| Aday | Maç | Aday Brier | Üretim Brier | Elo Brier | Aday - Üretim (%95 CI) | Aday - Elo (%95 CI) |
|---|---:|---:|---:|---:|---|---|
| `win_live_roster_v1` | 8 | 0.2888 | 0.2954 | 0.2793 | - | - |

Karar kuralı (kayıt başlamadan sabitlendi, `reports/backtests/2026-11-16_win_live_roster_shadow/README.md`): aday yalnızca izlenir; normal sezon bitmeden ve en az 600 ortak maç birikmeden terfi değerlendirilmez.

---

## 5. Oyuncu Projeksiyonları (`v15` / live)

8 maç, oynaması beklenen ve oynayan 156 oyuncu satırı. Oynaması beklenenlerin %94.0'i sahaya çıktı; sahaya çıkanların %99.5'i projeksiyon listesindeydi. Dakika MAE 5.65; ham model sayı MAE 5.430.

| İstatistik | Satır | Model MAE | EMA-10 MAE | Fark (%95 CI) | Yorum |
|---|---:|---:|---:|---|---|
| PTS | 156 | 4.688 | 4.600 | - | yetersiz veri |
| REB | 156 | 2.146 | 2.074 | - | yetersiz veri |
| AST | 156 | 1.451 | 1.436 | - | yetersiz veri |

Model sütunu, sayfada gösterilen (takım skoruyla uzlaştırılmış, sakatlık raporu uygulanmış) projeksiyondur. EMA-10, oyuncunun önceki maçlarının üstel ortalamasıdır ve maçta oynayacağını bilerek hesaplanır; model ise dakikayı da tahmin eder, bu yüzden karşılaştırma walk-forward'daki koşullu ölçümden daha zordur.

---

## Okuma Notları

- Tek sezonda eşleştirilmiş MAE farkının standart hatası yaklaşık 0.09 sayıdır; 0.2 sayının altındaki farklar yüzlerce maç birikmeden doğrulanamaz. Erken sezonda CI'lar geniştir.
- Walk-forward referansı (2021-22 .. 2025-26): `reports/evaluation/multi_season_walk_forward_backtest.md`.
