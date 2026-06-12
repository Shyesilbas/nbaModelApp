import sys
import json
import hashlib
from pathlib import Path
from fastapi.testclient import TestClient
import joblib
import pandas as pd

ROOT = Path("/Users/serhat/agProjects/nbaModelApp")
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "ml-service"))

from app.main import app
from app.model_loader import ModelLoader

def hash_file(path):
    if not Path(path).exists():
        return "FILE_NOT_FOUND"
    h = hashlib.sha256()
    with open(path, "rb") as f:
        h.update(f.read())
    return h.hexdigest()

def main():
    print("--- ML SERVICE STARTUP CODE ---")
    loader = ModelLoader()
    try:
        loader.load()
        print("Loader initialized successfully.")
    except Exception as e:
        print(f"Error loading: {e}")
    
    print("\n--- RUNTIME LOADED PATHS ---")
    from scripts.artifact_paths import resolve_artifact_path
    model_path = resolve_artifact_path("win_model", "model_path", "models/win_probability_model.pkl")
    features_path = resolve_artifact_path("win_model", "feature_columns_path", "models/feature_columns.json")
    metadata_path = resolve_artifact_path("win_model", "metadata_path", "models/model_metadata.json")
    
    print(f"Model path: {model_path}")
    print(f"Features path: {features_path}")
    print(f"Metadata path: {metadata_path}")
    
    print("\n--- LOADED MODEL CLASS ---")
    print(type(loader.model))
    
    print("\n--- HASHES ---")
    prod_hash = hash_file(model_path)
    print(f"Production Model Hash ({model_path.name}): {prod_hash}")
    
    exp_path = ROOT / "models/experimental/cross_season_win_logistic_regression.pkl"
    if not exp_path.exists():
        exp_path = ROOT / "models/logistic_regression.pkl"
    exp_hash = hash_file(exp_path)
    print(f"Experimental Model Hash ({exp_path.name}): {exp_hash}")
    
    old_prod_path = ROOT / "models/production/archive/win_probability_model_2026-06-10T13-21-30Z.pkl"
    old_prod_hash = hash_file(old_prod_path)
    print(f"Archived Old Prod Hash: {old_prod_hash}")
    
    print("\n--- API VERIFICATION ---")
    client = TestClient(app)
    try:
        response = client.get("/model-status")
        print("Status code:", response.status_code)
        print("Response:", response.json())
    except Exception as e:
        print("API error:", e)
        
    print("\n--- LIVE PREDICTION TEST ---")
    if loader.feature_cols:
        test_df = pd.DataFrame([[0]*len(loader.feature_cols)], columns=loader.feature_cols)
        try:
            prod_probs = loader.predict_proba(test_df)
            print("Production Probs:", prod_probs)
        except Exception as e:
            print("Production prediction error:", e)
        
        if exp_path.exists():
            try:
                exp_model = joblib.load(exp_path)
                exp_probs = exp_model.predict_proba(test_df)
                print("Experimental Probs:", exp_probs)
            except Exception as e:
                print("Experimental prediction error:", e)
        else:
            print("Experimental model not found for prediction test.")

if __name__ == "__main__":
    main()
