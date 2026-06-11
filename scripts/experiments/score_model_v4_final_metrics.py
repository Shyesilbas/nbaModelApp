# scripts/experiments/score_model_v4_final_metrics.py

import pandas as pd
import numpy as np
import joblib
import glob
import os
import math
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score, accuracy_score, precision_score, recall_score, f1_score
import warnings
warnings.filterwarnings('ignore')

# Takım lokasyonları ve haversine fonksiyonu (feature generation için)
NBA_TEAMS_LOCATIONS = {
    "BOS": {"lat": 42.3662, "lon": -71.0621, "tz_offset": -5},
    "BKN": {"lat": 40.6826, "lon": -73.9754, "tz_offset": -5},
    "NYK": {"lat": 40.7505, "lon": -73.9934, "tz_offset": -5},
    "PHI": {"lat": 39.9012, "lon": -75.1719, "tz_offset": -5},
    "TOR": {"lat": 43.6435, "lon": -79.3791, "tz_offset": -5},
    "CHI": {"lat": 41.8806, "lon": -87.6742, "tz_offset": -6},
    "CLE": {"lat": 41.4965, "lon": -81.6881, "tz_offset": -5},
    "DET": {"lat": 42.3411, "lon": -83.0550, "tz_offset": -5},
    "IND": {"lat": 39.7641, "lon": -86.1555, "tz_offset": -5},
    "MIL": {"lat": 43.0451, "lon": -87.9172, "tz_offset": -6},
    "ATL": {"lat": 33.7573, "lon": -84.3963, "tz_offset": -5},
    "CHA": {"lat": 35.2251, "lon": -80.8392, "tz_offset": -5},
    "MIA": {"lat": 25.7814, "lon": -80.1870, "tz_offset": -5},
    "ORL": {"lat": 28.5392, "lon": -81.3839, "tz_offset": -5},
    "WAS": {"lat": 38.8981, "lon": -77.0209, "tz_offset": -5},
    "DEN": {"lat": 39.7486, "lon": -105.0075, "tz_offset": -7},
    "MIN": {"lat": 44.9795, "lon": -93.2761, "tz_offset": -6},
    "OKC": {"lat": 35.4634, "lon": -97.5151, "tz_offset": -6},
    "POR": {"lat": 45.5316, "lon": -122.6668, "tz_offset": -8},
    "UTA": {"lat": 40.7683, "lon": -111.9011, "tz_offset": -7},
    "GSW": {"lat": 37.7680, "lon": -122.3877, "tz_offset": -8},
    "LAC": {"lat": 34.0430, "lon": -118.2673, "tz_offset": -8},
    "LAL": {"lat": 34.0430, "lon": -118.2673, "tz_offset": -8},
    "PHX": {"lat": 33.4457, "lon": -112.0712, "tz_offset": -7},
    "SAC": {"lat": 38.5802, "lon": -121.4997, "tz_offset": -8},
    "DAL": {"lat": 32.7905, "lon": -96.8103, "tz_offset": -6},
    "HOU": {"lat": 29.7508, "lon": -95.3621, "tz_offset": -6},
    "MEM": {"lat": 35.1381, "lon": -90.0506, "tz_offset": -6},
    "NOP": {"lat": 29.9490, "lon": -90.0821, "tz_offset": -6},
    "SAS": {"lat": 29.4270, "lon": -98.4375, "tz_offset": -6}
}

def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def get_location_features(row):
    home_team = row["TEAM_ABBREVIATION"] if row["IS_HOME"] else row["OPPONENT_ABBREVIATION"]
    away_team = row["OPPONENT_ABBREVIATION"] if row["IS_HOME"] else row["TEAM_ABBREVIATION"]
    
    home_loc = NBA_TEAMS_LOCATIONS.get(home_team)
    away_loc = NBA_TEAMS_LOCATIONS.get(away_team)
    
    dist = 0.0
    tz_diff = 0.0
    if home_loc and away_loc:
        dist = haversine(home_loc["lat"], home_loc["lon"], away_loc["lat"], away_loc["lon"])
        tz_diff = abs(home_loc["tz_offset"] - away_loc["tz_offset"])
        
    if row["IS_HOME"]:
        return pd.Series({"TRAVEL_DISTANCE": 0.0, "TIMEZONE_DIFF": 0.0, "OPP_TRAVEL_DISTANCE": dist, "OPP_TIMEZONE_DIFF": tz_diff})
    else:
        return pd.Series({"TRAVEL_DISTANCE": dist, "TIMEZONE_DIFF": tz_diff, "OPP_TRAVEL_DISTANCE": 0.0, "OPP_TIMEZONE_DIFF": 0.0})

