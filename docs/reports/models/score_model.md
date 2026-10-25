# SCORE Model Specification & Audit

> **Model Artifacts:**
> - `models/production/score_model_pace.pkl` (Pace sub-model)
> - `models/production/score_model_home_rtg.pkl` (Home Offensive Rating sub-model)
> - `models/production/score_model_away_rtg.pkl` (Away Offensive Rating sub-model)
> - `models/production/score_model_margin.pkl` (Margin sub-model with decoupled rotation features)
> - `models/production/score_model_ridge_total.pkl` (Ridge total points residual correction)
> - `models/production/score_model_ridge_margin.pkl` (Ridge margin residual correction)
> **Metadata:** `models/production/score_metadata.json`  
> **Status:** ACTIVE (Production Release `v13`)  
> **Algorithm:** Ridge regression on Pace, Offensive Ratings, and Margin with Conformal Prediction  
> **Targets:** Realized match points (`PTS` actual total, `MARGIN` actual home-away difference)

---

## 1. Executive Summary & Walk-Forward Benchmarks

SCORE modeli, macin beklenen toplam sayisini (`PRED_TOTAL`), sayi farkini (`PRED_MARGIN`) ve %80 conformal tahmin bantlarini uretir.

Release `v13` ile birlikte fark modeline (`score_model_margin.pkl`) rotasyon dakika kaybi (`MISSING_ROT_MINS_DIFF`), kadro devamliligi (`ROT_CONTINUITY_DIFF`) ve aktif kadro agirlikli Game Score (`ACTIVE_WT_GS_DIFF`) eklenmistir.

5 sezonluk kesintisiz expanding walk-forward testlerinde (6.276 mac):

| Hedef Metrik | Model Hatasi (MAE v13) | Model Hatasi (MAE v12) | Taban Cizgisi (Son 10 Mac MAE) | Hata Azalmasi |
|---|---:|---:|---:|---:|
| **Toplam Skor (Total PTS)** | **14.85 sayi** | 14.90 sayi | 14.95 sayi | -0.10 sayi |
| **Sayi Farki (Margin)** | **10.809 sayi** | 10.832 sayi | 11.41 sayi | **-0.60 sayi** |
| **Sayi Farki Kazanan Dogrulugu** | **%66.67** | %66.51 | %61.40 | **+5.27 pp** |
| **Conformal %80 Kapsama** | **%80.5** | %80.5 | Sabit +/- 12 (~%47) | **Kusursuz Kalibrasyon** |

---

## 2. Model Mimarisi & Alt Modeller

1. **Tempo Modeli (`score_model_pace.pkl`):** 
   - Takim ve rakip tempo egilimlerinden (`PACE_LAST_10`, `OPP_PACE_LAST_10`) macin beklenen pozisyon sayisini tahmin eder.
2. **Hucum Reyting Modelleri (`home_rtg`, `away_rtg`):**
   - 100 pozisyon basina uretilecek sayi miktarini (`OFF_RTG_LAST_10`, `DEF_RTG_LAST_10`, `ABS_DELTA`, `OPP_ABS_DELTA`) modeller.
   - $\text{Toplam Skor} = \text{Pace} \times \frac{\text{Home Off Rtg} + \text{Away Off Rtg}}{100.0}$.
3. **Fark Modeli (`score_model_margin.pkl` - 11 Ozellik):**
   - `ELO_DIFF`, `CLEAN_NET_RTG_DIFF_LAST_10`, `WINRATE_DIFF_LAST_10`, `DAYS_REST`, `OPP_DAYS_REST`, `IS_B2B`, `OPP_IS_B2B`, `ABS_DIFF`.
   - Rotasyon Dengeleme: `MISSING_ROT_MINS_DIFF`, `ROT_CONTINUITY_DIFF`, `ACTIVE_WT_GS_DIFF`.
4. **Artik Duzeltme (Ridge Residual Correction):**
   - Saha avantaji ve gosterge degiskenlerinden kaynaklanan sistematik sapmalari sifirlar.

---

## 3. Sezonluk Walk-Forward Performansi (Margin MAE)

| Sezon | Test Maci | v12 Margin MAE | v13 Margin MAE | Delta | Kazanan |
|---|---:|---:|---:|---:|---|
| **2021-22** | 1,220 | 11.039 | 10.973 | -0.066 | v13 |
| **2022-23** | 1,220 | 10.279 | 10.297 | +0.018 | v12 |
| **2023-24** | 1,220 | 10.978 | 10.974 | -0.004 | v13 |
| **2024-25** | 1,220 | 10.839 | 10.807 | -0.032 | v13 |
| **2025-26** | 1,220 | 11.212 | 11.184 | -0.028 | v13 |
| **Ortalama** | **6,276** | **10.832** | **10.809** | **-0.023** | **v13 (4/5)** |

### Uretim Holdout Dogrulamasi (2025-26)
- Holdout Margin MAE: `11.2446` -> `11.2105` (`-0.0341` sayi iyilesme).
- Holdout Total MAE: `15.2909`.
