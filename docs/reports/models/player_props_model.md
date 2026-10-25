# PLAYER Props Model Specification & Audit

> **Model Artifacts:**
> - `models/production/player_model_pts.pkl` (Points LightGBM model, L1 objective, num_leaves=20)
> - `models/production/player_model_reb.pkl` (Rebounds LightGBM model, L1 objective)
> - `models/production/player_model_ast.pkl` (Assists LightGBM model, L1 objective)
> - `models/production/player_features.pkl` (24 explicit features)
> **Metadata:** `models/production/player_metadata.json`  
> **Status:** ACTIVE (Production Release `v15`)  
> **Algorithm:** Gradient Boosted Trees (LightGBM) with Unified L1 Median Objectives & Team Rotation Context  
> **Targets:** Individual player realized box score stats (`PTS`, `REB`, `AST`)

---

## 1. Executive Summary & Walk-Forward Benchmarks

PLAYER modelleri, macta sure almasi beklenen her oyuncunun Sayi (PTS), Ribaund (REB) ve Asist (AST) uretimini tahmin eder.

Release `v15` ile birlikte modeller L1 medyan kayip fonksiyonuna (`objective: l1`) ve agac duzenlilestirmesine kavusmustur.

5 sezonluk expanding walk-forward testlerinde (140.378 oyuncu-mac satiri) taban cizgisini ve onceki L2 modellerini 5 sezonun tamaminda (%100 galibiyet) geride birakmistir:

| Istatistik Hedefi | v15 Model MAE (L1) | v14 Model MAE (L2) | EMA-10 Taban Cizgisi | v14'e Gore Kazanc | Toplam Test Satiri |
|---|---:|---:|---:|---:|---:|
| **Sayi (PTS)** | **4.460** | 4.461 | 4.632 | **-0.001 sayi** | 140,378 |
| **Ribaund (REB)** | **1.864** | 1.884 | 1.927 | **-0.020 rib** | 140,378 |
| **Asist (AST)** | **1.279** | 1.306 | 1.332 | **-0.026 ast** | 140,378 |

---

## 2. Girdi Ozellikleri & Rotasyon Ayrismasi (24 Ozellik)

1. **Oyuncu Form & Verimlilik Ozellikleri (16 Ozellik):**
   - `PTS_LAST_5`, `PTS_EMA_10`, `PTS_PER_MIN_LAST_10`
   - `REB_LAST_5`, `REB_EMA_10`, `REB_PER_MIN_LAST_10`
   - `AST_LAST_5`, `AST_EMA_10`, `AST_PER_MIN_LAST_10`
   - `MIN_LAST_3`, `MIN_EMA_10`, `MIN_TREND`, `USG_PCT_EMA_10`
   - `IS_HOME`, `IS_PLAYOFF`, `DAYS_REST`
2. **Pozisyon Bayraklari & Rakip Savunma Izni (5 Ozellik):**
   - `IS_GUARD`, `IS_BIG`
   - `OPP_POS_PTS_ALLOWED_LAST_10`, `OPP_POS_REB_ALLOWED_LAST_10`, `OPP_POS_AST_ALLOWED_LAST_10`
3. **Takim Rotasyon Devamliligi & Eksik Dakika Baglami (3 Ozellik):**
   - `MISSING_ROT_MINS`: Takimin ana rotasyon oyuncularindan (>= 20 dk/mac) yoksun oldugu toplam sure payi.
   - `ROT_CONTINUITY`: Aktif oyuncularin beklenen rotasyona orani (kadro kimyasi).
   - `ACTIVE_WT_GS`: Sahaya cikacak kadronun dakika agirlikli Hollinger Game Score kalitesi.

---

## 3. Sezonluk Walk-Forward Ayrintisi (140.378 Satir)

### Ribaund (REB MAE)
| Sezon | Test Satiri | EMA-10 Base | v14 Prod (L2) | v15 Cand (L1) | Delta | Kazanan |
|---|---:|:---:|:---:|:---:|:---:|:---:|
| **2021-22** | 27,894 | 1.945 | 1.910 | **1.891** | -0.0195 | v15 (L1) |
| **2022-23** | 27,651 | 1.936 | 1.891 | **1.869** | -0.0211 | v15 (L1) |
| **2023-24** | 28,105 | 1.898 | 1.862 | **1.842** | -0.0194 | v15 (L1) |
| **2024-25** | 28,134 | 1.942 | 1.889 | **1.867** | -0.0213 | v15 (L1) |
| **2025-26** | 28,594 | 1.915 | 1.869 | **1.850** | -0.0188 | v15 (L1) |
| **Ortalama** | **140,378** | **1.927** | **1.884** | **1.864** | **-0.0200** | **v15 (5/5)** |

### Asist (AST MAE)
| Sezon | Test Satiri | EMA-10 Base | v14 Prod (L2) | v15 Cand (L1) | Delta | Kazanan |
|---|---:|:---:|:---:|:---:|:---:|:---:|
| **2021-22** | 27,894 | 1.302 | 1.287 | **1.256** | -0.0305 | v15 (L1) |
| **2022-23** | 27,651 | 1.309 | 1.282 | **1.253** | -0.0284 | v15 (L1) |
| **2023-24** | 28,105 | 1.350 | 1.320 | **1.296** | -0.0237 | v15 (L1) |
| **2024-25** | 28,134 | 1.349 | 1.318 | **1.293** | -0.0244 | v15 (L1) |
| **2025-26** | 28,594 | 1.348 | 1.322 | **1.296** | -0.0255 | v15 (L1) |
| **Ortalama** | **140,378** | **1.332** | **1.306** | **1.279** | **-0.0265** | **v15 (5/5)** |

### Uretim Holdout Dogrulamasi (2025-26)
- PTS Holdout MAE: `4.4326`
- REB Holdout MAE: `1.8707` -> `1.8503` (`-0.0205` rib iyilesme).
- AST Holdout MAE: `1.3213` -> `1.2962` (`-0.0251` ast iyilesme).
