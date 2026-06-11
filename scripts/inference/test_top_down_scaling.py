import sys
from pathlib import Path
from datetime import date
import time

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))
sys.path.append(str(ROOT / "ml-service"))

from app.schemas import GameFullRequest
from app.service import predict_game_full, init_model

def main():
    print("Loading models...")
    init_model()
    
    req = GameFullRequest(
        game_id="0022501234",
        home_team_id="LAL",
        away_team_id="BOS",
        prediction_date=date(2026, 6, 11)
    )
    
    print("Running predict_game_full (Cold Start)...")
    res_cold = predict_game_full(req)
    
    print("\nRunning predict_game_full (Warm Start)...")
    start = time.time()
    res = predict_game_full(req)
    duration = time.time() - start
    
    print(f"Duration: {duration:.2f}s")
    print(f"Score: LAL {res.score_prediction.home} - BOS {res.score_prediction.away}")
    print(f"Win Prob: Home {res.win_probability.home_win_prob}, Away {res.win_probability.away_win_prob}")
    print(f"Scale Factors: Home {res.scale_factors.home:.3f}, Away {res.scale_factors.away:.3f}")
    
    home_scaled_sum = sum(p.proj_pts for p in res.home_players)
    away_scaled_sum = sum(p.proj_pts for p in res.away_players)
    
    print(f"Home Scaled sum: {home_scaled_sum:.1f} vs Exp Score: {res.score_prediction.home:.1f}")
    print(f"Away Scaled sum: {away_scaled_sum:.1f} vs Exp Score: {res.score_prediction.away:.1f}")
    
    assert abs(home_scaled_sum - res.score_prediction.home) < 2.0, "Home scaled sum doesn't match score"
    assert abs(away_scaled_sum - res.score_prediction.away) < 2.0, "Away scaled sum doesn't match score"
    
    if not (0.85 <= res.scale_factors.home <= 1.15):
        print(f"Warning: Home scale factor {res.scale_factors.home} out of 0.85-1.15 bounds")
    if not (0.85 <= res.scale_factors.away <= 1.15):
        print(f"Warning: Away scale factor {res.scale_factors.away} out of 0.85-1.15 bounds")
        
    for p in res.home_players + res.away_players:
        assert p.proj_pts >= 0, f"Negative projected points for {p.player_name}"
        
    if duration > 2.0:
        print("Warning: API execution took longer than 2.0s")
        
    print("\nSUCCESS: Top-down scaling and API response integration is fully functional!")

if __name__ == '__main__':
    main()
