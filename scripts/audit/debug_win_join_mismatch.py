import os
import pandas as pd


def debug_join_mismatch():
    # Dosya yolları tanımları
    features_path = "data/experimental/team_games_features_2024_25.csv"
    results_path = "data/experimental/team_win_model_ready_v2_2024_25.csv"
    report_dir = "reports/audits"
    report_path = os.path.join(report_dir, "win_dataset_generation_logic_debug_2024_25.md")

    os.makedirs(report_dir, exist_ok=True)

    if not os.path.exists(features_path) or not os.path.exists(results_path):
        print("Hata: Gerekli kaynak dosyalar bulunamadı. Lütfen yolları kontrol edin.")
        return

    print("=== NBA ML PROJECT — JOIN MISMATCH INVESTIGATION ===")
    df_feat = pd.read_csv(features_path)
    df_res = pd.read_csv(results_path)

    # GAME_ID'leri string ve zfill olacak şekilde standardize etme
    for df in [df_feat, df_res]:
        for col in ["GAME_ID", "Game_ID"]:
            if col in df.columns:
                df[col] = df[col].astype(str).str.zfill(10)

    feat_game_col = "GAME_ID" if "GAME_ID" in df_feat.columns else "Game_ID"
    res_game_col = "GAME_ID" if "GAME_ID" in df_res.columns else "Game_ID"

    feat_games = set(df_feat[feat_game_col].unique())
    res_games = set(df_res[res_game_col].unique())

    # Eksik olan 2 maçın tespiti
    missing_in_results = feat_games - res_games
    missing_in_features = res_games - feat_games

    print(f"Feature Set Benzersiz Maç: {len(feat_games)}")
    print(f"Model Ready Set Benzersiz Maç: {len(res_games)}")
    print(f"Model Ready Set İçinde Kaybolan Maç Sayısı: {len(missing_in_results)}")

    # Eksik maçların detaylarını yakalama
    missing_details = []
    if missing_in_results:
        print(f"\n[CRITICAL] Kaybolan Maç ID'leri: {missing_in_results}")
        df_missing_feat = df_feat[df_feat[feat_game_col].isin(missing_in_results)]

        for _, row in df_missing_feat.drop_duplicates(subset=[feat_game_col]).iterrows():
            detail = f"- **GAME_ID:** `{row[feat_game_col]}` | **Tarih:** {row.get('GAME_DATE', 'N/A')} | **Matchup:** {row.get('MATCHUP', 'N/A')} | **Takım:** {row.get('TEAM_ABBREVIATION', 'N/A')}"
            missing_details.append(detail)
            print(detail)

    # scripts/train_win_probability_v2.py analizi için hipotez üretimi
    join_logic_leak = "scripts/train_win_probability_v2.py"

    report_content = f"""# Win Dataset Generation Logic Debug Report (2024-25)
**Oluşturulma Tarihi:** June 2026
**Analiz Amacı:** Feature seti (1320 maç) ile Model Ready seti (1318 maç) arasındaki 2 maçlık uyuşmazlığın kök nedenini bulmak.

## 1. Uyuşmazlık Özeti
- `team_games_features_2024_25.csv` Benzersiz Maç Sayısı: **{len(feat_games)}**
- `team_win_model_ready_v2_2024_25.csv` Benzersiz Maç Sayısı: **{len(res_games)}**
- Filtreleme veya Hatalı Join Nedeniyle Düşen Maç Sayısı: **{len(missing_in_results)}**

## 2. Düşen/Kaybolan Maçların Detayları
Feature setinde var olan ama son çıktıya ulaşamayan maçlar:
{chr(10).join(missing_details) if missing_details else "- Herhangi bir maça rastlanmadı veya uyuşmazlık yönü farklı."}

## 3. Olası Kök Nedenler (Root Cause Hypotheses)
1. **Natural Key Mismatch:** `scripts/train_win_probability_v2.py` içindeki remap akışında `GAME_DATE` biçimlerinin (`YYYY-MM-DD` vs `DD/MM/YYYY`) veya `MATCHUP` string ifadelerinin (`@` vs `vs.`) uyuşmaması.
2. **Missing In Game Results Source:** `game_results_2024_25.csv` ham dosyasında bu 2 maçın (muhtemelen playoff veya play-in maçı) hiç yer almaması.
3. **Inner Join Drop:** Pipeline'daki `merge()` fonksiyonunun `how='inner'` kullanması ve eşleşmeyen doğal anahtarlar yüzünden satırları silmesi.

## 4. Sonraki Adım
Bu rapor çıktısına göre `{join_logic_leak}` dosyasındaki sorunlu join satırı düzeltilecek ve feature pipeline yeniden tetiklenecektir.
"""

    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report_content)

    print(f"\n✓ Mantıksal analiz tamamlandı. Rapor yazıldı: {report_path}")


if __name__ == "__main__":
    debug_join_mismatch()
