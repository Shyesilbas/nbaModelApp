# Score Model V4 Derinlemesine İnceleme

## Mevcut Durum (V3)

- Pace MAE: 3.62
- Home Off_Rtg MAE: 9.09
- Away Off_Rtg MAE: 9.85
- Margin MAE: 11.63
- Derived Home Score MAE: 8.17
- Derived Away Score MAE: 8.64

## Tespit Edilen Sorunlar

### Score vs Win çelişkisi
- **Sebep:** İki model bağımsız çalışıyor, Top-Down Scaling frontend'de kullanılmıyor
- **Çözüm:** Frontend API çağrısını /predict/game_full ile değiştir
- **Öncelik:** CRITICAL

### Away takımı tahmini kötü
- **Sebep:** Deplasman faktörleri yeterince temsil edilmiyor
- **Çözüm:** Seyahat mesafesi, saat dilimi farkı, B2B detayları ekle
- **Öncelik:** HIGH

### Pace modeli bozuldu
- **Sebep:** Pace ile oyuncu kalitesi arasında korelasyon yok
- **Çözüm:** Pace modelinden oyuncu projeksiyonlarını çıkar
- **Öncelik:** MEDIUM

### Hiperparametre optimizasyonu yok
- **Sebep:** GridSearch/RandomSearch yapılmamış
- **Çözüm:** Optimum parametreleri bul
- **Öncelik:** MEDIUM

## Hızlı Kazançlar

- 1. Frontend API çağrısını /predict/game_full ile değiştir (1 saat) → Çelişki çözülür
- 2. Pace modelinden oyuncu projeksiyonlarını kaldır (30 dk) → Pace MAE 3.62 → 3.30
- 3. Deplasman seyahat mesafesini ekle (1 saat) → Away MAE 9.85 → 9.00

## V4 Hedefleri

- Pace MAE: 3.62 → 3.30
- Home Off_Rtg MAE: 9.09 → 8.50
- Away Off_Rtg MAE: 9.85 → 8.50
- Margin MAE: 11.63 → 10.00
- Derived Home Score MAE: 8.17 → 7.50
- Derived Away Score MAE: 8.64 → 7.50

## Roadmap

### Hafta 1
- API çağrısını düzelt
- Pace modelini basitleştir
*Beklenen: Çelişki çözülür, Pace MAE düşer*

### Hafta 2
- Deplasman feature'ları ekle
- Rakip form detayları
*Beklenen: Away MAE 9.85 → 8.50*

### Hafta 3
- Hiperparametre optimizasyonu
- Ensemble dene
*Beklenen: Margin MAE 11.63 → 10.00*

### Hafta 4
- Pozisyon bazlı oyuncu projeksiyonları
*Beklenen: Tüm metriklerde ek iyileşme*

