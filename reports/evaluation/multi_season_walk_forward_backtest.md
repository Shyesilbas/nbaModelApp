# Çok Sezonlu Expanding-Window Walk-Forward Backtest Raporu

> Bu dosya `scripts/walk_forward_benchmark.py` tarafından üretilir; elle düzenlenmez.

**Rapor Tarihi:** 2026-11-04T09:06:05Z  
**Ölçülen Üretim Yapılandırması:** WIN `v15` (eğitim 2026-10-25), SCORE `v15` (eğitim 2026-10-25), PLAYER `v15` (eğitim 2026-10-25); git `3af50c9`  
**Yöntem:** Kesintisiz Genişleyen Zaman Pencereleri (Expanding Window). Her sezon yalnızca önceki tamamlanmış sezonlarla eğitilen modellerle test edilmiştir; geleceğe dönük hiçbir bilgi sızıntısı (leakage) bulunmamaktadır.  
**Toplam Görülmemiş Test Maçı:** 6276 maç (5 ayrı NBA sezonu)

---

## 1. Genel Özet Karnesi (5 Sezonun Ağırlıklı Ortalaması)

### Galibiyet Olasılığı (WIN Model) vs. Pregame Elo Baseline
| Model / Taban Çizgisi | Brier Score (Düşük = İyi) | ROC-AUC | Doğruluk (Accuracy) |
|---|---:|---:|---:|
| **Logistic Regression (Üretim Mimarisi)** | **0.2098** | **0.7206** | **%66.25** |
| **Lojistik Regresyon Benchmark** | 0.2097 | 0.7210 | %66.73 |
| **Saf Elo Baseline** | 0.2157 | 0.7017 | %65.54 |
| **Elo Karşısında Fark (Üretim; Brier için + = daha iyi)** | **+0.0059** | **+0.0189** | **+0.71 puan** |

### Takım Skoru (SCORE Model) vs. Son 10 Maç Sayıları Baseline
| Metrik | Model (Çok Sezonlu) | Son 10 Maç Taban Çizgisi | Fark / Kazanım |
|---|---:|---:|---:|
| **Toplam Skor MAE** | **14.87 sayı** | 14.95 sayı | **-0.08 sayı** |
| **Sayı Farkı (Margin) MAE** | **10.85 sayı** | 11.41 sayı | **-0.57 sayı** |
| **Conformal %80 Kapsama (toplam / margin)** | **%79.3 / %79.8** | - | hedef %80 |

### Oyuncu Tahminleri (PLAYER Model) vs. EMA-10 Ortalaması
| Hedef İstatistik | LightGBM Modeli MAE | EMA-10 Taban Çizgisi | MAE İyileşmesi | Toplam Test Satırı |
|---|---:|---:|---:|---:|
| **Sayı (PTS)** | **4.46** | 4.63 | **-0.171 sayı** | 140,378 |
| **Ribaund (REB)** | **1.86** | 1.93 | **-0.063 rib** | 140,378 |
| **Asist (AST)** | **1.28** | 1.33 | **-0.052 ast** | 140,378 |

---

## 2. Sezon Bazında Ayrıntılı Walk-Forward Sonuçları

| Sezon | Test Maçı | WIN Brier (Üretim / Elo) | WIN AUC (Üretim / Elo) | SCORE Total MAE (Mod / Base) | SCORE Margin MAE (Mod / Base) | Conformal 80% | PTS MAE (Mod / Base) | REB MAE (Mod / Base) | AST MAE (Mod / Base) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **2021-22** | 1256 | 0.2156 / 0.2206 | 0.7068 / 0.6919 | 14.69 / 14.62 | 11.10 / 11.56 | %80.3 | 4.48 / 4.63 | 1.89 / 1.94 | 1.26 / 1.30 |
| **2022-23** | 1248 | 0.2243 / 0.2290 | 0.6676 / 0.6443 | 14.80 / 14.97 | 10.17 / 10.57 | %77.9 | 4.50 / 4.69 | 1.87 / 1.94 | 1.25 / 1.31 |
| **2023-24** | 1259 | 0.2058 / 0.2114 | 0.7351 / 0.7169 | 14.69 / 14.78 | 10.96 / 11.58 | %81.3 | 4.41 / 4.57 | 1.84 / 1.90 | 1.30 / 1.35 |
| **2024-25** | 1256 | 0.2028 / 0.2118 | 0.7441 / 0.7187 | 14.89 / 15.02 | 10.80 / 11.50 | %78.5 | 4.48 / 4.66 | 1.87 / 1.94 | 1.29 / 1.35 |
| **2025-26** | 1257 | 0.2007 / 0.2058 | 0.7493 / 0.7362 | 15.29 / 15.38 | 11.21 / 11.86 | %78.4 | 4.43 / 4.61 | 1.85 / 1.92 | 1.30 / 1.35 |

