"""Player model window-length walk-forward: rebuild form features with window W, retrain, test on unseen seasons."""
import warnings; warnings.filterwarnings('ignore')
import numpy as np, pandas as pd, lightgbm as lgb
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from src.features.player_form import add_player_matchup_features
from src.core.season_utils import date_to_season

df = pd.read_csv('data/training/player_model_ready.csv')
df['GAME_DATE'] = pd.to_datetime(df.GAME_DATE)
df['SEASON'] = df.GAME_DATE.map(date_to_season)
df = add_player_matchup_features(df).sort_values(['PLAYER_ID', 'GAME_DATE'], kind='stable').reset_index(drop=True)
g = df.groupby('PLAYER_ID', sort=False)
raw = {'PTS': 'GAME_PTS', 'REB': 'GAME_REB', 'AST': 'GAME_AST', 'MIN': 'GAME_MIN', 'USG': 'GAME_USG_PCT'}
def sh(col, fn): return g[col].transform(lambda x: fn(x.shift(1)))
def build(w):
    F = pd.DataFrame(index=df.index)
    for s in ['PTS', 'REB', 'AST']:
        F[f'{s}_L'] = sh(raw[s], lambda x: x.rolling(w, min_periods=1).mean())
        F[f'{s}_EMA'] = sh(raw[s], lambda x: x.ewm(span=w, min_periods=1).mean())
        ss = sh(raw[s], lambda x: x.rolling(w, min_periods=1).sum()); ms = sh('GAME_MIN', lambda x: x.rolling(w, min_periods=1).sum())
        F[f'{s}_PER_MIN'] = np.where(ms > 0, ss / ms.where(ms > 0), np.nan)
    F['MIN_L'] = sh('GAME_MIN', lambda x: x.rolling(min(w, 3), min_periods=1).mean())
    F['MIN_EMA'] = sh('GAME_MIN', lambda x: x.ewm(span=w, min_periods=1).mean())
    F['MIN_TREND'] = sh('GAME_MIN', lambda x: x.ewm(span=max(2, w // 2), min_periods=1).mean()) - F['MIN_EMA']
    F['USG_EMA'] = sh('GAME_USG_PCT', lambda x: x.ewm(span=w, min_periods=1).mean())
    for c in ['IS_HOME', 'IS_PLAYOFF', 'DAYS_REST', 'IS_GUARD', 'IS_BIG', 'OPP_POS_PTS_ALLOWED_LAST_10', 'OPP_POS_REB_ALLOWED_LAST_10', 'OPP_POS_AST_ALLOWED_LAST_10']:
        F[c] = pd.to_numeric(df[c], errors='coerce')
    return F

def model(t):
    p = dict(n_estimators=150, learning_rate=0.05, max_depth=5, random_state=42, n_jobs=4, verbose=-1)
    if t == 'PTS': p['objective'] = 'l1'
    return Pipeline([('imp', SimpleImputer()), ('lgb', lgb.LGBMRegressor(**p))])

res = []
for w in [3, 5, 10, 20]:
    F = build(w)
    for test in ['2023-24', '2024-25', '2025-26']:
        tr = df.SEASON < test; te = df.SEASON == test
        for t in ['PTS', 'REB', 'AST']:
            y = df[f'TARGET_{t}']
            m = model(t).fit(F[tr], y[tr])
            res.append({'window': w, 'season': test, 'stat': t, 'mae': float(np.abs(y[te] - m.predict(F[te])).mean()), 'n': int(te.sum())})
    print('window', w, 'done', flush=True)
R = pd.DataFrame(res)
R.to_csv('data/experimental/player_audit/window_exp.csv', index=False)
print(R.pivot_table(index='window', columns='stat', values='mae').round(3))
print(R.pivot_table(index=['stat', 'window'], columns='season', values='mae').round(3))
