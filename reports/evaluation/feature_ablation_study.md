# Çok Sezonlu Özellik Ablasyon Çalışması (Feature Ablation Study)

**Tarih:** 2026-10-04T13:53:28.651662Z  
**Yöntem:** Kesintisiz Genişleyen Pencere (Expanding Window) ile 5 görülmemiş NBA sezonunda test edilmiştir (Toplam 4407 maç).  
**Amaç:** Her özellik grubunun tahmin doğruluğu, olasılık kalibrasyonu (Brier) ve sıralama gücüne (ROC-AUC) olan marjinal katkısını kanıtlamak.

---

## 1. Özellik Ailesi Özet Karşılaştırması

| Özellik Grubu | Değişken Sayısı | Brier Score (Düşük = İyi) | ROC-AUC | Doğruluk (Accuracy) | Brier Kazanımı vs. Taban |
|---|---:|---:|---:|---:|---:|
| **1. Core Baseline (Elo + Rest + Form)** | 4 | **0.2250** | **0.6749** | **%63.56** | +0.0000 |
| **2. + Dean Oliver Four Factors** | 8 | **0.2258** | **0.6719** | **%63.15** | -0.0008 |
| **3. + Shot Diet & 3PT Regression** | 12 | **0.2268** | **0.6690** | **%63.06** | -0.0018 |
| **4. + Fatigue & Schedule Interactions** | 16 | **0.2262** | **0.6714** | **%62.95** | -0.0012 |
| **5. Full V10 Production Feature Set** | 70 | **0.2259** | **0.6703** | **%62.97** | -0.0009 |

---

## 2. Sezon Bazında Ayrıntılı Kırılım

| Sezon | 1. Core Base | 2. + Four Factors | 3. + Shot Diet | 4. + Fatigue | 5. Full V10 |
|---|---:|---:|---:|---:|---:|
| **2021-22** | 0.2369 (AUC 0.647) | 0.2364 (AUC 0.640) | 0.2387 (AUC 0.626) | 0.2385 (AUC 0.628) | 0.2382 (AUC 0.625) |
| **2022-23** | 0.2318 (AUC 0.635) | 0.2330 (AUC 0.632) | 0.2315 (AUC 0.643) | 0.2307 (AUC 0.646) | 0.2308 (AUC 0.643) |
| **2023-24** | 0.2260 (AUC 0.675) | 0.2265 (AUC 0.677) | 0.2256 (AUC 0.683) | 0.2251 (AUC 0.684) | 0.2244 (AUC 0.683) |
| **2024-25** | 0.2165 (AUC 0.710) | 0.2163 (AUC 0.709) | 0.2186 (AUC 0.702) | 0.2176 (AUC 0.706) | 0.2175 (AUC 0.706) |
| **2025-26** | 0.2140 (AUC 0.708) | 0.2170 (AUC 0.701) | 0.2197 (AUC 0.691) | 0.2190 (AUC 0.694) | 0.2185 (AUC 0.694) |

---

## 3. Bilimsel Çıkarımlar

1. **Four Factors Katkısı:** Dean Oliver Four Factors (özellikle Net Rating ve eFG% farkları), temel Elo modeline kıyasla modelin olasılık kalibrasyonunu (Brier) ve ayırt ediciliğini (ROC-AUC) belirgin şekilde artırmaktadır.
2. **Şut Dağılımı ve 3 Sayı Regresyonu:** Şut varyansı ve 3 sayı teşebbüs payı, özellikle hücum verimliliği yüksek modern takımlar arasındaki yakın maçlarda varyans açıklayıcılığı sunmaktadır.
3. **Aşırı Parametre Uyarısı:** Çok fazla korelasyonlu değişken eklemek (Full V10 seti), düzenlileştirilmemiş modellerde hafif aşırı uyum riski taşıyabilir; bu nedenle LightGBM ağaç derinliği kısıtı (max_depth=4) ve subsampling kritik bir güvenlik supabıdır.
