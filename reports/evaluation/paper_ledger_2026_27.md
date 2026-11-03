# Paper Trading Defteri Raporu (2026-27)

> Bu dosya `scripts/paper_ledger_report.py` tarafından üretilir; elle düzenlenmez.
> Kilitli sezon: yalnızca prospektif izleme. Bu sonuçlar model seçimi veya ayar için kullanılmaz.

**Rapor Tarihi:** 2026-11-03T16:51:52Z
**Üretim Sürümü:** `v15`
**Defter:** 106 kayıt, 106 sonuçlanmış ve geçerli, 0 bekleyen, 0 geç (tip-off sonrası, sayılmaz). Son sonuçlanan maç: 2026-11-02

---

## 1. Güncel Sürüm, Canlı Kayıtlar (`v15` / live)

| Metrik | Model | Baseline | Baseline |
|---|---:|---:|---|
| Maç | 63 | 63 | saf Elo eşleşen |
| Doğruluk | %65.1 | %66.7 | saf Elo |
| Brier | 0.1963 | 0.2070 | saf Elo |
| Log-Loss | 0.5795 | - | |
| Ev sahibi kazanma oranı | %55.6 | - | |
| Toplam MAE | 16.25 | 16.53 | son-10 sayı (n=59) |
| Margin MAE | 11.13 | 11.76 | son-10 sayı + ev avantajı |

Not: model MAE satırları tüm maçlar üzerindedir; baseline sütunu yalnızca iki takımın da en az 3 önceki maçı olan alt kümede hesaplanır. Anlamlılık testi aynı alt kümede eşleştirilmiştir.

### Anlamlılık (fark = model - baseline, negatif = model daha iyi, date-block bootstrap %95)

| Karşılaştırma | Ortalama Fark | %95 CI | Model daha iyi olasılığı | Yorum |
|---|---:|---:|---:|---|
| Brier vs saf Elo | -0.0106 | [-0.0345, +0.0213] | %74.9 | fark anlamlı değil (CI sıfırı kapsıyor) (n=63) |
| Toplam MAE vs son-10 | -0.30 | [-0.90, +0.52] | %76.5 | fark anlamlı değil (CI sıfırı kapsıyor) (n=59) |
| Margin MAE vs son-10 | -0.53 | [-1.85, +1.09] | %76.7 | fark anlamlı değil (CI sıfırı kapsıyor) (n=59) |

### Kalibrasyon (tahmin edilen kazananın olasılığı)

| Güven Bandı | Maç | Ortalama Güven | Gerçekleşen Doğruluk |
|---|---:|---:|---:|
| 50-60% | 18 | %54.9 | %33.3 |
| 60-70% | 23 | %64.3 | %69.6 |
| 70-80% | 17 | %74.7 | %88.2 |
| 80-100% | 5 | %85.8 | %80.0 |

---

## 2. Sürüm ve Kaynak Bazında Döküm

| Sürüm / Kaynak | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| `v11/backfill` | 24 | %54.2 | 0.2360 | 0.2182 | 14.70 | 12.47 |
| `v11/live` | 12 | %50.0 | 0.2335 | 0.2227 | 14.25 | 13.13 |
| `v12/live` | 7 | %42.9 | 0.2934 | 0.2406 | 17.10 | 15.87 |
| `v15/live` | 63 | %65.1 | 0.1963 | 0.2070 | 16.25 | 11.13 |
| **Tümü (karışık sürüm)** | 106 | %59.4 | 0.2159 | 0.2135 | 15.73 | 11.97 |

`backfill` kayıtları dondurulmuş çağrı değildir (maç tarihinden önceki verilerle sonradan üretildi, sakatlık raporu yok); güncel sürümün başarısı yalnızca `live` satırlarıyla ölçülür.

---

## 3. Haftalık Seyir (`v15` / live)

| Hafta | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| 2026-10-26 | 48 | %62.5 | 0.2100 | 0.2082 | 16.69 | 11.57 |
| 2026-11-02 | 15 | %73.3 | 0.1525 | 0.2029 | 14.85 | 9.73 |

---

## Okuma Notları

- Tek sezonda eşleştirilmiş MAE farkının standart hatası yaklaşık 0.09 sayıdır; 0.2 sayının altındaki farklar yüzlerce maç birikmeden doğrulanamaz. Erken sezonda CI'lar geniştir.
- Walk-forward referansı (2021-22 .. 2025-26): `reports/evaluation/multi_season_walk_forward_backtest.md`.
