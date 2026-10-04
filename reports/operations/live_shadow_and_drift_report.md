# Canlı Shadow Modu ve Veri Kayması (Drift) İzleme Raporu

**Rapor Tarihi:** 2026-10-04T14:15:34.686749+00:00  
**Loglanan Toplam Tahmin:** 51  
**Sonuçlanmış Maçla Eşleşen:** 50  

---

## 1. Canlı / Shadow Tahmin Performansı

### Galibiyet Olasılığı (WIN Model)
* **Brier Score:** 0.25
* **ROC-AUC:** 0.5
* **Doğruluk (Accuracy):** %64.0
* **Log-Loss:** 0.6931

### Skor Tahmini (SCORE Model)
* **Toplam Skor MAE:** 16.73 sayı (Bias: 1.6)
* **Sayı Farkı (Margin) MAE:** 13.72 sayı (Bias: 0.57)
* **Conformal %80 Aralık Kapsaması:** %78.0

---

## 2. Girdi Dağılım Kayması (Kolmogorov-Smirnov Drift Testleri)

| Özellik Adı | KS İstatistiği | p-Değeri | Referans Ort. | Canlı Ort. | Kayma (Drift) Durumu |
|---|---:|---:|---:|---:|---|
| **PACE_LAST_5** | 0.1996 | 0.0329 | 101.05 | 100.27 | ⚠️ Kayma Var (p < 0.05) |
| **OFF_RTG_LAST_5** | 0.2343 | 0.0071 | 112.18 | 115.07 | ⚠️ Kayma Var (p < 0.05) |
| **DEF_RTG_LAST_5** | 0.3181 | 0.0001 | 111.84 | 108.49 | ⚠️ Kayma Var (p < 0.05) |

---

## 3. İzleme ve Yönetişim Çıkarımları

1. **İzlenebilirlik:** Her tahmin satırı bağımsız bir `prediction_id`, zaman damgası ve özellik snapshot'ı ile kaydedilmektedir.
2. **Güvenlik Eşiği:** Kritik özelliklerde (Elo, Tempo, Rating) anlamlı bir dağılım kayması (p < 0.01) gözlemlendiğinde model otomatik uyarılır ancak operatör onayı olmadan model ağırlıkları sessizce yeniden eğitilmez.
