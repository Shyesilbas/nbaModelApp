# Çok Sezonlu Expanding-Window Walk-Forward Backtest Raporu

> Bu dosya `scripts/walk_forward_benchmark.py` tarafından üretilir; elle düzenlenmez.

**Rapor Tarihi:** 2026-11-02T19:30:56Z  
**Ölçülen Üretim Yapılandırması:** WIN `v15` (eğitim 2026-10-25), SCORE `v15` (eğitim 2026-10-25), PLAYER `v15` (eğitim 2026-10-25); git `766e2f4`  
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
| **Toplam Skor MAE** | **14.90 sayı** | 14.95 sayı | **-0.05 sayı** |
| **Sayı Farkı (Margin) MAE** | **10.81 sayı** | 11.41 sayı | **-0.60 sayı** |
| **Conformal %80 Kapsama (toplam)** | **%80.5** | - | hedef %80 |

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
| **2021-22** | 1256 | 0.2156 / 0.2206 | 0.7068 / 0.6919 | 14.69 / 14.62 | 10.98 / 11.56 | %80.7 | 4.48 / 4.63 | 1.89 / 1.94 | 1.26 / 1.30 |
| **2022-23** | 1248 | 0.2243 / 0.2290 | 0.6676 / 0.6443 | 14.88 / 14.97 | 10.10 / 10.57 | %80.3 | 4.50 / 4.69 | 1.87 / 1.94 | 1.25 / 1.31 |
| **2023-24** | 1259 | 0.2058 / 0.2114 | 0.7351 / 0.7169 | 14.73 / 14.78 | 10.98 / 11.58 | %82.3 | 4.41 / 4.57 | 1.84 / 1.90 | 1.30 / 1.35 |
| **2024-25** | 1256 | 0.2028 / 0.2118 | 0.7441 / 0.7187 | 14.91 / 15.02 | 10.82 / 11.50 | %80.3 | 4.48 / 4.66 | 1.87 / 1.94 | 1.29 / 1.35 |
| **2025-26** | 1257 | 0.2007 / 0.2058 | 0.7493 / 0.7362 | 15.29 / 15.38 | 11.18 / 11.86 | %78.7 | 4.43 / 4.61 | 1.85 / 1.92 | 1.30 / 1.35 |

---

## 3. Anlamlılık ve Sezon Bazında Tutarlılık

Fark = model kaybı - baseline kaybı (negatif = model daha iyi). %95 aralık, aynı tarihteki maçlar birlikte örneklenerek (date-block, 2000 tekrar) hesaplanır.

| Karşılaştırma | Ortalama Fark | %95 CI | Model daha iyi olasılığı | Yorum | Kazanılan Sezon |
|---|---:|---:|---:|---|---:|
| WIN Brier vs saf Elo | -0.0059 | [-0.0079, -0.0038] | %100.0 | model daha iyi (CI sıfırın altında) | 5/5 |
| SCORE toplam MAE vs son-10 | -0.052 | [-0.115, +0.014] | %94.2 | fark anlamlı değil (CI sıfırı kapsıyor) | 4/5 |
| SCORE margin MAE vs son-10 | -0.603 | [-0.705, -0.498] | %100.0 | model daha iyi (CI sıfırın altında) | 5/5 |
| PLAYER PTS MAE vs EMA-10 | -0.171 | - | - | satır bazında, CI hesaplanmadı | 5/5 |
| PLAYER REB MAE vs EMA-10 | -0.063 | - | - | satır bazında, CI hesaplanmadı | 5/5 |
| PLAYER AST MAE vs EMA-10 | -0.052 | - | - | satır bazında, CI hesaplanmadı | 5/5 |

Conformal %80 toplam kapsaması sezonlar arasında %78.7 - %82.3 aralığında.

Not: Buradaki SCORE toplamı ham pace x reyting tahminidir; üretimdeki temporal OOF artık düzeltmesi bu benchmark'ta uygulanmaz.
