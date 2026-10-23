"""PLAYER: permanent prior floor, and prior reliability for players who missed most of last season."""
import warnings; warnings.filterwarnings('ignore')
import joblib, numpy as np, pandas as pd
from src.features.player_form import add_player_matchup_features
from src.core.season_utils import date_to_season
H = 'models/experimental/holdout_eval/'
feats = joblib.load(H + 'player_features.pkl')
models = {t: joblib.load(H + f'player_model_{t.lower()}.pkl') for t in ['PTS', 'REB', 'AST']}
df = pd.read_csv('data/training/player_model_ready.csv', dtype={'GAME_ID': str})
df['GAME_DATE'] = pd.to_datetime(df.GAME_DATE)
df['SEASON'] = df.GAME_DATE.map(date_to_season)
df = df.sort_values(['PLAYER_ID', 'GAME_DATE'])
df['N'] = df.groupby(['PLAYER_ID', 'SEASON']).cumcount()
reg = df[df.SEASON_TYPE == 'Regular Season']
pm = reg.groupby(['PLAYER_ID', 'SEASON']).agg(GAME_PTS=('GAME_PTS', 'mean'), GAME_REB=('GAME_REB', 'mean'), GAME_AST=('GAME_AST', 'mean'), G=('GAME_PTS', 'size')).reset_index()
order = sorted(df.SEASON.unique()); nxt = dict(zip(order[:-1], order[1:]))
pm['SEASON'] = pm.SEASON.map(nxt); pm = pm.dropna(subset=['SEASON'])
pm = pm.rename(columns={'GAME_PTS': 'PRIOR_PTS', 'GAME_REB': 'PRIOR_REB', 'GAME_AST': 'PRIOR_AST', 'G': 'PRIOR_G'})
te = df[df.SEASON == '2025-26'].merge(pm, on=['PLAYER_ID', 'SEASON'], how='left')
# second-previous season games, to flag a player who lost most of last season
pm2 = pm.copy(); pm2['SEASON'] = pm2.SEASON.map(nxt); pm2 = pm2.dropna(subset=['SEASON'])[['PLAYER_ID', 'SEASON', 'PRIOR_G']].rename(columns={'PRIOR_G': 'PRIOR2_G'})
te = te.merge(pm2, on=['PLAYER_ID', 'SEASON'], how='left')
X = add_player_matchup_features(te).reindex(columns=feats)
te['BUCKET'] = pd.cut(te.N, [-1, 0, 2, 5, 9, 19, 200], labels=['0', '1-2', '3-5', '6-9', '10-19', '20+'])
n = te.N.values.astype(float)

def weight(wmax, L, floor, rel):
    w = np.where(n < L, wmax * (1 - n / L), 0.0)
    w = np.maximum(w, floor)
    if rel:
        w = w * np.clip(te.PRIOR_G.fillna(0).values / 40.0, 0, 1)
    return w

variants = {'model': (0.0, 3, 0.0, False), 'shipped_0.4_L3': (0.4, 3, 0.0, False),
            'floor_0.05': (0.4, 3, 0.05, False), 'floor_0.10': (0.4, 3, 0.10, False),
            'shipped+reliab40': (0.4, 3, 0.0, True), 'floor_0.05+reliab40': (0.4, 3, 0.05, True)}
returners = (te.PRIOR_G.fillna(0) < 40) & (te.PRIOR_G.fillna(0) > 0)
missed_year = te.PRIOR_G.isna() & (te.PRIOR2_G.fillna(0) >= 40)
print('players-games: returners(prior<40 games) %d, missed whole last season %d, all %d' % (returners.sum(), missed_year.sum(), len(te)))
rows = []
for t in ['PTS', 'REB', 'AST']:
    y = te['TARGET_' + t]; pmod = models[t].predict(X)
    pr = te['PRIOR_' + t]
    for name, (wm, L, fl, rel) in variants.items():
        w = weight(wm, L, fl, rel)
        w = np.where(pr.isna(), 0.0, w)
        p = (1 - w) * pmod + w * pr.fillna(0)
        e = (y - p).abs()
        r = e.groupby(te.BUCKET).mean().to_dict()
        r.update({'ALL': e.mean(), 'RETURNERS': e[returners].mean(), 'RET_N<3': e[returners & (te.N < 3)].mean(),
                  'ALL_N<3': e[te.N < 3].mean(), 'stat': t, 'variant': name})
        rows.append(r)
print(pd.DataFrame(rows).set_index(['stat', 'variant']).round(3).to_string())
print(te.groupby('BUCKET').size().to_dict(), 'returners N<3:', int((returners & (te.N < 3)).sum()))

# Players who lost most of last season (long injury): first-5-game bias of the model, prior unused or unreliable
long_out = (te.PRIOR2_G.fillna(0) >= 50) & (te.PRIOR_G.fillna(0) < 25)
sel = long_out & (te.N < 5)
print('\nlong-injury returners, first 5 games: rows %d, players %d' % (sel.sum(), te[sel].PLAYER_ID.nunique()))
for t in ['PTS', 'REB', 'AST']:
    pmod = models[t].predict(X); y = te['TARGET_' + t]
    pr = te['PRIOR_' + t]
    bias = (pmod - y)[sel].mean(); mae = (pmod - y).abs()[sel].mean()
    base_mae = (pmod - y).abs()[(te.N < 5) & ~sel].mean()
    w = np.where(pr.isna() | (te.PRIOR_G.fillna(0) < 25), 0, 0.4 * (1 - n / 3).clip(0))
    mk = (1 - w) * pmod + w * pr.fillna(0)
    print(t, 'bias(pred-actual) %.2f  MAE %.2f  (other N<5 players MAE %.2f)  MAE with shipped blend %.2f' % (bias, mae, base_mae, (mk - y).abs()[sel].mean()))