---

## 3. Anlamlılık ve Sezon Bazında Tutarlılık

Fark = model kaybı - baseline kaybı (negatif = model daha iyi). %95 aralık, aynı tarihteki maçlar birlikte örneklenerek (date-block, 2000 tekrar) hesaplanır.

| Karşılaştırma | Ortalama Fark | %95 CI | Model daha iyi olasılığı | Yorum | Kazanılan Sezon |
|---|---:|---:|---:|---|---:|
| WIN Brier vs saf Elo | -0.0059 | [-0.0079, -0.0038] | %100.0 | model daha iyi (CI sıfırın altında) | 5/5 |
| WIN Brier vs saf Elo (canlı kadro varsayımı) | -0.0022 | [-0.0041, -0.0002] | %98.5 | model daha iyi (CI sıfırın altında) | - |
| SCORE toplam MAE vs son-10 | -0.081 | [-0.157, +0.001] | %97.5 | fark anlamlı değil (CI sıfırı kapsıyor) | 4/5 |
| SCORE margin MAE vs son-10 | -0.567 | [-0.674, -0.452] | %100.0 | model daha iyi (CI sıfırın altında) | 5/5 |
| PLAYER PTS MAE vs EMA-10 | -0.171 | [-0.182, -0.161] | %100.0 | model daha iyi (CI sıfırın altında) | 5/5 |
| PLAYER REB MAE vs EMA-10 | -0.063 | [-0.067, -0.059] | %100.0 | model daha iyi (CI sıfırın altında) | 5/5 |
| PLAYER AST MAE vs EMA-10 | -0.053 | [-0.056, -0.050] | %100.0 | model daha iyi (CI sıfırın altında) | 5/5 |

Conformal %80 toplam kapsaması sezonlar arasında %77.9 - %81.3 aralığında. Yarıçaplar her fold'da yalnızca o fold'un eğitim sezonlarının temporal OOF artıklarından hesaplanır (test sezonu hiçbir aşamada görülmez); sezon başına yarıçaplar JSON raporunda `conformal_80_radius` altındadır.

Playoff maçlarında (toplam 452) margin kapsaması: tek yarıçapla %74.3, playoff'a özel yarıçapla (üretimde sunulan) %77.9. Playoff margin hataları daha büyük olduğu için normal sezon yarıçapı bu maçları hedefin altında kapsıyordu.

Not: SCORE modeli üretim hattıyla ölçülür: dört ridge modeli, ardından eğitim sezonlarının OOF artıklarından öğrenilen bağlam düzeltmesi (`ridge_total`, `ridge_margin`). Düzeltmesiz ham model: toplam MAE 14.90, margin MAE 10.81.

---

## 4. WIN Kadro Bilgisi Denetimi (look-ahead)

Eğitim ve backtest, kadro özelliklerini (`ABS_DIFF`, `MISSING_ROT_MINS_DIFF`, `ROT_CONTINUITY_DIFF`, `ACTIVE_WT_GS_DIFF`) o maçın kendi box score'undan üretir; canlıda bu bilgi sakatlık raporundan ve "önceki maçta oynayan oynar" varsayımından gelir. Aşağıdaki satırlar aynı walk-forward'ı farklı kadro varsayımlarıyla çalıştırır. Canlı varsayım sakatlık raporunu içermez, yani raporun getirdiği bilgi için alt sınırdır.

| Varyant | Brier | Log loss | Elo'ya karşı Brier farkı |
|---|---:|---:|---:|
| Üretim: maç kaydındaki gerçek kadro (eğitim ve test) | 0.2098 | 0.6065 | -0.0059 |
| Üretim modeli, test sezonunda canlı varsayımla (önceki maçta oynayan oynar) | 0.2135 | 0.6159 | -0.0022 |
| Canlı varsayımla yeniden eğitilmiş ve test edilmiş | 0.2124 | 0.6132 | -0.0033 |
| Kadro özellikleri (4 adet) olmadan | 0.2141 | 0.6170 | -0.0016 |
| Saf Elo | 0.2157 | 0.6203 | +0.0000 |

