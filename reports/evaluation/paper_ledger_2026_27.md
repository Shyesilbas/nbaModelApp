# Paper Trading Defteri Raporu (2026-27)

> Bu dosya `scripts/paper_ledger_report.py` tarafından üretilir; elle düzenlenmez.
> Kilitli sezon: yalnızca prospektif izleme. Bu sonuçlar model seçimi veya ayar için kullanılmaz.

**Rapor Tarihi:** 2026-11-02T19:35:16Z
**Üretim Sürümü:** `v15`
**Defter:** 91 kayıt, 91 sonuçlanmış ve geçerli, 0 bekleyen, 0 geç (tip-off sonrası, sayılmaz). Son sonuçlanan maç: 2026-11-01

---

## 1. Güncel Sürüm, Canlı Kayıtlar (`v15` / live)

| Metrik | Model | Baseline | Baseline |
|---|---:|---:|---|
| Maç | 48 | 48 | saf Elo eşleşen |
| Doğruluk | %62.5 | %64.6 | saf Elo |
| Brier | 0.2100 | 0.2082 | saf Elo |
| Log-Loss | 0.6127 | - | |
| Ev sahibi kazanma oranı | %58.3 | - | |
| Toplam MAE | 16.69 | 16.67 | son-10 sayı (n=44) |
| Margin MAE | 11.57 | 12.36 | son-10 sayı + ev avantajı |

Not: model MAE satırları tüm maçlar üzerindedir; baseline sütunu yalnızca iki takımın da en az 3 önceki maçı olan alt kümede hesaplanır. Anlamlılık testi aynı alt kümede eşleştirilmiştir.

### Anlamlılık (fark = model - baseline, negatif = model daha iyi, date-block bootstrap %95)

| Karşılaştırma | Ortalama Fark | %95 CI | Model daha iyi olasılığı | Yorum |
|---|---:|---:|---:|---|
| Brier vs saf Elo | +0.0018 | [-0.0238, +0.0323] | %43.9 | fark anlamlı değil (CI sıfırı kapsıyor) (n=48) |
| Toplam MAE vs son-10 | +0.04 | [-0.59, +1.06] | %41.5 | fark anlamlı değil (CI sıfırı kapsıyor) (n=44) |
| Margin MAE vs son-10 | -0.61 | [-2.41, +1.80] | %71.5 | fark anlamlı değil (CI sıfırı kapsıyor) (n=44) |

### Kalibrasyon (tahmin edilen kazananın olasılığı)

| Güven Bandı | Maç | Ortalama Güven | Gerçekleşen Doğruluk |
|---|---:|---:|---:|
| 50-60% | 14 | %54.5 | %35.7 |
| 60-70% | 19 | %64.3 | %68.4 |
| 70-80% | 13 | %75.0 | %84.6 |
| 80-100% | 2 | %84.7 | %50.0 |

---

## 2. Sürüm ve Kaynak Bazında Döküm

| Sürüm / Kaynak | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| `v11/backfill` | 24 | %54.2 | 0.2360 | 0.2182 | 14.70 | 12.47 |
| `v11/live` | 12 | %50.0 | 0.2335 | 0.2227 | 14.25 | 13.13 |
| `v12/live` | 7 | %42.9 | 0.2934 | 0.2406 | 17.10 | 15.87 |
| `v15/live` | 48 | %62.5 | 0.2100 | 0.2082 | 16.69 | 11.57 |
| **Tümü (karışık sürüm)** | 91 | %57.1 | 0.2264 | 0.2153 | 15.87 | 12.35 |

`backfill` kayıtları dondurulmuş çağrı değildir (maç tarihinden önceki verilerle sonradan üretildi, sakatlık raporu yok); güncel sürümün başarısı yalnızca `live` satırlarıyla ölçülür.

---

## 3. Haftalık Seyir (`v15` / live)

| Hafta | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| 2026-10-26 | 48 | %62.5 | 0.2100 | 0.2082 | 16.69 | 11.57 |

---

## Okuma Notları

- Tek sezonda eşleştirilmiş MAE farkının standart hatası yaklaşık 0.09 sayıdır; 0.2 sayının altındaki farklar yüzlerce maç birikmeden doğrulanamaz. Erken sezonda CI'lar geniştir.
- Walk-forward referansı (2021-22 .. 2025-26): `reports/evaluation/multi_season_walk_forward_backtest.md`.
