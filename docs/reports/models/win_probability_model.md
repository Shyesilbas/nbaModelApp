# WIN Probability Model Specification & Audit (Release v12)

> **Model Artifact:** `models/production/win_model.pkl`  
> **Features Manifest:** `models/production/win_features.json` (11 features)  
> **Metadata:** `models/production/win_metadata.json`  
> **Active Release:** `v12`  
> **Algorithm:** Uncalibrated Logistic Regression with StandardScaler and Mean Imputer  
> **Target:** `WIN` (Binary: 1 if team wins, 0 if team loses)  
> **Evaluation Window:** 5 Unseen Expanding Walk-Forward Seasons (`2021-22` to `2025-26`, $N = 6,276$ games) + Locked `2026-27`

---

## 1. Executive Summary & Headline Benchmarks

In Release `v12`, the WIN model decomposes composite roster absence into decoupled, orthogonal components inspired by the Premier League starting XI continuity and missing player minute weighting architecture.

Across 5 fully out-of-fold expanding walk-forward seasons (6,276 unseen NBA games), `v12` achieves the best scoring rule calibration in project history, breaking the `0.2100` Brier threshold for the first time.

| Metric | Production v12 | Production v11 | Pregame Elo Baseline | Delta vs v11 | Skill Gate Status |
|---|---:|---:|---:|---:|:---:|
| **Log-Loss** | **0.6065** | 0.6088 | 0.6207 | **-0.0023** | PASS ($P=96.7\%$) |
| **Brier Score** | **0.2098** | 0.2106 | 0.2158 | **-0.0008** | PASS ($P=93.5\%$) |
| **ROC-AUC** | **0.7217** | 0.7196 | 0.7029 | **+0.0021** | PASS |
| **Accuracy** | **66.30%** | 66.65% | 65.47% | -0.35% | Kalibre olasılık odaklı |

---

## 2. Feature Architecture (11 Features)

All features are computed chronologically with strict zero-leakage (`shift(1)` on prior games):

| Feature Name | Role / Description | Coeff (Std) | Permutation $\Delta\text{LL}$ |
|---|---|---:|---:|
| `ELO_DIFF` | Continuous Elo differential between home and away team | `+0.7038` | `+0.1479` |
| `CLEAN_NET_RTG_DIFF_LAST_10` | Net rating differential with garbage time stripped | `+0.2405` | `+0.0191` |
| `MISSING_ROT_MINS_DIFF` | **[v12 New]** Opponent missing rotation minutes minus own missing rotation minutes ($\ge 20$ min regular starters) | `+0.2113` | `+0.0095` |
| `ACTIVE_WT_GS_DIFF` | **[v12 New]** Average Game Score of active lineup weighted by playing time differential | `+0.1646` | `+0.0069` |
| `ABS_DIFF` | Hollinger Game Score availability delta | `+0.0799` | `+0.0020` |
| `ROT_CONTINUITY_DIFF` | **[v12 New]** Roster continuity / chemistry ratio differential tonight vs last 15 games | `+0.0007` | `+0.0002` |
| `REST_DIFF` | Differential in rest days (`DAYS_REST - OPP_DAYS_REST`) | `+0.0416` | - |
| `IS_HOME` | Home court advantage indicator | `+0.0000`* | `+0.0102` |
| `OPP_IS_B2B` | Opponent back-to-back indicator | `+0.0518` | `+0.0003` |
| `IS_B2B` | Own team back-to-back indicator | `-0.0822` | `+0.0004` |
| `WINRATE_DIFF_LAST_10` | 10-game win rate differential (negative: close-game luck regression) | `-0.2535` | `+0.0074` |

*\*Not: Model hem ev hem deplasman satırlarını simetrik öğrendiğinde IS_HOME katsayısı model intercept'ine (+0.2599) taşınır; ev sahibi avantajını intercept sağlar.*

---

## 3. Expanding-Window Walk-Forward Detayları (Sezon Bazında)

| Sezon | Test Maçı | Taban Elo Brier | v11 Brier | **v12 Brier** | v11 Log-Loss | **v12 Log-Loss** | $\Delta\text{LL}$ |
|---|---:|---:|---:|---:|---:|---:|---:|
| **2021-22** | 1,256 | 0.2206 | 0.2172 | **0.2156** | 0.6244 | **0.6205** | -0.0039 |
| **2022-23** | 1,248 | 0.2297 | **0.2240** | 0.2243 | **0.6395** | 0.6400 | +0.0005 |
| **2023-24** | 1,259 | 0.2115 | 0.2060 | **0.2058** | 0.5981 | **0.5972** | -0.0009 |
| **2024-25** | 1,256 | 0.2117 | 0.2048 | **0.2028** | 0.5952 | **0.5901** | -0.0051 |
| **2025-26** | 1,257 | 0.2058 | 0.2013 | **0.2007** | 0.5871 | **0.5849** | -0.0022 |
| **Toplam** | **6,276** | **0.2158** | **0.2106** | **0.2098** | **0.6088** | **0.6065** | **-0.0023** |

---

## 4. Train-Serve Parite Garantisi

- Çevrimdışı eğitim özelliği üreteci (`build_absence_deltas` / `add_absence_columns`) ile canlı maç önü çıkarım motoru (`live_roster_metrics` in `src/features/roster_absence.py`), oyuncu override'ları (`OUT`, `RESTRICTED`) ve carry-forward varsayımları altında 16 ondalık basamağa kadar aynı çıktıyı üretir.
- Birim test güvencesi: `tests/test_roster_absence.py::test_rotation_continuity_and_missing_mins_parity` ve `test_add_absence_columns_rotation_antisymmetry`.

---

## 5. Reddedilen Deneyler ve Nedenleri (Negative Results)

1. **`FG3_REGRESSION_DIFF` (3'lük Şut Regresyonu):**
   - *Hipotez:* Aşırı 3'lük yüzdesi yakalayan takımların gerileyeceği varsayımı.
   - *Sonuç:* 5 sezonluk walk-forward Log-Loss `0.6078` seviyesinde kaldı (Aday 7'nin `0.6065` değerine göre +0.0013 daha kötü). Gürültü eklediği için elendi.
2. **`SCORE_PRED_MARGIN` (Skor Modeli Sayı Farkı Girdisi):**
   - *Hipotez:* SCORE modelinin tahmin ettiği sayı farkını WIN modeline girdi olarak vermek.
   - *Sonuç:* Brier skorunda hiçbir kazanım sağlamadı; döngüsel bağımlılık ve OOF gereksinimi yarattığı için win modelinden tamamen çıkarıldı.
3. **Ham Net Rating (`NET_RTG_DIFF_LAST_10`):**
   - *Hipotez:* Çöp zamanı (garbage time) dahil tüm sayı farklarını kullanmak.
   - *Sonuç:* `CLEAN_NET_RTG_DIFF_LAST_10` (çöp zamanı temizlenmiş verimlilik), ham net rating'i her 5 sezonda da geride bıraktı.
