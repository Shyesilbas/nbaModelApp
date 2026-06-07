#!/usr/bin/env python3
"""
Run feature pruning ablation experiments.
Reads reports/feature_pruning_candidates.csv and reports/feature_correlation_clusters.csv
Produces:
- reports/feature_pruning_ablation_results.csv
- reports/feature_pruning_ablation_report.md

This is a prototype runner using chronological train/test split and sklearn models.
Run: python scripts/run_feature_pruning_ablation.py
"""
import os
import pandas as pd
import numpy as np
import glob
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor, GradientBoostingClassifier, GradientBoostingRegressor
from sklearn.metrics import roc_auc_score, brier_score_loss, accuracy_score, precision_score, recall_score, f1_score
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DATA_DIR = os.path.join(ROOT, 'data', 'processed')
REPORT_DIR = os.path.join(ROOT, 'reports')

candidates_path = os.path.join(REPORT_DIR, 'feature_pruning_candidates.csv')
clusters_path = os.path.join(REPORT_DIR, 'feature_correlation_clusters.csv')

if not os.path.exists(candidates_path):
    raise SystemExit('Run audit_feature_pruning_candidates.py first to produce candidates.')

cand = pd.read_csv(candidates_path)
clusters = pd.read_csv(clusters_path) if os.path.exists(clusters_path) else pd.DataFrame()

# Load model-ready win and score tables dynamically
import sys
sys.path.insert(0, ROOT)
from scripts.data_paths import get_data_paths
import argparse

parser = argparse.ArgumentParser()
parser.add_argument("--season", help="Season string (e.g. 2025-26)")
args, unknown = parser.parse_known_args()

paths = get_data_paths(args.season)
win_path = paths.win_model_dataset
score_path = paths.score_model_dataset

if not os.path.exists(win_path) or not os.path.exists(score_path):
    # fallback to v3 candidate if v2 dataset does not exist
    v3_candidate = os.path.join(DATA_DIR, 'team_model_ready_v3_2025_26.csv')
    if not os.path.exists(win_path) and os.path.exists(v3_candidate):
        win_path = v3_candidate
    else:
        raise SystemExit('Could not find both win and score datasets; aborting ablation runner.')

win_df = pd.read_csv(win_path, parse_dates=['GAME_DATE'])
score_df = pd.read_csv(score_path, parse_dates=['GAME_DATE'])

# Helper: get numeric features excluding ids/targets
exclude_cols = set(['GAME_ID','GAME_DATE','TEAM_ID','TEAM_ABBREVIATION','TEAM_NAME','MATCHUP','OPPONENT_ABBREVIATION','WIN','POINTS','PTS','SCORE'])

def numeric_feature_list(df):
    return [c for c in df.select_dtypes(include=[np.number]).columns if c not in exclude_cols]

win_features = numeric_feature_list(win_df)
score_features = numeric_feature_list(score_df)

# Build pruning groups: use clusters (pearson>=0.95) to group features; else singletons from top candidates
strong_pairs = clusters[clusters['pearson'].abs() >= 0.95] if not clusters.empty else pd.DataFrame()

# Build sets from strong_pairs
from collections import defaultdict
adj = defaultdict(set)
for _, r in strong_pairs.iterrows():
    a = r['feature_a']
    b = r['feature_b']
    adj[a].add(b)
    adj[b].add(a)

visited = set()
groups = []
for node in list(adj.keys()):
    if node in visited:
        continue
    stack = [node]
    comp = set()
    while stack:
        n = stack.pop()
        if n in comp:
            continue
        comp.add(n)
        visited.add(n)
        for nb in adj.get(n, []):
            if nb not in comp:
                stack.append(nb)
    groups.append(sorted(list(comp)))

# Also add top N low-importance singletons as groups
low_imp = cand.sort_values(['dataset','perm_mean_importance']).groupby('dataset').head(30)
for _, r in low_imp.iterrows():
    groups.append([r['feature']])

# dedupe and keep only features that exist in either dataset
all_win_feats = set(win_features)
all_score_feats = set(score_features)

filtered_groups = []
for g in groups:
    gw = [f for f in g if f in all_win_feats]
    gs = [f for f in g if f in all_score_feats]
    if gw:
        filtered_groups.append(('win', sorted(set(gw))))
    if gs:
        filtered_groups.append(('score', sorted(set(gs))))

