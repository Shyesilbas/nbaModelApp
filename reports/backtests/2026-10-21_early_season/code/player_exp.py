import warnings; warnings.filterwarnings('ignore')
import joblib, numpy as np, pandas as pd
from src.features.player_form import add_player_matchup_features
from src.core.season_utils import date_to_season
H = 'models/experimental/holdout_eval/'
feats = joblib.load(H + 'player_features.pkl')
models = {t: joblib.load(H + f'player_model_{t.lower()}.pkl') for t in ['PTS','REB','AST']}
df = pd.read_csv('data/training/player_model_ready.csv', dtype={'GAME_ID': str})
df['GAME_DATE'] = pd.to_datetime(df.GAME_DATE)
df['SEASON'] = df.GAME_DATE.map(date_to_season)
df = df.sort_values(['PLAYER_ID','GAME_DATE'])
df['N'] = df.groupby(['PLAYER_ID','SEASON']).cumcount()
prev_team = df.groupby('PLAYER_ID').TEAM_ABBREVIATION.shift(1)
first = df.N == 0
df['MOVED'] = np.where(first, (prev_team != df.TEAM_ABBREVIATION) & prev_team.notna(), np.nan)
df['MOVED'] = df.groupby(['PLAYER_ID','SEASON']).MOVED.transform('first')
reg = df[df.SEASON_TYPE == 'Regular Season']
pm = reg.groupby(['PLAYER_ID','SEASON'])[['GAME_PTS','GAME_REB','GAME_AST','GAME_MIN']].mean().reset_index()
order = sorted(df.SEASON.unique()); nxt = dict(zip(order[:-1], order[1:]))
pm['SEASON'] = pm.SEASON.map(nxt); pm = pm.dropna(subset=['SEASON'])
pm = pm.rename(columns={c: c.replace('GAME_', 'PRIOR_') for c in pm.columns if c.startswith('GAME_')})
te = df[(df.SEASON == '2025-26')].merge(pm, on=['PLAYER_ID','SEASON'], how='left')
X = add_player_matchup_features(te).reindex(columns=feats)
for t in ['PTS','REB','AST']:
    te['P_'+t] = models[t].predict(X)
te['BUCKET'] = pd.cut(te.N, [-1,0,2,5,9,19,200], labels=['0','1-2','3-5','6-9','10-19','20+'])
rows = []
for t in ['PTS','REB','AST']:
    y = te['TARGET_'+t]
    out = {'model': te['P_'+t], 'ema10': te[t+'_EMA_10']}
    n = te.N.values.astype(float)
    for wmax in [0.4, 0.6]:
        for L in [2, 3, 6]:
            wt = np.where(n < L, wmax * (1 - n / L), 0.0)
            pr = te['PRIOR_'+t].fillna(te['P_'+t])
            out[f'blend_{wmax}_over{L}'] = (1 - wt) * te['P_'+t] + wt * pr
    for name, p in out.items():
        e = (y - p).abs()
        r = e.groupby(te.BUCKET).mean().to_dict(); r['ALL'] = e.mean(); r['stat'] = t; r['variant'] = name
        rows.append(r)
print(pd.DataFrame(rows).set_index(['stat','variant']).round(3).to_string())
print(te.groupby('BUCKET').size().to_dict())
m0 = te[te.N == 0]
print('first game, moved team vs stayed (PTS MAE model):', (m0.TARGET_PTS - m0.P_PTS).abs().groupby(m0.MOVED).agg(['mean','size']).round(2).to_dict())
