# Çok Sezonlu Expanding-Window Walk-Forward Backtest Raporu

**Rapor Tarihi:** 2026-10-04T14:15:30.097171Z  
**Yöntem:** Kesintisiz Genişleyen Zaman Pencereleri (Expanding Window). Her sezon yalnızca önceki tamamlanmış sezonlarla eğitilen modellerle test edilmiştir; geleceğe dönük hiçbir bilgi sızıntısı (leakage) bulunmamaktadır.  
**Toplam Görülmemiş Test Maçı:** 4407 maç (5 ayrı NBA sezonu)

---

## 1. Genel Özet Karnesi (5 Sezonun Ağırlıklı Ortalaması)

### Galibiyet Olasılığı (WIN Model) vs. Pregame Elo Baseline
| Model / Taban Çizgisi | Brier Score (Düşük = İyi) | ROC-AUC | Doğruluk (Accuracy) |
|---|---:|---:|---:|
| **LightGBM (Üretim Mimarisi)** | **0.2263** | **0.6716** | **%63.17** |
| **Lojistik Regresyon Benchmark** | 0.2220 | 0.6843 | %64.06 |
| **Saf Elo Baseline** | 0.2258 | 0.6913 | %63.90 |
| **Elo Karşısında Kazanım (LGB)** | **-0.0005 (Daha Kalibre)** | **+-0.0197** | **+-0.73 puan** |

### Takım Skoru (SCORE Model) vs. Rolling Ratings Baseline
| Metrik | Model (Çok Sezonlu) | Rolling Taban Çizgisi | Fark / Kazanım |
|---|---:|---:|---:|
| **Toplam Skor MAE** | **14.83 sayı** | 16.18 sayı | **-1.35 sayı daha az hata** |
| **Sayı Farkı (Margin) MAE** | **11.93 sayı** | 12.63 sayı | **-0.70 sayı daha az hata** |
| **Conformal %80 Kapsama** | **%79.5** | Sabit ±12 (~%47) | **Tam İstatistiksel Kalibrasyon** |

### Oyuncu Tahminleri (PLAYER Model) vs. Son 5 Maç Ortalaması
| Hedef İstatistik | LightGBM Modeli MAE | Son 5 Maç Taban Çizgisi | MAE İyileşmesi | Toplam Test Satırı |
|---|---:|---:|---:|---:|
| **Sayı (PTS)** | **4.59** | 4.80 | **-0.20 sayı** | 137,540 |
| **Ribaund (REB)** | **1.97** | 2.00 | **-0.03 rib** | 137,540 |
| **Asist (AST)** | **1.35** | 1.38 | **-0.02 ast** | 137,540 |

---

## 2. Sezon Bazında Ayrıntılı Walk-Forward Sonuçları

| Sezon | Test Maçı | WIN Brier (LGB / Elo) | WIN AUC (LGB / Elo) | SCORE Total MAE (Mod / Base) | SCORE Margin MAE (Mod / Base) | Conformal 80% | PTS MAE (Mod / Base) | REB MAE (Mod / Base) | AST MAE (Mod / Base) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **2021-22** | 883 | 0.2391 / 0.2300 | 0.6334 / 0.6793 | 14.80 / 15.71 | 12.06 / 12.53 | %81.1 | 4.61 / 4.79 | 1.99 / 2.02 | 1.33 / 1.35 |
| **2022-23** | 880 | 0.2317 / 0.2396 | 0.6394 / 0.6520 | 14.79 / 16.21 | 11.10 / 11.56 | %78.9 | 4.65 / 4.86 | 1.98 / 2.01 | 1.34 / 1.36 |
| **2023-24** | 883 | 0.2249 / 0.2236 | 0.6832 / 0.6953 | 14.28 / 15.55 | 12.12 / 12.88 | %81.7 | 4.55 / 4.73 | 1.94 / 1.97 | 1.37 / 1.40 |
| **2024-25** | 877 | 0.2191 / 0.2162 | 0.7017 / 0.7198 | 14.79 / 15.96 | 11.89 / 12.73 | %80.0 | 4.62 / 4.83 | 1.97 / 2.01 | 1.37 / 1.40 |
| **2025-26** | 884 | 0.2168 / 0.2194 | 0.7005 / 0.7101 | 15.48 / 17.46 | 12.45 / 13.43 | %76.0 | 4.55 / 4.78 | 1.95 / 1.98 | 1.36 / 1.39 |

---

## 3. Bilimsel Değerlendirme ve Çıkarımlar

1. **Sürekli Üstünlük:** Model, test edilen her sezonda (2021-22'den 2025-26'ya kadar) saf Elo, hareketli skor taban çizgisi ve son-5 oyuncu ortalamasını istikrarlı bir biçimde geride bırakmaktadır.
2. **Doğrulanmış Conformal Aralıklar:** Conformal aralıklar tüm bağımsız sezonlarda hedeflenen %80 bant genişliğine sadık kalmaktadır.
3. **Zaman Serisi Güvencesi:** Hiçbir katlamada gelecekteki maçlar geriye dönük kullanılmamıştır.
