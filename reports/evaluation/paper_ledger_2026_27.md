# Paper Trading Defteri Raporu (2026-27)

> Bu dosya `scripts/paper_ledger_report.py` tarafından üretilir; elle düzenlenmez.
> Kilitli sezon: yalnızca prospektif izleme. Bu sonuçlar model seçimi veya ayar için kullanılmaz.

**Rapor Tarihi:** 2026-11-08T10:44:12Z
**Üretim Sürümü:** `v15`
**Defter:** 138 kayıt, 138 sonuçlanmış ve geçerli, 0 bekleyen, 0 geç (tip-off sonrası, sayılmaz). Son sonuçlanan maç: 2026-11-07

---

## 1. Güncel Sürüm, Canlı Kayıtlar (`v15` / live)

| Metrik | Model | Baseline | Baseline |
|---|---:|---:|---|
| Maç | 95 | 95 | saf Elo eşleşen |
| Doğruluk | %68.4 | %70.5 | saf Elo |
| Brier | 0.1891 | 0.1932 | saf Elo |
| Log-Loss | 0.5627 | - | |
| Ev sahibi kazanma oranı | %54.7 | - | |
| Toplam MAE | 14.89 | 15.10 | son-10 sayı (n=91) |
| Margin MAE | 11.09 | 11.83 | son-10 sayı + ev avantajı |

Not: model MAE satırları tüm maçlar üzerindedir; baseline sütunu yalnızca iki takımın da en az 3 önceki maçı olan alt kümede hesaplanır. Anlamlılık testi aynı alt kümede eşleştirilmiştir.

### Anlamlılık (fark = model - baseline, negatif = model daha iyi, date-block bootstrap %95)

| Karşılaştırma | Ortalama Fark | %95 CI | Model daha iyi olasılığı | Yorum |
|---|---:|---:|---:|---|
| Brier vs saf Elo | -0.0042 | [-0.0271, +0.0192] | %62.5 | fark anlamlı değil (CI sıfırı kapsıyor) (n=95) |
| Toplam MAE vs son-10 | -0.27 | [-0.71, +0.27] | %84.4 | fark anlamlı değil (CI sıfırı kapsıyor) (n=91) |
| Margin MAE vs son-10 | -0.68 | [-1.82, +0.52] | %89.5 | fark anlamlı değil (CI sıfırı kapsıyor) (n=91) |

### Kalibrasyon (tahmin edilen kazananın olasılığı)

| Güven Bandı | Maç | Ortalama Güven | Gerçekleşen Doğruluk |
|---|---:|---:|---:|
| 50-60% | 26 | %54.8 | %38.5 |
| 60-70% | 34 | %64.2 | %73.5 |
| 70-80% | 27 | %74.5 | %85.2 |
| 80-100% | 8 | %84.9 | %87.5 |

---

## 2. Sürüm ve Kaynak Bazında Döküm

| Sürüm / Kaynak | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| `v11/backfill` | 24 | %54.2 | 0.2360 | 0.2182 | 14.70 | 12.47 |
| `v11/live` | 12 | %50.0 | 0.2335 | 0.2227 | 14.25 | 13.13 |
| `v12/live` | 7 | %42.9 | 0.2934 | 0.2406 | 17.10 | 15.87 |
| `v15/live` | 95 | %68.4 | 0.1891 | 0.1932 | 14.89 | 11.09 |
| **Tümü (karışık sürüm)** | 138 | %63.0 | 0.2064 | 0.2025 | 14.92 | 11.75 |

`backfill` kayıtları dondurulmuş çağrı değildir (maç tarihinden önceki verilerle sonradan üretildi, sakatlık raporu yok); güncel sürümün başarısı yalnızca `live` satırlarıyla ölçülür.

---

## 3. Haftalık Seyir (`v15` / live)

| Hafta | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| 2026-10-26 | 48 | %62.5 | 0.2100 | 0.2082 | 16.69 | 11.57 |
| 2026-11-02 | 47 | %74.5 | 0.1676 | 0.1779 | 13.06 | 10.60 |

---

## Okuma Notları

- Tek sezonda eşleştirilmiş MAE farkının standart hatası yaklaşık 0.09 sayıdır; 0.2 sayının altındaki farklar yüzlerce maç birikmeden doğrulanamaz. Erken sezonda CI'lar geniştir.
- Walk-forward referansı (2021-22 .. 2025-26): `reports/evaluation/multi_season_walk_forward_backtest.md`.
