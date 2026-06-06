"""
Colab-compatible pipeline: expanded evaluation, calibration, CV, LightGBM benchmark,
leakage audit, permutation importance, and model persistence.

Produces outputs under:
- reports/plots/
- reports/cross_validation_results.csv
- reports/model_comparison.csv
- reports/feature_analysis/
- reports/leakage_audit.csv, reports/leakage_audit.txt
- reports/model_recommendation.txt
- models/*.pkl

Run from repo root:
python3 scripts/validate_benchmark_models.py
"""

import os
from pathlib import Path
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_validate
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, confusion_matrix, roc_curve, precision_recall_curve,
    brier_score_loss
)
from sklearn.calibration import calibration_curve
from sklearn.inspection import permutation_importance
import joblib

# LightGBM import will be attempted; if not available, script will prompt to install
try:
    import lightgbm as lgb
    LGB_AVAILABLE = True
except Exception:
    LGB_AVAILABLE = False

# Paths
DATA_PATH = "data/processed/team_model_ready_v2_2025_26.csv"
PLOTS_DIR = "reports/plots"
METRICS_DIR = "reports/metrics"
FEATURE_ANALYSIS_DIR = "reports/feature_analysis"
LEAKAGE_DIR = "reports"
MODEL_DIR = "models"

for d in [PLOTS_DIR, METRICS_DIR, FEATURE_ANALYSIS_DIR, MODEL_DIR, LEAKAGE_DIR]:
    os.makedirs(d, exist_ok=True)


def separate_metadata(df):
    meta_candidates = [
        "GAME_ID", "GAME_DATE", "MATCHUP", "TEAM_NAME", "TEAM_ABBREVIATION",
        "OPPONENT_ABBREVIATION", "TEAM_ID"
    ]
    meta = [c for c in df.columns if c in meta_candidates]
    object_cols = df.select_dtypes(include=[object]).columns.tolist()
    for c in object_cols:
        if c not in meta:
            meta.append(c)
    meta = list(dict.fromkeys(meta))
    features = [c for c in df.columns if c not in meta]
    return df[features].copy(), df[meta].copy()


def leakage_checks(df_features, target_col="WIN"):
    # Detect exact duplicates, constants, high correlations, missingness
    report_rows = []
    numeric = df_features.select_dtypes(include=[np.number]).copy()
    for col in df_features.columns:
        row = {"feature": col}
        ser = df_features[col]
        row["dtype"] = str(ser.dtype)
        row["n_missing"] = int(ser.isna().sum())
        row["missing_frac"] = float(ser.isna().mean())
        # constant?
        row["n_unique"] = int(ser.nunique(dropna=False))
        row["is_constant"] = ser.nunique(dropna=False) <= 1
        # exact duplicate of target?
        if col != target_col and col in numeric.columns and target_col in numeric.columns:
            row["corr_with_target"] = float(numeric[col].corr(numeric[target_col]))
            row["is_exact_dup_target"] = numeric[col].equals(numeric[target_col])
        else:
            row["corr_with_target"] = None
            row["is_exact_dup_target"] = False
        # Name-based heuristic whether feature appears pre-tipoff
        name = col.upper()
        safe_keywords = ["LAST", "WINRATE", "PTS", "DAYS_REST", "IS_B2B", "HOME", "AWAY", "H2H", "OPP", "ALLOWED"]
        if any(k in name for k in safe_keywords):
            row["heuristic_available_pre_tipoff"] = True
            row["heuristic_reason"] = "Based on past-game aggregates or opponent pre-game stats (contains keyword)"
        elif name in ["WIN"]:
            row["heuristic_available_pre_tipoff"] = False
            row["heuristic_reason"] = "Target column"
        elif ser.dtype == object:
            row["heuristic_available_pre_tipoff"] = False
            row["heuristic_reason"] = "String/object column treated as metadata"
        else:
            row["heuristic_available_pre_tipoff"] = False
            row["heuristic_reason"] = "Unknown origin: manual review required"
        report_rows.append(row)
    report_df = pd.DataFrame(report_rows)
    # Add an overall flag safe_if_no_high_corr
    def safe_flag(r):
        if r['is_constant']:
            return False, 'Constant feature'
        if r['is_exact_dup_target']:
            return False, 'Exact duplicate of target'
        if r['corr_with_target'] is not None and abs(r['corr_with_target']) > 0.99:
            return False, f'Near-perfect correlation with target: {r["corr_with_target"]:.3f}'
        if not r['heuristic_available_pre_tipoff']:
            return False, r['heuristic_reason']
        return True, 'Pass heuristics'

    flags = report_df.apply(lambda r: safe_flag(r), axis=1)
    report_df['is_safe'] = [f[0] for f in flags]
    report_df['safety_reason'] = [f[1] for f in flags]
    return report_df


