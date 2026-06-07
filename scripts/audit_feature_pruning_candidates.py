#!/usr/bin/env python3
"""
Audit feature pruning candidates.
Generates:
- reports/feature_pruning_candidates.csv
- reports/feature_correlation_clusters.csv
- reports/feature_pruning_summary.md
Also builds EMA experimental datasets:
- data/processed/team_win_model_ready_v3_ema_experimental.csv
- data/processed/team_score_model_ready_v3_ema_experimental.csv

Run: python scripts/audit_feature_pruning_candidates.py
"""
import os
import glob
import pandas as pd
import numpy as np
from scipy.stats import spearmanr

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DATA_DIR = os.path.join(ROOT, 'data', 'processed')
REPORT_DIR = os.path.join(ROOT, 'reports')
FEATURE_ANALYSIS_DIR = os.path.join(REPORT_DIR, 'feature_analysis')

os.makedirs(REPORT_DIR, exist_ok=True)

# Helper: pick dataset path with preference order
def pick_path(candidates):
    for p in candidates:
        if os.path.exists(p):
            return p
    return None

win_candidates = [
    os.path.join(DATA_DIR, 'team_win_model_ready_v2_player_features.csv'),
    os.path.join(DATA_DIR, 'team_model_ready_v3_2025_26.csv'),
    os.path.join(DATA_DIR, 'team_model_ready_v3_2025_26.parquet')
]
score_candidates = [
    os.path.join(DATA_DIR, 'team_score_model_ready_v2_player_features.csv'),
    os.path.join(DATA_DIR, 'team_score_model_ready_v2_player_features.parquet')
]

win_path = pick_path(win_candidates)
score_path = pick_path(score_candidates)

if win_path is None or score_path is None:
    print('Could not find both win and score processed datasets. Checked:', win_candidates, score_candidates)

# Load CSV/Parquet helper
def load_table(path):
    if path is None:
        return None
    if path.endswith('.parquet'):
        return pd.read_parquet(path)
    return pd.read_csv(path)

print('Loading datasets...')
win_df = load_table(win_path)
score_df = load_table(score_path)

# Select numeric feature columns (exclude identifiers)
ids = set(['GAME_ID','GAME_DATE','TEAM_ID','TEAM_ABBREVIATION','TEAM_NAME','MATCHUP','OPPONENT_ABBREVIATION'])

def numeric_features(df):
    num = df.select_dtypes(include=[np.number]).columns.tolist()
    # drop target column if present (WIN / SCORE)
    candidates = [c for c in num if c.upper() not in ids]
    return candidates

win_features = numeric_features(win_df) if win_df is not None else []
score_features = numeric_features(score_df) if score_df is not None else []

print(f'Win numeric features: {len(win_features)}; Score numeric features: {len(score_features)}')

# Function to compute duplicates, correlations, near-constant

