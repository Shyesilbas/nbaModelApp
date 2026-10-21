import warnings; warnings.filterwarnings('ignore')
import numpy as np, pandas as pd
exec(open('reports/backtests/2026-10-21_early_season/code/score_exp.py').read().split('res = []')[0])
g['NET_DIFF'] = g.NET_RTG_L10 - g.NET_RTG_L10_A
g['NET_PRIOR_DIFF'] = g.NET_RTG_PRIOR - g.NET_RTG_PRIOR_A
g['REST_DIFF'] = g.DAYS_REST.clip(upper=4) - g.DAYS_REST_A.clip(upper=4)
res = []
for s in TEST:
    tr = g[(g.SEASON < s) & (g.NMIN >= 3)]
    te = g[g.SEASON == s].copy()
    F = ['ELO_DIFF', 'NET_DIFF', 'REST_DIFF', 'IS_B2B', 'IS_B2B_A']
    m = rp().fit(tr[F].values, tr.MARGIN)
    me = rp().fit(tr[['ELO_DIFF','REST_DIFF','IS_B2B','IS_B2B_A']].values, tr.MARGIN)
    te['M_MODEL'] = m.predict(te[F].values)
    te['M_ELO'] = me.predict(te[['ELO_DIFF','REST_DIFF','IS_B2B','IS_B2B_A']].values)
    n = te.NMIN.values.astype(float)
    for r in [0.5, 1.0]:
        X = te.copy()
        w = np.minimum(n / 6, 1)
        pr = r * te.NET_PRIOR_DIFF.fillna(0).values
        X['NET_DIFF'] = np.where(te.NET_DIFF.isna(), pr, w * te.NET_DIFF.fillna(0) + (1 - w) * pr)
        te[f'M_PRIORNET_r{r}'] = m.predict(X[F].values)
    for wmax in [0.4, 0.7, 1.0]:
        wt = np.where(n < 6, wmax * (1 - n / 6), 0.0)
        te[f'M_ELOBLEND_{wmax}'] = (1 - wt) * te.M_MODEL + wt * te.M_ELO
    res.append(te)
R = pd.concat(res)
pc = [c for c in R.columns if c.startswith('M_')]
tab = R.groupby('BUCKET').apply(lambda d: pd.Series({c: (d.MARGIN - d[c]).abs().mean() for c in pc} | {'n': len(d)})).T
tab['ALL'] = [(R.MARGIN - R[c]).abs().mean() for c in pc] + [len(R)]
print(tab.round(2).to_string())
