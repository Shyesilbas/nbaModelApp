import warnings; warnings.filterwarnings('ignore')
import numpy as np, pandas as pd
from sklearn.pipeline import make_pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import Ridge
SP='data/experimental/early_season/'
tf = pd.read_parquet(SP+'team_rows.parquet')
h = tf[tf.IS_HOME == 1].set_index('GAME_ID'); a = tf[tf.IS_HOME == 0].set_index('GAME_ID')
g = h.join(a, rsuffix='_A', how='inner').reset_index()
g['PACE_T'] = (g.POSS + g.POSS_A) / 2
g['HRTG_T'] = g.PTS / g.PACE_T * 100; g['ARTG_T'] = g.PTS_A / g.PACE_T * 100
g['TOTAL'] = g.PTS + g.PTS_A; g['MARGIN'] = g.PTS - g.PTS_A
g['NMIN'] = np.minimum(g.N, g.N_A)
g['BUCKET'] = pd.cut(g.NMIN, [-1,0,2,5,9,19,200], labels=['0','1-2','3-5','6-9','10-19','20+'])
TEST = ['2021-22','2022-23','2023-24','2024-25','2025-26']

def rp(): return make_pipeline(SimpleImputer(), StandardScaler(), Ridge(alpha=1.0))

def cols(sfx):
    return (['PACE'+sfx,'PACE'+sfx+'_A'], ['OFF_RTG'+sfx,'DEF_RTG'+sfx+'_A'], ['OFF_RTG'+sfx+'_A','DEF_RTG'+sfx])

def fit_predict(tr, te, sfx, Xte=None):
    pc, hc, ac = cols(sfx)
    X = Xte if Xte is not None else te
    mp = rp().fit(tr[pc].values, tr.PACE_T); mh = rp().fit(tr[hc].values, tr.HRTG_T); ma = rp().fit(tr[ac].values, tr.ARTG_T)
    pace = mp.predict(X[pc].values)
    return pace * (mh.predict(X[hc].values) + ma.predict(X[ac].values)) / 100

def blended(te, sfx, r, k0, mode, lg):
    X = te.copy()
    for side in ['', '_A']:
        n = te['N'+side].values.astype(float)
        for st in ['PACE','OFF_RTG','DEF_RTG']:
            form = te[st+sfx+side].values
            pr = te[st+'_PRIOR'+side].values
            pr = lg[st] + r * (pr - lg[st])
            pr = np.where(np.isnan(pr), lg[st], pr)
            if mode == 'shrink':
                w = n / (n + k0)
            else:
                w = np.minimum(n / k0, 1.0)
            x = np.where(np.isnan(form), pr, w * np.nan_to_num(form) + (1 - w) * pr)
            X[st+sfx+side] = x
    return X

res = []
for s in TEST:
    tr = g[(g.SEASON < s) & (g.NMIN >= 3)]
    te = g[g.SEASON == s].copy()
    lg = {st: tr[st+'_L10'].mean() for st in ['PACE','OFF_RTG','DEF_RTG']}
    te['P_CONST'] = tr.TOTAL.mean()
    for w in ['_L3','_L4','_L5','_L10','_L15','_STD','_EW5','_EW10','_EW20']:
        te['P'+w] = fit_predict(tr, te, w)
    for r in [0.5, 0.75, 1.0]:
        for k0 in [3, 6, 10]:
            te[f'P_SHR_r{r}_k{k0}'] = fit_predict(tr, te, '_L10', blended(te, '_L10', r, k0, 'shrink', lg))
        te[f'P_LIN6_r{r}'] = fit_predict(tr, te, '_L10', blended(te, '_L10', r, 6, 'lin', lg))
    res.append(te)
R = pd.concat(res)
pcols = [c for c in R.columns if c.startswith('P_') and c != 'P_CONST'] + ['P_CONST']
pcols = ['P_CONST'] + [c for c in R.columns if c.startswith('P_') and c not in ('P_CONST',) and not c.startswith('P_SHR') and not c.startswith('P_LIN')] + [c for c in R.columns if c.startswith('P_SHR') or c.startswith('P_LIN')]
pcols = [c for c in pcols if c not in ('PACE_T','PACE_PRIOR')]
tab = R.groupby('BUCKET').apply(lambda d: pd.Series({c: (d.TOTAL - d[c]).abs().mean() for c in pcols} | {'n': len(d)})).T
tab['ALL'] = [ (R.TOTAL - R[c]).abs().mean() for c in pcols] + [len(R)]
pd.set_option('display.width', 250)
print(tab.round(2).to_string())
R.to_parquet(SP+'score_exp_preds.parquet')