Canlı varsayımla üretim modeli vs saf Elo: fark -0.0022, %95 CI [-0.0041, -0.0002], model daha iyi (CI sıfırın altında).

---

## 5. WIN Güvenilirlik Tablosu (Üretim, 5 Sezon Birleşik)

Ev sahibi galibiyet olasılığı bantlarında tahmin edilen ile gerçekleşen oran. ECE (maç ağırlıklı) = **0.0153**.

| Tahmin bandı | Maç | Ortalama tahmin | Gerçekleşen |
|---|---:|---:|---:|
| 0.0-0.2 | 307 | 0.150 | 0.140 |
| 0.2-0.3 | 421 | 0.253 | 0.252 |
| 0.3-0.4 | 741 | 0.354 | 0.339 |
| 0.4-0.5 | 978 | 0.453 | 0.500 |
| 0.5-0.6 | 1095 | 0.550 | 0.556 |
| 0.6-0.7 | 1066 | 0.649 | 0.643 |
| 0.7-0.8 | 949 | 0.746 | 0.735 |
| 0.8-1.0 | 719 | 0.861 | 0.847 |

---

## 6. WIN Güven Bantları (Üretim, Sezon Bazlı, Canlı Tablo Formatı)

Her maçta modelin favori dediği takımın olasılığına göre bantlar. "Gerçekleşen": o bandda favori denen takımların gerçekten kazanma oranı. Canlı izleme (paper ledger) tablosuyla aynı biçimdir.

| Sezon | Band | Maç | Model dedi | Gerçekleşen |
|---|---|---:|---:|---:|
| 2021-22 | 50-60% | 392 | 55.0% | 54.3% |
| 2021-22 | 60-70% | 380 | 64.7% | 65.0% |
| 2021-22 | 70-80% | 271 | 74.7% | 71.6% |
| 2021-22 | 80-100% | 213 | 85.5% | 81.2% |
| 2021-22 | **ECE** | 1256 | 67.3% | 65.8% (ECE 0.0170) |
| 2022-23 | 50-60% | 477 | 54.6% | 49.7% |
| 2022-23 | 60-70% | 361 | 64.7% | 63.7% |
| 2022-23 | 70-80% | 269 | 74.4% | 72.5% |
| 2022-23 | 80-100% | 141 | 85.5% | 79.4% |
| 2022-23 | **ECE** | 1248 | 65.3% | 62.0% (ECE 0.0326) |
| 2023-24 | 50-60% | 410 | 55.0% | 51.7% |
| 2023-24 | 60-70% | 366 | 64.7% | 63.4% |
| 2023-24 | 70-80% | 268 | 74.6% | 76.1% |
| 2023-24 | 80-100% | 215 | 85.7% | 87.0% |
| 2023-24 | **ECE** | 1259 | 67.2% | 66.3% (ECE 0.0199) |
| 2024-25 | 50-60% | 394 | 54.9% | 54.8% |
| 2024-25 | 60-70% | 363 | 64.9% | 67.5% |
| 2024-25 | 70-80% | 275 | 74.9% | 73.5% |
| 2024-25 | 80-100% | 224 | 86.0% | 87.5% |
| 2024-25 | **ECE** | 1256 | 67.7% | 68.4% (ECE 0.0134) |
| 2025-26 | 50-60% | 400 | 55.1% | 55.0% |
| 2025-26 | 60-70% | 337 | 65.0% | 65.6% |
| 2025-26 | 70-80% | 287 | 74.7% | 75.6% |
| 2025-26 | 80-100% | 233 | 85.9% | 88.0% |
| 2025-26 | **ECE** | 1257 | 67.9% | 68.7% (ECE 0.0078) |
| Birleşik | 50-60% | 2073 | 54.9% | 53.0% |
| Birleşik | 60-70% | 1807 | 64.8% | 65.0% |
| Birleşik | 70-80% | 1370 | 74.7% | 73.9% |
| Birleşik | 80-100% | 1026 | 85.7% | 85.1% |
| Birleşik | **ECE** | 6276 | 67.1% | 66.2% (ECE 0.0098) |