def analyze_features(df, features, dataset_name):
    sub = df[features].copy()
    # drop columns that are all NaN
    sub = sub.loc[:, sub.notna().any(axis=0)]
    features = sub.columns.tolist()

    # exact duplicates
    dup_map = {}
    visited = set()
    for i, a in enumerate(features):
        if a in visited:
            continue
        for b in features[i+1:]:
            if b in visited:
                continue
            try:
                if sub[a].equals(sub[b]):
                    dup_map[b] = a
                    visited.add(b)
            except Exception:
                # fallback numeric close
                if np.allclose(sub[a].fillna(0).values, sub[b].fillna(0).values, equal_nan=True):
                    dup_map[b] = a
                    visited.add(b)

    # correlations
    corr_pearson = sub.corr(method='pearson')
    corr_spearman = sub.corr(method='spearman')

    # Gather pairwise flags
    pairs = []
    for i, a in enumerate(features):
        for b in features[i+1:]:
            p = corr_pearson.at[a, b]
            s = corr_spearman.at[a, b]
            pairs.append({'feature_a': a, 'feature_b': b, 'pearson': p, 'spearman': s})
    pairs_df = pd.DataFrame(pairs)

    # near-constant
    stats = []
    n = len(sub)
    for c in features:
        col = sub[c].fillna(0)
        std = float(col.std())
        nonzero_frac = float((col != 0).sum() / max(1, n))
        stats.append({'feature': c, 'std': std, 'nonzero_frac': nonzero_frac, 'duplicate_of': dup_map.get(c, '')})
    stats_df = pd.DataFrame(stats)

    # aggregate correlations per feature
    corr_long = pairs_df.copy()
    corr_long['abs_pearson'] = corr_long['pearson'].abs()
    corr_long['abs_spearman'] = corr_long['spearman'].abs()

    agg = []
    for c in features:
        row = {
            'feature': c,
            'max_abs_pearson': float(corr_long.loc[corr_long['feature_a'].eq(c) | corr_long['feature_b'].eq(c), 'abs_pearson'].max() if not corr_long.empty else 0.0),
            'max_abs_spearman': float(corr_long.loc[corr_long['feature_a'].eq(c) | corr_long['feature_b'].eq(c), 'abs_spearman'].max() if not corr_long.empty else 0.0),
            'num_high_corr_90': int(((corr_long.loc[corr_long['feature_a'].eq(c) | corr_long['feature_b'].eq(c), 'abs_pearson'] >= 0.90)).sum() if not corr_long.empty else 0),
            'num_strong_corr_95': int(((corr_long.loc[corr_long['feature_a'].eq(c) | corr_long['feature_b'].eq(c), 'abs_pearson'] >= 0.95)).sum() if not corr_long.empty else 0),
        }
        agg.append(row)
    agg_df = pd.DataFrame(agg)

    # permutation importance aggregation (if exists)
    perm_paths = glob.glob(os.path.join(FEATURE_ANALYSIS_DIR, '*permutation*csv')) + glob.glob(os.path.join(FEATURE_ANALYSIS_DIR, '*importance*csv'))
    perm_df = None
    if perm_paths:
        frames = []
        for p in perm_paths:
            try:
                f = pd.read_csv(p)
                if 'feature' in f.columns:
                    frames.append(f)
            except Exception:
                continue
        if frames:
            perm_df = pd.concat(frames, sort=False, ignore_index=True)
            # unify column names
            if 'importance' not in perm_df.columns:
                for col in ['mean_importance','perm_importance','value']:
                    if col in perm_df.columns:
                        perm_df = perm_df.rename(columns={col: 'importance'})
                        break
            perm_agg = perm_df.groupby('feature')['importance'].mean().reset_index().rename(columns={'importance': 'perm_mean_importance'})
        else:
            perm_agg = pd.DataFrame(columns=['feature','perm_mean_importance'])
    else:
        perm_agg = pd.DataFrame(columns=['feature','perm_mean_importance'])

    # combine
    combined = stats_df.merge(agg_df, on='feature', how='left').merge(perm_agg, on='feature', how='left')
    combined['dataset'] = dataset_name

    # ranking heuristic: prefer removal when near-constant, duplicated, strong corr count, low importance
    combined['dup_flag'] = combined['duplicate_of'] != ''
    # fill nan importance with large number so low importance (small) ranks higher to remove; but we want low importance to be candidate: set missing to median
    if 'perm_mean_importance' in combined.columns and combined['perm_mean_importance'].notna().any():
        median_imp = combined['perm_mean_importance'].median()
        combined['perm_mean_importance'] = combined['perm_mean_importance'].fillna(median_imp)
    else:
        combined['perm_mean_importance'] = np.nan

    # score: near-constant (std small -> higher), dup -> +1, num_strong_corr_95 -> +count, low perm importance -> higher contribution
    combined['score'] = 0.0
    combined['score'] += (1.0 - np.clip(combined['std'] / (combined['std'].quantile(0.95)+1e-9), 0, 1.0)) * 2.0
    combined['score'] += combined['dup_flag'].astype(int) * 2.0
    combined['score'] += combined['num_strong_corr_95'] * 1.5
    # lower importance -> higher rank: invert
    if combined['perm_mean_importance'].notna().any():
        combined['score'] += (combined['perm_mean_importance'].max() - combined['perm_mean_importance']) / (combined['perm_mean_importance'].max()+1e-9)

    combined = combined.sort_values('score', ascending=False)

    return combined, pairs_df

