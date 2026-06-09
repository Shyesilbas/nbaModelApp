import pandas as pd

win_exp_path = "data/experimental/team_win_model_ready_v2_2024_25_valid.csv"
win_prod_path = "data/production/team_win_model_ready_v2_player_features.csv"
score_exp_path = "data/experimental/team_score_model_ready_v2_2024_25_valid.csv"
score_prod_path = "data/production/team_score_model_ready_v2_player_features.csv"

def audit(exp_path, prod_path, name):
    print(f"=== {name} Dataset Audit ===")
    exp_df = pd.read_csv(exp_path, nrows=5000) # Read enough rows for better dtype inference
    prod_df = pd.read_csv(prod_path, nrows=5000)
    
    exp_cols = list(exp_df.columns)
    prod_cols = list(prod_df.columns)
    
    print(f"Exact column count (experimental): {len(exp_cols)}")
    print(f"Exact column count (production): {len(prod_cols)}")
    
    exp_set = set(exp_cols)
    prod_set = set(prod_cols)
    
    missing_in_exp = prod_set - exp_set
    missing_in_prod = exp_set - prod_set
    
    print(f"Missing columns in experimental: {list(missing_in_exp)}")
    print(f"Missing columns in production: {list(missing_in_prod)}")
    
    print(f"Are column names identical? {exp_set == prod_set}")
    print(f"Are column counts identical? {len(exp_cols) == len(prod_cols)}")
    
    print(f"\n=== {name} Dataset Column Order Audit ===")
    order_match = exp_cols == prod_cols
    print(f"Order MATCH: {'PASS' if order_match else 'FAIL'}")
    
    if not order_match:
        for i, (e, p) in enumerate(zip(exp_cols, prod_cols)):
            if e != p:
                print(f"First mismatch position: {i}")
                print(f"Experimental[{i}]: {e}")
                print(f"Production[{i}]: {p}")
                break
            
    print(f"\n=== {name} Dataset Dtype Audit ===")
    common_cols = exp_set.intersection(prod_set)
    mismatches = []
    
    for col in common_cols:
        ed = exp_df.dtypes[col]
        pd_dt = prod_df.dtypes[col]
        if ed != pd_dt:
            # Check if one is float64 and the other is int64, which is typical for pandas CSV read and safe to concat mostly
            mismatches.append((col, ed, pd_dt))
    
    if not mismatches:
        print("No dtype mismatches.")
    else:
        for m in mismatches:
            print(f"Mismatch: {m[0]} (Exp: {m[1]}, Prod: {m[2]})")
    print("\n")

audit(win_exp_path, win_prod_path, "WIN")
audit(score_exp_path, score_prod_path, "SCORE")
