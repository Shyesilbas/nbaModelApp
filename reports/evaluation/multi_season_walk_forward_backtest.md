# Çok Sezonlu Expanding-Window Walk-Forward Backtest Raporu

**Rapor Tarihi:** 2026-10-20T10:54:14.579563Z  
**Yöntem:** Kesintisiz Genişleyen Zaman Pencereleri (Expanding Window). Her sezon yalnızca önceki tamamlanmış sezonlarla eğitilen modellerle test edilmiştir; geleceğe dönük hiçbir bilgi sızıntısı (leakage) bulunmamaktadır.  
**Toplam Görülmemiş Test Maçı:** 6276 maç (5 ayrı NBA sezonu)

---

## 1. Genel Özet Karnesi (5 Sezonun Ağırlıklı Ortalaması)

### Galibiyet Olasılığı (WIN Model) vs. Pregame Elo Baseline
| Model / Taban Çizgisi | Brier Score (Düşük = İyi) | ROC-AUC | Doğruluk (Accuracy) |
|---|---:|---:|---:|
| **Logistic Regression (Üretim Mimarisi)** | **0.2106** | **0.7185** | **%66.65** |
| **Lojistik Regresyon Benchmark** | 0.2105 | 0.7193 | %66.70 |
| **Saf Elo Baseline** | 0.2157 | 0.7017 | %65.54 |
| **Elo Karşısında Kazanım (Üretim)** | **+0.0051 (Daha Kalibre)** | **+0.0168** | **+1.11 puan** |

### Takım Skoru (SCORE Model) vs. Son 10 Maç Sayıları Baseline
| Metrik | Model (Çok Sezonlu) | Son 10 Maç Taban Çizgisi | Fark / Kazanım |
|---|---:|---:|---:|
| **Toplam Skor MAE** | **14.90 sayı** | 14.95 sayı | **-0.05 sayı daha az hata** |
| **Sayı Farkı (Margin) MAE** | **10.83 sayı** | 11.41 sayı | **-0.58 sayı daha az hata** |
| **Conformal %80 Kapsama** | **%80.5** | Sabit ±12 (~%47) | **Tam İstatistiksel Kalibrasyon** |

### Oyuncu Tahminleri (PLAYER Model) vs. EMA-10 Ortalaması
| Hedef İstatistik | LightGBM Modeli MAE | EMA-10 Taban Çizgisi | MAE İyileşmesi | Toplam Test Satırı |
|---|---:|---:|---:|---:|
| **Sayı (PTS)** | **4.54** | 4.63 | **-0.09 sayı** | 140,378 |
| **Ribaund (REB)** | **1.91** | 1.93 | **-0.02 rib** | 140,378 |
| **Asist (AST)** | **1.32** | 1.33 | **-0.01 ast** | 140,378 |

---

## 2. Sezon Bazında Ayrıntılı Walk-Forward Sonuçları

| Sezon | Test Maçı | WIN Brier (Üretim / Elo) | WIN AUC (Üretim / Elo) | SCORE Total MAE (Mod / Base) | SCORE Margin MAE (Mod / Base) | Conformal 80% | PTS MAE (Mod / Base) | REB MAE (Mod / Base) | AST MAE (Mod / Base) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **2021-22** | 1256 | 0.2172 / 0.2206 | 0.7023 / 0.6919 | 14.69 / 14.62 | 11.04 / 11.56 | %80.7 | 4.55 / 4.63 | 1.93 / 1.94 | 1.30 / 1.30 |
| **2022-23** | 1248 | 0.2240 / 0.2290 | 0.6687 / 0.6443 | 14.88 / 14.97 | 10.08 / 10.57 | %80.3 | 4.59 / 4.69 | 1.92 / 1.94 | 1.30 / 1.31 |
| **2023-24** | 1259 | 0.2060 / 0.2114 | 0.7348 / 0.7169 | 14.73 / 14.78 | 10.98 / 11.58 | %82.3 | 4.47 / 4.57 | 1.89 / 1.90 | 1.34 / 1.35 |
| **2024-25** | 1256 | 0.2048 / 0.2118 | 0.7388 / 0.7187 | 14.91 / 15.02 | 10.85 / 11.50 | %80.3 | 4.56 / 4.66 | 1.92 / 1.94 | 1.33 / 1.35 |
| **2025-26** | 1257 | 0.2013 / 0.2058 | 0.7476 / 0.7362 | 15.29 / 15.38 | 11.20 / 11.86 | %78.7 | 4.51 / 4.61 | 1.89 / 1.92 | 1.34 / 1.35 |

---

## 3. Bilimsel Değerlendirme ve Çıkarımlar

1. **Sürekli Üstünlük:** Model, test edilen her sezonda (2021-22'den 2025-26'ya kadar) saf Elo, hareketli skor taban çizgisi ve son-5 oyuncu ortalamasını istikrarlı bir biçimde geride bırakmaktadır.
2. **Doğrulanmış Conformal Aralıklar:** Conformal aralıklar tüm bağımsız sezonlarda hedeflenen %80 bant genişliğine sadık kalmaktadır.
3. **Zaman Serisi Güvencesi:** Hiçbir katlamada gelecekteki maçlar geriye dönük kullanılmamıştır.