print('Analyzing win features...')
win_combined, win_pairs = analyze_features(win_df, win_features, 'win')
print('Analyzing score features...')
score_combined, score_pairs = analyze_features(score_df, score_features, 'score')

# Save candidates CSV (concatenate both)
candidates = pd.concat([win_combined, score_combined], sort=False, ignore_index=True)
candidates_path = os.path.join(REPORT_DIR, 'feature_pruning_candidates.csv')
candidates.to_csv(candidates_path, index=False)
print('Wrote', candidates_path)

# Save correlation clusters (pairs with |r|>=0.90)
all_pairs = pd.concat([
    win_pairs.assign(dataset='win'),
    score_pairs.assign(dataset='score')
], sort=False, ignore_index=True)

clusters = all_pairs[(all_pairs['pearson'].abs() >= 0.90) | (all_pairs['spearman'].abs() >= 0.90)].copy()
clusters_path = os.path.join(REPORT_DIR, 'feature_correlation_clusters.csv')
clusters.to_csv(clusters_path, index=False)
print('Wrote', clusters_path)

# Summary markdown
summary_path = os.path.join(REPORT_DIR, 'feature_pruning_summary.md')
with open(summary_path, 'w') as f:
    f.write('# Feature Pruning Candidate Summary\n\n')
    f.write('This report lists candidate features for pruning based on duplicates, high correlations (pearson/spearman), and near-constant statistics, combined with existing permutation importance reports.\n\n')
    f.write(f'- Win features analyzed: {len(win_features)}\n')
    f.write(f'- Score features analyzed: {len(score_features)}\n')
    f.write(f'- Candidate rows written to: {os.path.relpath(candidates_path, ROOT)}\n')
    f.write(f'- Correlated pairs (|r|>=0.90) written to: {os.path.relpath(clusters_path, ROOT)}\n')
    f.write('\nTop 20 removal candidates (heuristic score):\n\n')
    f.write(candidates.head(20).to_markdown(index=False))
print('Wrote', summary_path)

# --- EMA dataset builder ---
print('Building EMA experimental datasets...')

def build_team_time_series(game_results_path):
    if game_results_path.endswith('.parquet'):
        games = pd.read_parquet(game_results_path)
    else:
        games = pd.read_csv(game_results_path, parse_dates=['GAME_DATE'])
    # Normalize columns
    games['GAME_DATE'] = pd.to_datetime(games['GAME_DATE'])
    # create long format: one row per team per game
    home = games[['GAME_ID','GAME_DATE','HOME_TEAM_ABBREVIATION','HOME_SCORE','AWAY_TEAM_ABBREVIATION','AWAY_SCORE']].copy()
    home = home.rename(columns={'HOME_TEAM_ABBREVIATION':'TEAM','HOME_SCORE':'PTS','AWAY_TEAM_ABBREVIATION':'OPP','AWAY_SCORE':'OPP_PTS'})
    away = games[['GAME_ID','GAME_DATE','AWAY_TEAM_ABBREVIATION','AWAY_SCORE','HOME_TEAM_ABBREVIATION','HOME_SCORE']].copy()
    away = away.rename(columns={'AWAY_TEAM_ABBREVIATION':'TEAM','AWAY_SCORE':'PTS','HOME_TEAM_ABBREVIATION':'OPP','HOME_SCORE':'OPP_PTS'})
    long = pd.concat([home, away], ignore_index=True, sort=False)
    # win indicator
    long['WIN'] = (long['PTS'] > long['OPP_PTS']).astype(int)
    long = long.sort_values(['TEAM','GAME_DATE','GAME_ID']).reset_index(drop=True)
    return long

