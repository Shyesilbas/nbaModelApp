# NBA Modelleri Kapsamli Raporu (Release v15)

> **Rapor Tarihi:** 2026-10-25  
> **Kapsam:** NBA Tahmin Motoru Uretim Mimarisi, Walk-Forward Dogrulamasi ve Metrik Envanteri  
> **Tek Kaynak Sirasi:**  
> 1. `ARTIFACT_REGISTRY.md` — Veri, model ve rapor envanteri.  
> 2. `PROJECT_STATUS.md` — Guncel sezon, model durumu ve bilinen sinirlar.  
> 3. `docs/reports/models/*.md` — Her modelin kendi mimari, denetim ve reddedilen deney raporu.  
> 4. `docs/reports/nba_models_comprehensive_report.md` — Bu ana rapor.  
> 5. `AI_CONTEXT.md` — Makine okunabilir ozet ve veri/API sema katalogu.  

---

## 1. Mimari Genel Bakis

Sistem uc temel model ailesinden olusur:

```
[Ham Box Score & Olay Akisi]
           │
           ▼
[Ozellik Muhendisligi & shift(1) Cevrimdisi/Cevrimici Paritesi]
     ├── Continuous Elo & Cop Zamani Temizlenmis Net Rating
     └── Kadro Devamliligi, Eksik Dakika & Game Score Agirligi
           │
    ┌──────┴──────────────────────┬──────────────────────┐
    ▼                             ▼                      ▼
[WIN Modeli (v15)]         [SCORE Modeli (v15)]  [PLAYER Modeli (v15)]
11 Ozellikli Lojistik Reg.  Ridge Pace/Off/Margin LightGBM 24 Ozellik (L1)
Brier: 0.2098              Total MAE: 14.85 pts   PTS MAE: 4.460
Log-Loss: 0.6065           Margin MAE: 10.809 pts REB MAE: 1.864
AUC: 0.7217                Spread Acc: %66.67     AST MAE: 1.279
    │                             │                      │
    └──────────────────────┬──────┴──────────────────────┘
                           ▼
              [FastAPI Backend & React UI]
              Canli Tahmin, Paper Trading & SHAP Aciklamalari
```

---

## 2. Uretim Modelleri Ozet Karnesi

| Model Ailesi | Aktif Dosya | Algoritma | Boyut / Ozellik | Birincil Metrik (5 Sezonluk Walk-Forward) | Taban Cizgisi |
|---|---|---|---:|---:|---:|
| **WIN Modeli** | `models/production/win_model.pkl` | Lojistik Regresyon (`v15`) | 11 ozellik | **Brier: 0.2098**, **LL: 0.6065**, **AUC: 0.7217** | Saf Elo Brier `0.2158` |
| **SCORE Total** | `models/production/score_model_pace.pkl` | Ridge Pace + Off Rtg (`v15`) | 2 + 4 ozellik | **Total MAE: 14.85 sayi** | Son 10 Mac `14.95 sayi` |
| **SCORE Margin**| `models/production/score_model_margin.pkl`| Ridge Fark Modeli (`v15`) | 11 ozellik | **Margin MAE: 10.809 sayi**, **Dogruluk: %66.67** | Son 10 Mac `11.41 sayi` |
| **PLAYER PTS**  | `models/production/player_model_pts.pkl`  | LightGBM L1 (`v15`) | 24 ozellik | **PTS MAE: 4.460 sayi** | EMA-10 `4.632 sayi` |
| **PLAYER REB**  | `models/production/player_model_reb.pkl`  | LightGBM L1 (`v15`) | 24 ozellik | **REB MAE: 1.864 ribaund** | EMA-10 `1.927 ribaund` |
| **PLAYER AST**  | `models/production/player_model_ast.pkl`  | LightGBM L1 (`v15`) | 24 ozellik | **AST MAE: 1.279 asist** | EMA-10 `1.332 asist` |

---

## 3. Model Bazinda Referans Dokumanlar

- **WIN Modeli Ayrintili Raporu:** [`docs/reports/models/win_probability_model.md`](models/win_probability_model.md)
- **SCORE Modeli Ayrintili Raporu:** [`docs/reports/models/score_model.md`](models/score_model.md)
- **PLAYER Modeli Ayrintili Raporu:** [`docs/reports/models/player_props_model.md`](models/player_props_model.md)
- **WIN Rotasyon Deneyi:** [`reports/backtests/2026-10-25_win_rotation_continuity/README.md`](../../reports/backtests/2026-10-25_win_rotation_continuity/README.md)
- **SCORE Rotasyon Deneyi:** [`reports/backtests/2026-10-25_score_rotation_features/README.md`](../../reports/backtests/2026-10-25_score_rotation_features/README.md)
- **PLAYER Rotasyon Deneyi:** [`reports/backtests/2026-10-25_player_rotation_features/README.md`](../../reports/backtests/2026-10-25_player_rotation_features/README.md)
- **PLAYER L1 Medyan Hedef Deneyi:** [`reports/backtests/2026-10-25_player_l1_objectives/README.md`](../../reports/backtests/2026-10-25_player_l1_objectives/README.md)