def train_and_evaluate(df, target_col="WIN"):
    df_features, df_meta = separate_metadata(df)
    if target_col not in df_features.columns:
        raise ValueError("Target missing")

    # leakage audit
    leakage_df = leakage_checks(df_features, target_col=target_col)
    leakage_df.to_csv(os.path.join(LEAKAGE_DIR, 'leakage_audit.csv'), index=False)
    with open(os.path.join(LEAKAGE_DIR, 'leakage_audit.txt'), 'w') as f:
        f.write('Leakage audit summary\n')
        f.write(leakage_df[['feature','is_safe','safety_reason','corr_with_target','heuristic_reason']].to_string(index=False))

    # drop metadata if present in features
    X_full = df_features.drop(columns=[target_col])
    y_full = df_features[target_col].astype(int)

    # Chronological split
    if 'GAME_DATE' in df_meta.columns:
        df_meta['GAME_DATE'] = pd.to_datetime(df_meta['GAME_DATE'])
        split_date = df_meta['GAME_DATE'].quantile(0.8)
        train_idx = df_meta.index[df_meta['GAME_DATE'] <= split_date].tolist()
        test_idx = df_meta.index[df_meta['GAME_DATE'] > split_date].tolist()
        if len(train_idx)==0 or len(test_idx)==0:
            X_train, X_test, y_train, y_test = train_test_split(X_full, y_full, test_size=0.2, random_state=42, stratify=y_full)
        else:
            X_train = X_full.loc[train_idx]
            X_test = X_full.loc[test_idx]
            y_train = y_full.loc[train_idx]
            y_test = y_full.loc[test_idx]
    else:
        X_train, X_test, y_train, y_test = train_test_split(X_full, y_full, test_size=0.2, random_state=42, stratify=y_full)

    # Pipelines
    lr = Pipeline([('imputer', SimpleImputer(strategy='mean')), ('scaler', StandardScaler()), ('clf', LogisticRegression(max_iter=2000, random_state=42))])
    rf = Pipeline([('imputer', SimpleImputer(strategy='mean')), ('clf', RandomForestClassifier(n_estimators=300, random_state=42, n_jobs=-1))])
    if LGB_AVAILABLE:
        lgbm = Pipeline([('imputer', SimpleImputer(strategy='mean')), ('clf', lgb.LGBMClassifier(n_estimators=500, random_state=42))])
    else:
        lgbm = None

    models = {'logistic_regression': lr, 'random_forest': rf}
    if lgbm is not None:
        models['lightgbm'] = lgbm

    # Fit
    for name, model in models.items():
        print(f"Training {name}...")
        model.fit(X_train, y_train)

    # Evaluate on test set and produce plots
    comparison_rows = []
    for name, model in models.items():
        y_pred = model.predict(X_test)
        try:
            y_proba = model.predict_proba(X_test)[:,1]
        except Exception:
            # fallback
            y_proba = model.decision_function(X_test)
        acc = accuracy_score(y_test, y_pred)
        prec = precision_score(y_test, y_pred, zero_division=0)
        rec = recall_score(y_test, y_pred, zero_division=0)
        f1 = f1_score(y_test, y_pred, zero_division=0)
        roc = roc_auc_score(y_test, y_proba)
        brier = brier_score_loss(y_test, y_proba)
        cm = confusion_matrix(y_test, y_pred)

        comparison_rows.append({'model': name, 'accuracy': acc, 'precision': prec, 'recall': rec, 'f1': f1, 'roc_auc': roc, 'brier': brier})

        # ROC curve
        fpr, tpr, _ = roc_curve(y_test, y_proba)
        plt.figure(figsize=(6,4))
        plt.plot(fpr, tpr, label=f'{name} (AUC={roc:.3f})')
        plt.plot([0,1],[0,1],'k--', alpha=0.5)
        plt.xlabel('FPR')
        plt.ylabel('TPR')
        plt.title(f'ROC Curve - {name}')
        plt.legend()
        plt.grid(True)
        plt.savefig(os.path.join(PLOTS_DIR, f'roc_curve_{name}.png'), bbox_inches='tight')
        plt.close()

        # Precision-Recall
        precision, recall, _ = precision_recall_curve(y_test, y_proba)
        plt.figure(figsize=(6,4))
        plt.plot(recall, precision, label=name)
        plt.xlabel('Recall')
        plt.ylabel('Precision')
        plt.title(f'Precision-Recall Curve - {name}')
        plt.legend()
        plt.grid(True)
        plt.savefig(os.path.join(PLOTS_DIR, f'pr_curve_{name}.png'), bbox_inches='tight')
        plt.close()

        # Confusion matrix
        plt.figure(figsize=(4,4))
        sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', cbar=False)
        plt.title(f'Confusion Matrix - {name}')
        plt.xlabel('Predicted')
        plt.ylabel('Actual')
        plt.savefig(os.path.join(PLOTS_DIR, f'confusion_matrix_{name}.png'), bbox_inches='tight')
        plt.close()

        # Calibration curve
        prob_true, prob_pred = calibration_curve(y_test, y_proba, n_bins=10, strategy='quantile')
        plt.figure(figsize=(6,4))
        plt.plot(prob_pred, prob_true, marker='o', label=name)
        plt.plot([0,1],[0,1],'k--', alpha=0.5)
        plt.xlabel('Predicted probability')
        plt.ylabel('Observed frequency')
        plt.title(f'Calibration Curve - {name} (Brier={brier:.3f})')
        plt.legend()
        plt.grid(True)
        plt.savefig(os.path.join(PLOTS_DIR, f'calibration_curve_{name}.png'), bbox_inches='tight')
        plt.close()

    # Save model comparison
    comp_df = pd.DataFrame(comparison_rows).sort_values(by='roc_auc', ascending=False)
    comp_df.to_csv(os.path.join(LEAKAGE_DIR, 'model_comparison.csv'), index=False)

    # Cross-validation (stratified 5-fold) on full dataset
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    scoring = ['accuracy','precision','recall','f1','roc_auc']
    cv_rows = []
    for name, model in models.items():
        print(f"Cross-validating {name}...")
        res = cross_validate(model, X_full, y_full, cv=cv, scoring=scoring, return_train_score=False, n_jobs=-1)
        row = {'model': name}
        for metric in scoring:
            row[f'{metric}_mean'] = float(np.mean(res[f'test_{metric}']))
            row[f'{metric}_std'] = float(np.std(res[f'test_{metric}']))
        cv_rows.append(row)
    cv_df = pd.DataFrame(cv_rows)
    cv_df.to_csv(os.path.join(LEAKAGE_DIR, 'cross_validation_results.csv'), index=False)

    # Permutation importance on test set
    for name, model in models.items():
        print(f"Computing permutation importance for {name}...")
        # Use model's predict_proba for scoring
        r = permutation_importance(model, X_test, y_test, n_repeats=20, random_state=42, n_jobs=-1)
        perm_df = pd.DataFrame({'feature': X_test.columns, 'importance_mean': r.importances_mean, 'importance_std': r.importances_std})
        perm_df = perm_df.sort_values(by='importance_mean', ascending=False)
        perm_df.to_csv(os.path.join(FEATURE_ANALYSIS_DIR, f'permutation_importance_{name}.csv'), index=False)

        # Also save model-specific native importances
        if name == 'logistic_regression':
            coefs = model.named_steps['clf'].coef_.ravel()
            coef_df = pd.DataFrame({'feature': X_train.columns, 'coefficient': coefs})
            coef_df['coef_abs'] = coef_df['coefficient'].abs()
            coef_df = coef_df.sort_values(by='coef_abs', ascending=False)
            coef_df.to_csv(os.path.join(FEATURE_ANALYSIS_DIR, f'coefficients_{name}.csv'), index=False)
        else:
            try:
                importances = model.named_steps['clf'].feature_importances_
                imp_df = pd.DataFrame({'feature': X_train.columns, 'importance': importances})
                imp_df = imp_df.sort_values(by='importance', ascending=False)
                imp_df.to_csv(os.path.join(FEATURE_ANALYSIS_DIR, f'feature_importances_{name}.csv'), index=False)
            except Exception:
                pass

    # Combine feature analysis into a single table
    # Load files if exist
    coef_lr = pd.read_csv(os.path.join(FEATURE_ANALYSIS_DIR, 'coefficients_logistic_regression.csv')) if os.path.exists(os.path.join(FEATURE_ANALYSIS_DIR, 'coefficients_logistic_regression.csv')) else pd.DataFrame()
    imp_rf = pd.read_csv(os.path.join(FEATURE_ANALYSIS_DIR, 'feature_importances_random_forest.csv')) if os.path.exists(os.path.join(FEATURE_ANALYSIS_DIR, 'feature_importances_random_forest.csv')) else pd.DataFrame()
    perm_lr = pd.read_csv(os.path.join(FEATURE_ANALYSIS_DIR, 'permutation_importance_logistic_regression.csv')) if os.path.exists(os.path.join(FEATURE_ANALYSIS_DIR, 'permutation_importance_logistic_regression.csv')) else pd.DataFrame()
    perm_rf = pd.read_csv(os.path.join(FEATURE_ANALYSIS_DIR, 'permutation_importance_random_forest.csv')) if os.path.exists(os.path.join(FEATURE_ANALYSIS_DIR, 'permutation_importance_random_forest.csv')) else pd.DataFrame()
    perm_lgb = pd.read_csv(os.path.join(FEATURE_ANALYSIS_DIR, 'permutation_importance_lightgbm.csv')) if os.path.exists(os.path.join(FEATURE_ANALYSIS_DIR, 'permutation_importance_lightgbm.csv')) else pd.DataFrame()

    # Combine feature analysis into a single table (safe merge)
    def read_if_exists(p):
        return pd.read_csv(p) if os.path.exists(p) else None
    coef_lr = read_if_exists(os.path.join(FEATURE_ANALYSIS_DIR, 'coefficients_logistic_regression.csv'))
    imp_rf = read_if_exists(os.path.join(FEATURE_ANALYSIS_DIR, 'feature_importances_random_forest.csv'))
    perm_lr = read_if_exists(os.path.join(FEATURE_ANALYSIS_DIR, 'permutation_importance_logistic_regression.csv'))
    perm_rf = read_if_exists(os.path.join(FEATURE_ANALYSIS_DIR, 'permutation_importance_random_forest.csv'))
    perm_lgb = read_if_exists(os.path.join(FEATURE_ANALYSIS_DIR, 'permutation_importance_lightgbm.csv'))

    merge_df = pd.DataFrame({'feature': X_train.columns}).set_index('feature')
    if coef_lr is not None and 'feature' in coef_lr.columns:
        merge_df = merge_df.join(coef_lr.set_index('feature')['coefficient'])
    if imp_rf is not None and 'feature' in imp_rf.columns:
        merge_df = merge_df.join(imp_rf.set_index('feature')['importance'])
    if perm_lr is not None and 'feature' in perm_lr.columns:
        merge_df = merge_df.join(perm_lr.set_index('feature')['importance_mean'].rename('perm_lr'))
    if perm_rf is not None and 'feature' in perm_rf.columns:
        merge_df = merge_df.join(perm_rf.set_index('feature')['importance_mean'].rename('perm_rf'))
    if perm_lgb is not None and 'feature' in perm_lgb.columns:
        merge_df = merge_df.join(perm_lgb.set_index('feature')['importance_mean'].rename('perm_lgb'))
    merge_df.to_csv(os.path.join(FEATURE_ANALYSIS_DIR, 'feature_analysis_comparison.csv'))

    # Save models
    joblib.dump(models['logistic_regression'], os.path.join(MODEL_DIR, 'logistic_regression.pkl'))
    joblib.dump(models['random_forest'], os.path.join(MODEL_DIR, 'random_forest.pkl'))
    if 'lightgbm' in models:
        joblib.dump(models['lightgbm'], os.path.join(MODEL_DIR, 'lightgbm.pkl'))

    # Save metrics summary
    comp_df.to_csv(os.path.join(METRICS_DIR, 'model_comparison.csv'), index=False)

    # Final recommendation text
    best_model = comp_df.iloc[0]
    rec_lines = []
    rec_lines.append('Model recommendation report')
    rec_lines.append('---------------------------')
    rec_lines.append(f"Top model by ROC-AUC on test set: {best_model['model']} (ROC-AUC={best_model['roc_auc']:.3f})")
    rec_lines.append('Suggested deployment:')
    rec_lines.append('- If calibrated probabilities are required and Brier score is low, deploy the model with the best calibrated probabilities (check calibration plots).')
    rec_lines.append('- Otherwise prefer the model with highest ROC-AUC for ranking tasks; for decision thresholds use precision/recall tradeoffs.')
    rec_lines.append('\nCross-validation summary (means):')
    for _, row in cv_df.iterrows():
        rec_lines.append(f"{row['model']}: accuracy={row['accuracy_mean']:.3f} (+/-{row['accuracy_std']:.3f}), roc_auc={row['roc_auc_mean']:.3f} (+/-{row['roc_auc_std']:.3f})")
    rec_lines.append('\nDeployment readiness:')
    rec_lines.append('- Current readiness: Experimental/Alpha. More validation and monitoring required in production (calibration drift, new-season distribution shifts).')
    rec_lines.append('\nHigh-value additional features (without adding historical seasons):')
    rec_lines.append('- Pre-game injury reports / player availability')
    rec_lines.append('- Lineup-level minutes/usage projections for the upcoming game')
    rec_lines.append('- Bettor market features (odds, spreads) if allowed')

    with open(os.path.join(LEAKAGE_DIR, 'model_recommendation.txt'), 'w') as f:
        f.write('\n'.join(rec_lines))

    print('All outputs written under reports/ and models/.')
    return comp_df, cv_df, leakage_df


if __name__ == '__main__':
    print('Loading dataset', DATA_PATH)
    df = pd.read_csv(DATA_PATH)
    comp_df, cv_df, leakage_df = train_and_evaluate(df, target_col='WIN')
    print('Done')
