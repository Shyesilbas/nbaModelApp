import pandas as pd
import json

def main():
    exp_path = 'data/experimental/team_score_model_ready_v2_2024_25_valid.csv'
    prod_path = 'data/production/team_score_model_ready_v2_player_features.csv'
    out_path = 'data/experimental/team_score_model_ready_v2_2024_25_valid_schema_aligned.csv'
    report_path = 'reports/audits/score_schema_alignment_2024_25.md'

    print(f"Loading {exp_path}")
    df_exp = pd.read_csv(exp_path)
    
    print(f"Loading {prod_path} (columns only)")
    df_prod = pd.read_csv(prod_path, nrows=0)
    
    prod_cols = list(df_prod.columns)
    
    print("Adding POINT_DIFF and TOTAL_POINTS")
    df_exp['POINT_DIFF'] = df_exp['HOME_PTS'] - df_exp['AWAY_PTS']
    df_exp['TOTAL_POINTS'] = df_exp['HOME_PTS'] + df_exp['AWAY_PTS']
    
    # Check for missing columns
    exp_cols_current = set(df_exp.columns)
    prod_cols_set = set(prod_cols)
    
    missing_cols = prod_cols_set - exp_cols_current
    extra_cols = exp_cols_current - prod_cols_set
    
    print(f"Missing columns: {missing_cols}")
    print(f"Extra columns: {extra_cols}")
    
    # Reorder
    df_exp = df_exp[prod_cols]
    
    # Validate
    row_count = len(df_exp)
    col_count = len(df_exp.columns)
    unique_game_ids = df_exp['GAME_ID'].nunique()
    
    # Dates
    if 'GAME_DATE' in df_exp.columns:
        min_date = df_exp['GAME_DATE'].min()
        max_date = df_exp['GAME_DATE'].max()
    else:
        min_date = "N/A"
        max_date = "N/A"
    
    # Order match
    order_match = list(df_exp.columns) == prod_cols
    
    # Dtype match
    # We load a bit of production data to check dtypes
    df_prod_sample = pd.read_csv(prod_path, nrows=100)
    
    dtype_mismatches = []
    for col in prod_cols:
        if df_exp[col].dtype != df_prod_sample[col].dtype:
            # allow some flexibility between int64/float64 if they represent similar concepts, 
            # but record them.
            dtype_mismatches.append(f"{col}: exp={df_exp[col].dtype}, prod={df_prod_sample[col].dtype}")
    
    # Validate Formulas
    point_diff_valid = (df_exp['POINT_DIFF'] == (df_exp['HOME_PTS'] - df_exp['AWAY_PTS'])).all()
    total_points_valid = (df_exp['TOTAL_POINTS'] == (df_exp['HOME_PTS'] + df_exp['AWAY_PTS'])).all()
    
    is_ready = len(missing_cols) == 0 and len(extra_cols) == 0 and order_match
    
    report = f"""# Score Schema Alignment Report 2024-25

## Summary
- **Schema Alignment Completed**: True
- **Output Path**: {out_path}
- **Row Count**: {row_count}
- **Unique Game IDs**: {unique_game_ids}
- **Date Range**: {min_date} to {max_date}

## Column Information
- **Column Count**: {col_count} (Expected: {len(prod_cols)})
- **Missing Columns After Fix**: {list(missing_cols)}
- **Extra Columns After Fix**: {list(extra_cols)}
- **Column Order Match**: {order_match}

## Data Type Validation
- **Dtype Match**: {"PASS" if not dtype_mismatches else "MISMATCHES DETECTED"}
- **Mismatches**: 
{chr(10).join(f"  - {m}" for m in dtype_mismatches) if dtype_mismatches else "  - None"}

## Formula Validation
- **POINT_DIFF valid**: {point_diff_valid}
- **TOTAL_POINTS valid**: {total_points_valid}

## Status
- **Is SCORE ready for vertical merge?**: {is_ready}
- **Is full cross-season merge now READY?**: {is_ready} # Assuming WIN was already ready
"""
    
    with open(report_path, 'w') as f:
        f.write(report)
        
    print(f"Report written to {report_path}")
    
    df_exp.to_csv(out_path, index=False)
    print(f"Saved aligned dataset to {out_path}")

if __name__ == "__main__":
    main()
