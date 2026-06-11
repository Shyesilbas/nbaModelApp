# scripts/fix/score_win_contradiction_fix.py

import os
import json
import requests

def fix_frontend_api_calls():
    """
    Frontend'deki API çağrılarını güncelle
    Mevcut: /predict/win + /predict/score (ayrı ayrı)
    Yeni: /predict/game_full (tek çağrı, senkronize)
    """
    
    # 1. Backend'deki endpoint'i kontrol et
    base_url = "http://localhost:8001"
    
    # Örnek istek
    request = {
        "game_id": "0022501234",
        "home_team_id": "DEN",
        "away_team_id": "HOU",
        "prediction_date": "2025-12-20"
    }
    
    # 2. Yeni endpoint'i test et
    response = requests.post(f"{base_url}/predict/game_full", json=request)
    
    if response.status_code == 200:
        data = response.json()
        
        print("✅ /predict/game_full başarıyla çalıştı")
        print(f"   Score: {data['score_prediction']['home']} - {data['score_prediction']['away']}")
        print(f"   Kazanan: {'HOME' if data['win_probability']['home_win_prob'] > 0.5 else 'AWAY'}")
        print(f"   Scale factors: {data['scale_factors']}")
        
        # 3. Çelişki kontrolü
        home_score = data['score_prediction']['home']
        away_score = data['score_prediction']['away']
        home_win_prob = data['win_probability']['home_win_prob']
        
        if (home_score > away_score and home_win_prob < 0.5) or \
           (away_score > home_score and home_win_prob > 0.5):
            print("❌ HALA ÇELİŞKİ VAR!")
        else:
            print("✅ ÇELİŞKİ YOK! Score ve Win senkronize.")
    else:
        print(f"❌ Hata: {response.status_code}")

if __name__ == "__main__":
    fix_frontend_api_calls()