def main():
    print("=" * 70)
    print("Score Model V4 Final Metrik Raporu")
    print("=" * 70)
    
    # 1. Test verisini hazırla (Eğitimdeki aynı X_test'i oluşturuyoruz)
    processed_dir = "data/processed"
    files = glob.glob(f"{processed_dir}/team_model_ready_v3_*.csv")
    df_list = []
    for f in files:
        df_list.append(pd.read_csv(f))
    df = pd.concat(df_list, ignore_index=True)
    df = df.dropna(subset=["PACE", "OFF_RTG", "DEF_RTG", "PACE_LAST_5", "OFF_RTG_LAST_5", "DEF_RTG_LAST_5"])
    
    loc_feats = df.apply(get_location_features, axis=1)
    df = pd.concat([df, loc_feats], axis=1)
    
    df_home = df[df["IS_HOME"] == True].copy()
    df_away = df[df["IS_HOME"] == False].copy()
    
    # Feature listeleri
    pace_features = [
        "PACE_LAST_5", "PACE_LAST_10", "OPP_PACE_LAST_5", "OPP_PACE_LAST_10",
        "OFF_RTG_LAST_5", "DEF_RTG_LAST_5", "OPP_OFF_RTG_LAST_5", "OPP_DEF_RTG_LAST_5",
        "DAYS_REST", "OPP_DAYS_REST"
    ]
    base_off_rtg_features = [
        "OFF_RTG_LAST_5", "OFF_RTG_LAST_10", "PACE_LAST_5", "WINRATE_LAST_5", 
        "OPP_DEF_RTG_LAST_5", "OPP_DEF_RTG_LAST_10", "OPP_PACE_LAST_5",
        "TEAM_CORE_TOP3_PLAYED_COUNT", "TEAM_CORE_TOP3_AVAILABLE_RATE", "TEAM_CORE_TOP3_PTS_LAST_5_SUM",
        "OPP_CORE_TOP3_PLAYED_COUNT", "DAYS_REST", "OPP_DAYS_REST"
    ]
    home_off_rtg_features = base_off_rtg_features.copy()
    away_off_rtg_features = base_off_rtg_features.copy() + ["TRAVEL_DISTANCE", "TIMEZONE_DIFF"]
    margin_features = home_off_rtg_features + ["DEF_RTG_LAST_5", "DEF_RTG_LAST_10", "OPP_OFF_RTG_LAST_5"]
    
    df_home["TARGET_PACE"] = df_home["PACE"]
    df_home["TARGET_HOME_OFF_RTG"] = df_home["OFF_RTG"]
    df_away["TARGET_AWAY_OFF_RTG"] = df_away["OFF_RTG"]
    df_home["TARGET_MARGIN"] = df_home["PACE"] * df_home["NET_RTG"] / 100.0
    
    # 2. Modelleri yükle
    pace_model = joblib.load("models/production/score_model_v3_pace.pkl")
    home_rtg_model = joblib.load("models/production/score_model_v3_home_rtg.pkl")
    away_rtg_model = joblib.load("models/production/score_model_v3_away_rtg.pkl")
    margin_model = joblib.load("models/production/score_model_v3_margin.pkl")
    
    # Train-test split (Eğitimdeki gibi aynı seed ile)
    _, X_test_pace, _, y_test_pace = train_test_split(df_home[pace_features], df_home["TARGET_PACE"], test_size=0.2, random_state=42)
    _, X_test_home, _, y_test_home = train_test_split(df_home[home_off_rtg_features], df_home["TARGET_HOME_OFF_RTG"], test_size=0.2, random_state=42)
    _, X_test_away, _, y_test_away = train_test_split(df_away[away_off_rtg_features], df_away["TARGET_AWAY_OFF_RTG"], test_size=0.2, random_state=42)
    _, X_test_margin, _, y_test_margin = train_test_split(df_home[margin_features], df_home["TARGET_MARGIN"], test_size=0.2, random_state=42)
    
    # Test setine GAME_ID ekleyerek match edebilmek için index kullanacağız.
    test_indices_home = X_test_pace.index
    test_indices_away = X_test_away.index
    
    # 3. Tahmin yap
    y_pred_pace = pace_model.predict(X_test_pace)
    y_pred_home_rtg = home_rtg_model.predict(X_test_home)
    y_pred_away_rtg = away_rtg_model.predict(X_test_away)
    y_pred_margin = margin_model.predict(X_test_margin)
    
    # df_test_home ve df_test_away veri çerçevelerini oluşturalım
    df_test_home = df_home.loc[test_indices_home].copy()
    df_test_home["PRED_PACE"] = y_pred_pace
    df_test_home["PRED_HOME_RTG"] = y_pred_home_rtg
    df_test_home["PRED_MARGIN"] = y_pred_margin
    df_test_home["ACTUAL_HOME_PTS"] = df_test_home["PACE"] * df_test_home["OFF_RTG"] / 100.0
    df_test_home["ACTUAL_AWAY_PTS"] = df_test_home["PACE"] * df_test_home["DEF_RTG"] / 100.0
    
    df_test_away = df_away.loc[test_indices_away].copy()
    df_test_away["PRED_AWAY_RTG"] = y_pred_away_rtg
    
    # Oyun bazında birleştir (derived skorlar için)
    df_test_eval = df_test_home.merge(df_test_away[["GAME_ID", "PRED_AWAY_RTG"]], on="GAME_ID", how="inner")
    
    # 4. Derived skorları hesapla
    df_test_eval["PRED_HOME_SCORE"] = df_test_eval["PRED_PACE"] * df_test_eval["PRED_HOME_RTG"] / 100.0
    df_test_eval["PRED_AWAY_SCORE"] = df_test_eval["PRED_PACE"] * df_test_eval["PRED_AWAY_RTG"] / 100.0
    
    # 5. Gerçek değerler
    y_true_home_score = df_test_eval["ACTUAL_HOME_PTS"]
    y_true_away_score = df_test_eval["ACTUAL_AWAY_PTS"]
    y_true_margin_derived = df_test_eval["ACTUAL_HOME_PTS"] - df_test_eval["ACTUAL_AWAY_PTS"]
    
    # 6. Regresyon metrikleri
    print("\n📊 REGRESYON METRİKLERİ")
    print("-" * 50)
    
    metrics = {}
    
    # df_test_eval üzerinden gidelim ki boyutlar aynı olsun
    y_true_pace_eval = df_test_eval["PACE"]
    y_pred_pace_eval = df_test_eval["PRED_PACE"]
    y_true_home_rtg_eval = df_test_eval["OFF_RTG"]
    y_pred_home_rtg_eval = df_test_eval["PRED_HOME_RTG"]
    
    # Away için df_test_eval içindeki AWAY verilerini kullanamayız çünkü o test_home içindeki "DEF_RTG" idi.
    # df_test_away'i df_test_home ile inner join yaptık, bu yüzden df_test_eval içindeki test edilebilir.
    # df_away veri kümesinde TARGET_AWAY_OFF_RTG var. df_test_away["TARGET_AWAY_OFF_RTG"] kullanacağız.
    # Inner join sonrası:
    df_test_eval = df_test_eval.merge(df_test_away[["GAME_ID", "TARGET_AWAY_OFF_RTG"]], on="GAME_ID", how="inner")
    
    y_true_away_rtg_eval = df_test_eval["TARGET_AWAY_OFF_RTG"]
    y_pred_away_rtg_eval = df_test_eval["PRED_AWAY_RTG"]
    
    y_true_margin_eval = df_test_eval["TARGET_MARGIN"]
    y_pred_margin_eval = df_test_eval["PRED_MARGIN"]
    
    for name, y_true, y_pred in [
        ("Pace", y_true_pace_eval, y_pred_pace_eval),
        ("Home Off_Rtg", y_true_home_rtg_eval, y_pred_home_rtg_eval),
        ("Away Off_Rtg", y_true_away_rtg_eval, y_pred_away_rtg_eval),
        ("Margin", y_true_margin_eval, y_pred_margin_eval),
        ("Home Score", y_true_home_score, df_test_eval["PRED_HOME_SCORE"]),
        ("Away Score", y_true_away_score, df_test_eval["PRED_AWAY_SCORE"])
    ]:
        mae = mean_absolute_error(y_true, y_pred)
        rmse = np.sqrt(mean_squared_error(y_true, y_pred))
        r2 = r2_score(y_true, y_pred)
        
        # MAPE için 0'a bölme hatasını önle
        valid_idx = y_true != 0
        mape = np.mean(np.abs((y_true[valid_idx] - y_pred[valid_idx]) / y_true[valid_idx])) * 100
        
        metrics[name] = {"MAE": mae, "RMSE": rmse, "R²": r2, "MAPE": mape}
        
        print(f"\n   {name}:")
        print(f"      MAE: {mae:.2f}")
        print(f"      RMSE: {rmse:.2f}")
        print(f"      R²: {r2:.3f}")
        print(f"      MAPE: {mape:.1f}%")
    
    # 7. Sınıflandırma metrikleri (Margin'den kazanan tahmini)
    print("\n🏆 SINIFLANDIRMA METRİKLERİ (Kazanan Tahmini)")
    print("-" * 50)
    
    # Margin > 0 ise home kazanır, <= 0 ise away kazanır
    y_true_winner = (y_true_margin_eval > 0).astype(int)  # 1 = Home, 0 = Away
    y_pred_winner = (y_pred_margin_eval > 0).astype(int)
    
    accuracy = accuracy_score(y_true_winner, y_pred_winner)
    precision = precision_score(y_true_winner, y_pred_winner)
    recall = recall_score(y_true_winner, y_pred_winner)
    f1 = f1_score(y_true_winner, y_pred_winner)
    
    print(f"   Accuracy: {accuracy:.3f} ({accuracy*100:.1f}%)")
    print(f"   Precision: {precision:.3f}")
    print(f"   Recall: {recall:.3f}")
    print(f"   F1-Score: {f1:.3f}")
    
    # 8. V3 vs V4 karşılaştırması
    print("\n📈 V3 vs V4 KARŞILAŞTIRMASI")
    print("-" * 50)
    
    v3_metrics = {
        "Pace MAE": 3.62,
        "Home Off_Rtg MAE": 9.09,
        "Away Off_Rtg MAE": 9.85,
        "Margin MAE": 11.63,
        "Derived Home Score MAE": 8.17,
        "Derived Away Score MAE": 8.64
    }
    
    v4_metrics = {
        "Pace MAE": metrics["Pace"]["MAE"],
        "Home Off_Rtg MAE": metrics["Home Off_Rtg"]["MAE"],
        "Away Off_Rtg MAE": metrics["Away Off_Rtg"]["MAE"],
        "Margin MAE": metrics["Margin"]["MAE"],
        "Derived Home Score MAE": metrics["Home Score"]["MAE"],
        "Derived Away Score MAE": metrics["Away Score"]["MAE"]
    }
    
    for key in v3_metrics:
        v3 = v3_metrics[key]
        v4 = v4_metrics[key]
        improvement = v3 - v4
        pct = (improvement / v3) * 100
        arrow = "✅" if improvement > 0 else "❌"
        print(f"   {key}: {v3:.2f} → {v4:.2f} ({arrow} {improvement:+.2f}, %{pct:+.1f})")
    
    # 9. Raporu kaydet
    print("\n💾 Rapor kaydediliyor...")
    
    report_path = "reports/experiments/score_model_v4_final_metrics.md"
    os.makedirs("reports/experiments", exist_ok=True)
    
    with open(report_path, "w") as f:
        f.write("# Score Model V4 Final Metrik Raporu\n\n")
        f.write("## Regresyon Metrikleri\n\n")
        f.write("| Model | MAE | RMSE | R² | MAPE |\n")
        f.write("|-------|-----|------|----|----- |\n")
        for name, m in metrics.items():
            f.write(f"| {name} | {m['MAE']:.2f} | {m['RMSE']:.2f} | {m['R²']:.3f} | {m['MAPE']:.1f}% |\n")
        f.write("\n## Sınıflandırma Metrikleri (Kazanan Tahmini)\n\n")
        f.write(f"- **Accuracy:** {accuracy:.3f} ({accuracy*100:.1f}%)\n")
        f.write(f"- **Precision:** {precision:.3f}\n")
        f.write(f"- **Recall:** {recall:.3f}\n")
        f.write(f"- **F1-Score:** {f1:.3f}\n")
        f.write("\n## V3 vs V4 Karşılaştırması (MAE)\n\n")
        f.write("| Metrik | V3 | V4 | Değişim |\n")
        f.write("|--------|----|----|---------|\n")
        for key in v3_metrics:
            v3 = v3_metrics[key]
            v4 = v4_metrics[key]
            f.write(f"| {key} | {v3:.2f} | {v4:.2f} | {v4-v3:+.2f} |\n")
    
    print(f"   ✅ Rapor kaydedildi: {report_path}")
    
    # 10. Sonuç
    print("\n" + "=" * 70)
    print("🎉 SCORE MODEL V4 HAZIR!")
    print("=" * 70)
    print("Tüm metrikler hesaplandı. Model production'a alınabilir.")

if __name__ == "__main__":
    main()
