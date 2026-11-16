# Paper Trading Defteri Raporu (2026-27)

> Bu dosya `scripts/paper_ledger_report.py` tarafından üretilir; elle düzenlenmez.
> Kilitli sezon: yalnızca prospektif izleme. Bu sonuçlar model seçimi veya ayar için kullanılmaz.

**Rapor Tarihi:** 2026-11-16T18:27:49Z
**Üretim Sürümü:** `v15`
**Defter:** 196 kayıt, 196 sonuçlanmış ve geçerli, 0 bekleyen, 0 geç (tip-off sonrası, sayılmaz). Son sonuçlanan maç: 2026-11-15

---

## 1. Güncel Sürüm, Canlı Kayıtlar (`v15` / live)

| Metrik | Model | Baseline | Baseline |
|---|---:|---:|---|
| Maç | 153 | 153 | saf Elo eşleşen |
| Doğruluk | %68.6 | %71.9 | saf Elo |
| Brier | 0.1924 | 0.1888 | saf Elo |
| Log-Loss | 0.5699 | - | |
| Ev sahibi kazanma oranı | %53.6 | - | |
| Toplam MAE | 14.47 | 14.56 | son-10 sayı (n=149) |
| Margin MAE | 11.68 | 12.08 | son-10 sayı + ev avantajı |

Not: model MAE satırları tüm maçlar üzerindedir; baseline sütunu yalnızca iki takımın da en az 3 önceki maçı olan alt kümede hesaplanır. Anlamlılık testi aynı alt kümede eşleştirilmiştir.

### Anlamlılık (fark = model - baseline, negatif = model daha iyi, date-block bootstrap %95)

| Karşılaştırma | Ortalama Fark | %95 CI | Model daha iyi olasılığı | Yorum |
|---|---:|---:|---:|---|
| Brier vs saf Elo | +0.0036 | [-0.0131, +0.0211] | %32.5 | fark anlamlı değil (CI sıfırı kapsıyor) (n=153) |
| Toplam MAE vs son-10 | -0.14 | [-0.53, +0.25] | %74.7 | fark anlamlı değil (CI sıfırı kapsıyor) (n=149) |
| Margin MAE vs son-10 | -0.34 | [-1.15, +0.52] | %79.8 | fark anlamlı değil (CI sıfırı kapsıyor) (n=149) |

### Kalibrasyon (tahmin edilen kazananın olasılığı)

| Güven Bandı | Maç | Ortalama Güven | Gerçekleşen Doğruluk |
|---|---:|---:|---:|
| 50-60% | 39 | %54.6 | %46.2 |
| 60-70% | 50 | %64.4 | %68.0 |
| 70-80% | 46 | %74.6 | %80.4 |
| 80-100% | 18 | %85.4 | %88.9 |

---

## 2. Sürüm ve Kaynak Bazında Döküm

| Sürüm / Kaynak | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| `v11/backfill` | 24 | %54.2 | 0.2360 | 0.2182 | 14.70 | 12.47 |
| `v11/live` | 12 | %50.0 | 0.2335 | 0.2227 | 14.25 | 13.13 |
| `v12/live` | 7 | %42.9 | 0.2934 | 0.2406 | 17.10 | 15.87 |
| `v15/live` | 153 | %68.6 | 0.1924 | 0.1888 | 14.47 | 11.68 |
| **Tümü (karışık sürüm)** | 196 | %64.8 | 0.2038 | 0.1963 | 14.58 | 12.02 |

`backfill` kayıtları dondurulmuş çağrı değildir (maç tarihinden önceki verilerle sonradan üretildi, sakatlık raporu yok); güncel sürümün başarısı yalnızca `live` satırlarıyla ölçülür.

---

## 3. Haftalık Seyir (`v15` / live)

| Hafta | Maç | Doğruluk | Brier | Elo Brier | Toplam MAE | Margin MAE |
|---|---:|---:|---:|---:|---:|---:|
| 2026-10-26 | 48 | %62.5 | 0.2100 | 0.2082 | 16.69 | 11.57 |
| 2026-11-02 | 54 | %74.1 | 0.1641 | 0.1723 | 13.11 | 10.55 |
| 2026-11-09 | 51 | %68.6 | 0.2058 | 0.1880 | 13.82 | 12.99 |

---

## 4. Gölge WIN Adayları (`v15` / live)

Henüz gölge olasılığı taşıyan sonuçlanmış kayıt yok (alan 2026-11-16 sonrasındaki kayıtlara yazılır).

Karar kuralı (kayıt başlamadan sabitlendi, `reports/backtests/2026-11-16_win_live_roster_shadow/README.md`): aday yalnızca izlenir; normal sezon bitmeden ve en az 600 ortak maç birikmeden terfi değerlendirilmez.

---

## 5. Oyuncu Projeksiyonları (`v15` / live)

Henüz oyuncu projeksiyonu taşıyan sonuçlanmış kayıt yok (alan 2026-11-16 sonrasındaki kayıtlara yazılır).

---

## Okuma Notları

- Tek sezonda eşleştirilmiş MAE farkının standart hatası yaklaşık 0.09 sayıdır; 0.2 sayının altındaki farklar yüzlerce maç birikmeden doğrulanamaz. Erken sezonda CI'lar geniştir.
- Walk-forward referansı (2021-22 .. 2025-26): `reports/evaluation/multi_season_walk_forward_backtest.md`.
