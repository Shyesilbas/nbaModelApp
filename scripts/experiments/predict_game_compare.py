import json
import joblib
import pandas as pd
from pathlib import Path

ROOT = Path("/Users/serhat/agProjects/nbaModelApp")
import sys
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.build_matchup_features import build_features

def run_compare():
    game_date = "2025-12-21"
    home_team = "ATL"
    away_team = "CHI"
    
    print(f"--- Running comparison for {home_team} vs {away_team} on {game_date} ---")
    
    # 1. Build features (from Home's perspective ATL vs CHI)
    feats_home = build_features(home_team, away_team, game_date)
    # Build features (from Away's perspective CHI vs ATL)
    feats_away = build_features(away_team, home_team, game_date)
    
    # 2. V4 Score Models
    pace_v4 = joblib.load(ROOT / "models/production/score_model_v4_pace.pkl")
    home_rtg_v4 = joblib.load(ROOT / "models/production/score_model_v4_home_rtg.pkl")
    away_rtg_v4 = joblib.load(ROOT / "models/production/score_model_v4_away_rtg.pkl")
    margin_v4 = joblib.load(ROOT / "models/production/score_model_v4_margin.pkl")
    metadata_v4 = json.loads((ROOT / "models/production/score_model_v4_metadata.json").read_text())
    
    # 3. V5 Score Models
    pace_v5 = joblib.load(ROOT / "models/production/score_model_v5_pace.pkl")
    home_rtg_v5 = joblib.load(ROOT / "models/production/score_model_v5_home_rtg.pkl")
    away_rtg_v5 = joblib.load(ROOT / "models/production/score_model_v5_away_rtg.pkl")
    margin_v5 = joblib.load(ROOT / "models/production/score_model_v5_margin.pkl")
    metadata_v5 = json.loads((ROOT / "models/production/score_model_v5_metadata.json").read_text())
    
    def get_score_preds(pace_m, h_rtg_m, a_rtg_m, marg_m, meta):
        p_feats = meta["pace_features"]
        h_feats = meta["home_off_rtg_features"]
        a_feats = meta["away_off_rtg_features"]
        m_feats = meta["margin_features"]
        
        X_p = pd.DataFrame([[feats_home[c] for c in p_feats]], columns=p_feats)
        X_h = pd.DataFrame([[feats_home[c] for c in h_feats]], columns=h_feats)
        X_a = pd.DataFrame([[feats_away[c] for c in a_feats]], columns=a_feats)
        X_m = pd.DataFrame([[feats_home[c] for c in m_feats]], columns=m_feats)
        
        pred_pace = pace_m.predict(X_p)[0]
        pred_home_rtg = h_rtg_m.predict(X_h)[0]
        pred_away_rtg = a_m_pred = a_rtg_m.predict(X_a)[0]
        pred_margin = marg_m.predict(X_m)[0]
        
        pred_home = pred_pace * pred_home_rtg / 100.0
        pred_away = pred_pace * pred_away_rtg / 100.0
        pred_total = pred_home + pred_away
        
        # Reconcile using margin
        reconciled_home = (pred_total + pred_margin) / 2.0
        reconciled_away = (pred_total - pred_margin) / 2.0
        
        return {
            "pace": float(pred_pace),
            "home_rtg": float(pred_home_rtg),
            "away_rtg": float(pred_away_rtg),
            "margin": float(pred_margin),
            "home_score": float(reconciled_home),
            "away_score": float(reconciled_away),
            "total": float(pred_total)
        }
        
    s_v4 = get_score_preds(pace_v4, home_rtg_v4, away_rtg_v4, margin_v4, metadata_v4)
    s_v5 = get_score_preds(pace_v5, home_rtg_v5, away_rtg_v5, margin_v5, metadata_v5)
    
    # 4. Win Probability Models
    win_v4_model = joblib.load(ROOT / "models/production/archive/win_probability_model_backup_v4.pkl")
    win_v4_features = json.loads((ROOT / "models/production/archive/feature_columns_backup_v4.json").read_text())
    
    win_v5_model = joblib.load(ROOT / "models/production/win_probability_model.pkl")
    win_v5_features = json.loads((ROOT / "models/production/feature_columns.json").read_text())
    
    def get_win_prob(win_model, feature_cols):
        row = [feats_home.get(c, float("nan")) for c in feature_cols]
        X = pd.DataFrame([row], columns=feature_cols)
        probs = win_model.predict_proba(X)[0]
        return float(probs[1]), float(probs[0]) # home (ATL) prob, away (CHI) prob
        
    h_v4_prob, a_v4_prob = get_win_prob(win_v4_model, win_v4_features)
    h_v5_prob, a_v5_prob = get_win_prob(win_v5_model, win_v5_features)
    
    print("\n--- RESULTS COMPARISON ---")
    print(f"Actual Result: CHI 152, ATL 150 (Away team CHI won, Total Points: 302, Margin: CHI +2)\n")
    
    print("1. Score Predictions:")
    print("V4 Score Model:")
    print(f"  Predicted Pace: {s_v4['pace']:.2f}")
    print(f"  Predicted ATL (Home) Off_Rtg: {s_v4['home_rtg']:.2f}")
    print(f"  Predicted CHI (Away) Off_Rtg: {s_v4['away_rtg']:.2f}")
    print(f"  Predicted Margin: {s_v4['margin']:.2f} (positive means ATL wins)")
    print(f"  Reconciled Scores: ATL {s_v4['home_score']:.1f} - CHI {s_v4['away_score']:.1f} (Total: {s_v4['total']:.1f})")
    
    print("\nV5 Score Model:")
    print(f"  Predicted Pace: {s_v5['pace']:.2f}")
    print(f"  Predicted ATL (Home) Off_Rtg: {s_v5['home_rtg']:.2f}")
    print(f"  Predicted CHI (Away) Off_Rtg: {s_v5['away_rtg']:.2f}")
    print(f"  Predicted Margin: {s_v5['margin']:.2f} (positive means ATL wins)")
    print(f"  Reconciled Scores: ATL {s_v5['home_score']:.1f} - CHI {s_v5['away_score']:.1f} (Total: {s_v5['total']:.1f})")
    
    print("\n2. Win Probability Predictions:")
    print("V4 Win Model:")
    print(f"  ATL (Home) Win Prob: {h_v4_prob:.4f}")
    print(f"  CHI (Away) Win Prob: {a_v4_prob:.4f}")
    print(f"  Predicted Winner: {home_team if h_v4_prob >= 0.5 else away_team}")
    
    print("\nV5 Win Model:")
    print(f"  ATL (Home) Win Prob: {h_v5_prob:.4f}")
    print(f"  CHI (Away) Win Prob: {a_v5_prob:.4f}")
    print(f"  Predicted Winner: {home_team if h_v5_prob >= 0.5 else away_team}")

if __name__ == "__main__":
    run_compare()