# pick game results file
game_results_candidates = [
    os.path.join(DATA_DIR, 'game_results_2025_26.parquet'),
    os.path.join(DATA_DIR, 'game_results_2025_26.csv')
]
game_results_path = pick_path(game_results_candidates)
if game_results_path is None:
    print('No game results found; skipping EMA dataset build')
else:
    long = build_team_time_series(game_results_path)
    spans = [3,5,10]
    ema_cols = []
    for span in spans:
        # EMA per team; we compute EMA on PTS, OPP_PTS, and WIN
        col_pts = f'PTS_EMA_{span}'
        col_opp = f'OPP_PTS_EMA_{span}'
        col_win = f'WINRATE_EMA_{span}'
        ema_cols.extend([col_pts, col_opp, col_win])
        ema_pts = long.groupby('TEAM', group_keys=False)['PTS'].apply(lambda s: s.shift(1).ewm(span=span, adjust=False).mean())
        long[col_pts] = ema_pts.reindex(long.index)
        ema_opp = long.groupby('TEAM', group_keys=False)['OPP_PTS'].apply(lambda s: s.shift(1).ewm(span=span, adjust=False).mean())
        long[col_opp] = ema_opp.reindex(long.index)
        ema_win = long.groupby('TEAM', group_keys=False)['WIN'].apply(lambda s: s.shift(1).ewm(span=span, adjust=False).mean())
        long[col_win] = ema_win.reindex(long.index)

    # Merge EMAs into model-ready datasets by TEAM and GAME_DATE => approximate by nearest previous game
    # For team datasets: join on TEAM_ABBREVIATION / GAME_DATE
    def merge_ema_to_model(model_df, out_path):
        if model_df is None:
            return
        md = model_df.copy()
        md['GAME_DATE'] = pd.to_datetime(md['GAME_DATE'])
        # Rename team col possibilities
        team_col = None
        for c in ['TEAM_ABBREVIATION','TEAM','TEAM_ABBR']:
            if c in md.columns:
                team_col = c
                break
        if team_col is None:
            print('No team column found in', out_path)
            return
        # left-join by exact date and team
        # first try exact match
        merged = md.merge(long[['TEAM','GAME_DATE'] + ema_cols], left_on=[team_col,'GAME_DATE'], right_on=['TEAM','GAME_DATE'], how='left')
        # For rows with NaN, try to backfill using last known EMA for that team before GAME_DATE
        na_idx = merged[ema_cols].isna().any(axis=1)
        if na_idx.any():
            # create helper: for each row, find latest long row with same TEAM and GAME_DATE < target
            # build a mapping per team of GAME_DATE->last ema
            long_sorted = long.sort_values(['TEAM','GAME_DATE'])
            # for efficiency, groupby team and apply asof
            key = merged[[team_col,'GAME_DATE']].rename(columns={team_col:'TEAM'})
            key = key.sort_values(['TEAM','GAME_DATE'])
            asof = pd.merge_asof(key, long_sorted[['TEAM','GAME_DATE'] + ema_cols].sort_values('GAME_DATE'), on='GAME_DATE', by='TEAM', direction='backward')
            # restore order
            asof = asof.sort_index()
            merged[ema_cols] = asof[ema_cols].values
        # write
        merged.to_csv(out_path, index=False)
        print('Wrote EMA experimental dataset:', out_path)

    win_out = os.path.join(DATA_DIR, 'team_win_model_ready_v3_ema_experimental.csv')
    score_out = os.path.join(DATA_DIR, 'team_score_model_ready_v3_ema_experimental.csv')
    merge_ema_to_model(win_df, win_out)
    merge_ema_to_model(score_df, score_out)

print('Done.')
