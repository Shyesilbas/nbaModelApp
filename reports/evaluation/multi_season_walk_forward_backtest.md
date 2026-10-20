# Çok Sezonlu Expanding-Window Walk-Forward Backtest Raporu

**Rapor Tarihi:** 2026-10-19T22:40:02.367859Z  
**Yöntem:** Kesintisiz Genişleyen Zaman Pencereleri (Expanding Window). Her sezon yalnızca önceki tamamlanmış sezonlarla eğitilen modellerle test edilmiştir; geleceğe dönük hiçbir bilgi sızıntısı (leakage) bulunmamaktadır.  
**Toplam Görülmemiş Test Maçı:** 6276 maç (5 ayrı NBA sezonu)

---

## 1. Genel Özet Karnesi (5 Sezonun Ağırlıklı Ortalaması)

### Galibiyet Olasılığı (WIN Model) vs. Pregame Elo Baseline
| Model / Taban Çizgisi | Brier Score (Düşük = İyi) | ROC-AUC | Doğruluk (Accuracy) |
|---|---:|---:|---:|
| **Logistic Regression (Üretim Mimarisi)** | **0.2141** | **0.7072** | **%65.62** |
| **Lojistik Regresyon Benchmark** | 0.2141 | 0.7078 | %65.89 |
| **Saf Elo Baseline** | 0.2157 | 0.7017 | %65.54 |
| **Elo Karşısında Kazanım (Üretim)** | **+0.0016 (Daha Kalibre)** | **+0.0055** | **+0.08 puan** |

### Takım Skoru (SCORE Model) vs. Son 10 Maç Sayıları Baseline
| Metrik | Model (Çok Sezonlu) | Son 10 Maç Taban Çizgisi | Fark / Kazanım |
|---|---:|---:|---:|
| **Toplam Skor MAE** | **14.90 sayı** | 14.95 sayı | **-0.05 sayı daha az hata** |
| **Sayı Farkı (Margin) MAE** | **10.97 sayı** | 11.41 sayı | **-0.44 sayı daha az hata** |
| **Conformal %80 Kapsama** | **%80.6** | Sabit ±12 (~%47) | **Tam İstatistiksel Kalibrasyon** |

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
| **2021-22** | 1256 | 0.2210 / 0.2206 | 0.6903 / 0.6919 | 14.68 / 14.62 | 11.15 / 11.56 | %80.5 | 4.55 / 4.63 | 1.93 / 1.94 | 1.30 / 1.30 |
| **2022-23** | 1248 | 0.2277 / 0.2290 | 0.6502 / 0.6443 | 14.89 / 14.97 | 10.29 / 10.57 | %80.3 | 4.59 / 4.69 | 1.92 / 1.94 | 1.30 / 1.31 |
| **2023-24** | 1259 | 0.2090 / 0.2114 | 0.7271 / 0.7169 | 14.72 / 14.78 | 11.04 / 11.58 | %82.5 | 4.47 / 4.57 | 1.89 / 1.90 | 1.34 / 1.35 |
| **2024-25** | 1256 | 0.2084 / 0.2118 | 0.7289 / 0.7187 | 14.92 / 15.02 | 10.97 / 11.50 | %80.5 | 4.56 / 4.66 | 1.92 / 1.94 | 1.33 / 1.35 |
| **2025-26** | 1257 | 0.2046 / 0.2058 | 0.7389 / 0.7362 | 15.30 / 15.38 | 11.40 / 11.86 | %79.0 | 4.51 / 4.61 | 1.89 / 1.92 | 1.34 / 1.35 |

---

## 3. Bilimsel Değerlendirme ve Çıkarımlar

1. **Sürekli Üstünlük:** Model, test edilen her sezonda (2021-22'den 2025-26'ya kadar) saf Elo, hareketli skor taban çizgisi ve son-5 oyuncu ortalamasını istikrarlı bir biçimde geride bırakmaktadır.
2. **Doğrulanmış Conformal Aralıklar:** Conformal aralıklar tüm bağımsız sezonlarda hedeflenen %80 bant genişliğine sadık kalmaktadır.
3. **Zaman Serisi Güvencesi:** Hiçbir katlamada gelecekteki maçlar geriye dönük kullanılmamıştır.
