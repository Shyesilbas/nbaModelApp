# Score Model V4 İyileştirme Planı

## Mevcut Durum (V3)

- Pace MAE: 3.62
- Home Off_Rtg MAE: 9.09
- Away Off_Rtg MAE: 9.85
- Margin MAE: 11.63
- Derived Home Score MAE: 8.17
- Derived Away Score MAE: 8.64

## Win Modelinden Referans

Win modeline oyuncu projeksiyonları eklenerek AUC 0.705 → 0.759'a çıktı (+%7.7).
Benzer yaklaşım Score modeline uygulanacak.

## Önerilen İyileştirmeler

### Oyuncu Projeksiyonlarını Score Modeline Derinlemesine Entegre Et
- **Mevcut:** Sadece TEAM_V3_PROJ_PTS_SUM gibi basit aggregasyonlar var
- **İyileştirme:** Her pozisyon grubunun (GUARD/WING/BIG) ayrı ayrı projeksiyonlarını ekle
- **Beklenen Kazanç:** Margin MAE: 11.63 → 10.50 (-1.13)
- **Zorluk:** Orta
- **Dosya:** `scripts/experiments/add_player_projections_score.py`

### Away Takımı İçin Ayrı Feature Engineering
- **Mevcut:** Home ve Away aynı feature setini kullanıyor
- **İyileştirme:** Deplasman takımları için seyahat mesafesi, saat dilimi farkı, back-to-back detayları ekle
- **Beklenen Kazanç:** Away Off_Rtg MAE: 9.85 → 8.90 (-0.95)
- **Zorluk:** Düşük
- **Dosya:** `scripts/features/build_score_features.py`

### Pace Modelini Skordan Bağımsız Hale Getir
- **Mevcut:** Pace ayrı model ama oyuncu projeksiyonları Pace'i bozdu (3.38 → 3.62)
- **İyileştirme:** Pace'i sadece takım trendleriyle tahmin et, oyuncu projeksiyonlarını kullanma
- **Beklenen Kazanç:** Pace MAE: 3.62 → 3.30 (-0.32)
- **Zorluk:** Düşük
- **Dosya:** `scripts/experiments/train_score_v3_xgboost.py`

### Hiperparametre Optimizasyonu (GridSearchCV)
- **Mevcut:** XGBoost varsayılan parametrelerle çalışıyor
- **İyileştirme:** max_depth, learning_rate, n_estimators, subsample optimize et
- **Beklenen Kazanç:** Tüm metriklerde %3-5 iyileşme
- **Zorluk:** Yüksek (zaman alır)
- **Dosya:** `scripts/experiments/tune_score_models.py`

### Ensemble: Ridge + XGBoost + GBDT
- **Mevcut:** Sadece XGBoost kullanılıyor
- **İyileştirme:** Üç modelin ortalamasını al (weighted average)
- **Beklenen Kazanç:** Margin MAE: 11.63 → 11.00 (-0.63)
- **Zorluk:** Orta
- **Dosya:** `scripts/experiments/ensemble_score_models.py`

### Rakip Takımın Son 5 Maçlık Formunu Detaylandır
- **Mevcut:** Sadece OPP_PACE_LAST_5, OPP_DEF_RTG_LAST_5 var
- **İyileştirme:** Rakibin son 5 maçtaki kazanma oranı, sayı farkı, home/away performansı ekle
- **Beklenen Kazanç:** Home Off_Rtg MAE: 9.09 → 8.70 (-0.39)
- **Zorluk:** Düşük
- **Dosya:** `scripts/features/build_score_features.py`

## Hızlı Kazançlar (Öncelik Sırası)

- 1. Öneri #3: Pace modelini basitleştir (30 dk, hemen yapılabilir)
- 2. Öneri #6: Rakip form detaylarını ekle (1 saat)
- 3. Öneri #2: Away takımı için seyahat metriği ekle (1 saat)
- 4. Öneri #5: Ensemble model dene (2 saat)
- 5. Öneri #1: Pozisyon bazlı oyuncu projeksiyonları (2 saat)

## Hedef Metrikler (V4)

- Pace MAE: 3.30 (↓0.32)
- Home Off_Rtg MAE: 8.70 (↓0.39)
- Away Off_Rtg MAE: 8.90 (↓0.95)
- Margin MAE: 10.50 (↓1.13)
- Derived Home Score MAE: 7.80 (↓0.37)
- Derived Away Score MAE: 8.00 (↓0.64)