# Unique by (dataset,tuple)
seen = set()
unique_groups = []
for ds, g in filtered_groups:
    key = (ds, tuple(sorted(g)))
    if key in seen:
        continue
    seen.add(key)
    unique_groups.append((ds, g))

# Chronological split helper: train on first 70%, test on last 30%
def chrono_split(df, date_col='GAME_DATE', train_frac=0.7):
    df = df.sort_values(date_col)
    n = len(df)
    cut = int(n * train_frac)
    train = df.iloc[:cut]
    test = df.iloc[cut:]
    return train, test

results = []

print('Running ablation experiments on', len(unique_groups), 'groups (may include duplicates across datasets).')

for dataset, feats in unique_groups:
    try:
        if dataset == 'win':
            df = win_df.copy()
            target = 'WIN'
            features = [f for f in win_features if f not in feats]
        else:
            df = score_df.copy()
            # choose a numeric target: try PTS or POINTS or SCORE
            target = None
            for t in ['PTS','POINTS','SCORE']:
                if t in df.columns:
                    target = t
                    break
            if target is None:
                # try approximate: no target -> skip
                continue
            features = [f for f in score_features if f not in feats]

        if not features:
            continue

        train, test = chrono_split(df)
        X_train = train[features].fillna(0)
        X_test = test[features].fillna(0)

        if dataset == 'win':
            y_train = train[target]
            y_test = test[target]
            # Baseline models: Logistic, RF, GBoost
            # Train baseline on full features first to get baseline metrics
            models = {
                'logistic': LogisticRegression(max_iter=200, solver='liblinear'),
                'rf': RandomForestClassifier(n_estimators=100, n_jobs=-1, random_state=1),
                'gboost': GradientBoostingClassifier(n_estimators=100, random_state=1)
            }
            for name, model in models.items():
                model.fit(X_train, y_train)
                probs = model.predict_proba(X_test)[:,1]
                preds = (probs >= 0.5).astype(int)
                auc = roc_auc_score(y_test, probs)
                brier = brier_score_loss(y_test, probs)
                acc = accuracy_score(y_test, preds)
                prec = precision_score(y_test, preds, zero_division=0)
                rec = recall_score(y_test, preds, zero_division=0)
                f1 = f1_score(y_test, preds, zero_division=0)
                results.append({
                    'dataset': 'win', 'group_removed': ';'.join(feats), 'model': name,
                    'roc_auc': auc, 'brier': brier, 'accuracy': acc, 'precision': prec, 'recall': rec, 'f1': f1,
                    'n_features_removed': len(feats), 'n_features_remaining': len(features)
                })
        else:
            y_train = train[target]
            y_test = test[target]
            models = {
                'ridge': Ridge(),
                'rf': RandomForestRegressor(n_estimators=100, n_jobs=-1, random_state=1),
                'gboost': GradientBoostingRegressor(n_estimators=100, random_state=1)
            }
            for name, model in models.items():
                model.fit(X_train, y_train)
                preds = model.predict(X_test)
                mae = mean_absolute_error(y_test, preds)
                rmse = mean_squared_error(y_test, preds, squared=False)
                r2 = r2_score(y_test, preds)
                results.append({
                    'dataset': 'score', 'group_removed': ';'.join(feats), 'model': name,
                    'mae': mae, 'rmse': rmse, 'r2': r2,
                    'n_features_removed': len(feats), 'n_features_remaining': len(features)
                })
    except Exception as e:
        print('Error on group', dataset, feats, e)

res_df = pd.DataFrame(results)
res_path = os.path.join(REPORT_DIR, 'feature_pruning_ablation_results.csv')
res_df.to_csv(res_path, index=False)

# Summary report
report_path = os.path.join(REPORT_DIR, 'feature_pruning_ablation_report.md')
with open(report_path, 'w') as f:
    f.write('# Feature Pruning Ablation Report\n\n')
    if res_df.empty:
        f.write('No ablation results produced.\n')
    else:
        f.write('Top results by dataset:\n\n')
        for ds in ['win','score']:
            sub = res_df[res_df['dataset']==ds]
            if sub.empty:
                continue
            f.write(f'## {ds.upper()}\n\n')
            if ds == 'win':
                # rank by roc_auc desc
                f.write(sub.sort_values('roc_auc', ascending=False).head(10).to_markdown(index=False))
            else:
                f.write(sub.sort_values('mae', ascending=True).head(10).to_markdown(index=False))
            f.write('\n\n')
print('Wrote', res_path, report_path)
