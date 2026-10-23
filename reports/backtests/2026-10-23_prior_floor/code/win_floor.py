"""WIN: keep a floor of Elo weight after the 6-game hand-over. Walk-forward logistic on the 8 production features."""
import warnings; warnings.filterwarnings('ignore')
import json
import numpy as np, pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import log_loss, brier_score_loss
from src.inference.win_blend import elo_home_probability

F = json.load(open('models/production/win_features.json'))
SEASONS = ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26']
d = []
for s in SEASONS:
    x = pd.read_csv(f'data/training/team_model_ready_{s.replace("-", "_")}.csv', dtype={'GAME_ID': str})
    x['SEASON'] = s
    d.append(x)
d = pd.concat(d, ignore_index=True)
d['GAME_DATE'] = pd.to_datetime(d.GAME_DATE)
from src.features.continuous_elo import build_continuous_elo_dataset
elo, _ = build_continuous_elo_dataset(SEASONS)
elo['GAME_ID'] = elo.GAME_ID.astype(str).str.split('.').str[0].str.zfill(10)
d['GAME_ID'] = d.GAME_ID.str.zfill(10)
d = d.drop(columns=[c for c in ['PRE_GAME_ELO', 'OPP_PRE_GAME_ELO', 'ELO_DIFF'] if c in d.columns])
d = d.merge(elo[['GAME_ID', 'TEAM_ABBREVIATION', 'PRE_GAME_ELO', 'OPP_PRE_GAME_ELO', 'ELO_DIFF']].drop_duplicates(['GAME_ID', 'TEAM_ABBREVIATION']), on=['GAME_ID', 'TEAM_ABBREVIATION'], how='left')
d['WINRATE_DIFF_LAST_10'] = d.WINRATE_LAST_10 - d.OPP_WINRATE_LAST_10
d['REST_DIFF'] = d.DAYS_REST.clip(upper=4) - d.OPP_DAYS_REST.clip(upper=4)
d['CLEAN_NET_RTG_DIFF_LAST_10'] = d.CLEAN_NET_RTG_LAST_10 - d.OPP_CLEAN_NET_RTG_LAST_10
d = d[(d.IS_HOME == 1)].dropna(subset=F + ['WIN']).sort_values('GAME_DATE')
if 'SEASON_TYPE' in d.columns:
    d = d[d.SEASON_TYPE == 'Regular Season']
print(len(d), 'home rows; columns missing:', [c for c in ['PRE_GAME_ELO', 'OPP_PRE_GAME_ELO'] if c not in d.columns])

# games played by the less-experienced team of the matchup
d = d.sort_values(['SEASON', 'GAME_DATE'])
cnt = {}
nmin = []
for r in d.itertuples():
    a, b = cnt.get((r.SEASON, r.TEAM_ABBREVIATION), 0), cnt.get((r.SEASON, r.OPPONENT_ABBREVIATION), 0)
    nmin.append(min(a, b))
    cnt[(r.SEASON, r.TEAM_ABBREVIATION)] = a + 1
    cnt[(r.SEASON, r.OPPONENT_ABBREVIATION)] = b + 1
d['NMIN'] = nmin

rows = []
for s in SEASONS[1:]:
    tr, te = d[d.SEASON < s].copy(), d[d.SEASON == s].copy()
    sc = StandardScaler().fit(tr[F])
    m = LogisticRegression(max_iter=1000).fit(sc.transform(tr[F]), tr.WIN)
    te['P_MODEL'] = m.predict_proba(sc.transform(te[F]))[:, 1]
    te['P_ELO'] = [elo_home_probability(a, b) for a, b in zip(te.PRE_GAME_ELO, te.OPP_PRE_GAME_ELO)]
    rows.append(te)
R = pd.concat(rows)
n = R.NMIN.values.astype(float)
R['B'] = pd.cut(R.NMIN, [-1, 5, 19, 39, 200], labels=['0-5', '6-19', '20-39', '40+'])
variants = {}
for floor in [0.0, 0.05, 0.10]:
    w = np.where(n < 6, 0.40 * (1 - n / 6), 0.0)
    w = np.maximum(w, floor)
    variants[f'floor_{floor}'] = (1 - w) * R.P_MODEL + w * R.P_ELO
variants['elo_only'] = R.P_ELO
out = []
for k, p in variants.items():
    p = p.clip(0.001, 0.999)
    row = {'variant': k, 'ALL_ll': log_loss(R.WIN, p), 'ALL_brier': brier_score_loss(R.WIN, p)}
    for b, g in R.groupby('B'):
        row[f'll_{b}'] = log_loss(g.WIN, p[g.index.isin(g.index)].loc[g.index] if False else p.loc[g.index])
    out.append(row)
print(pd.DataFrame(out).set_index('variant').round(4).to_string())
print(R.groupby('B').size().to_dict())
# per-season consistency of the floor effect
for s, g in R.groupby('SEASON'):
    r = {}
    for k in ['floor_0.0', 'floor_0.05', 'floor_0.1']:
        r[k] = round(log_loss(g.WIN, variants[k].loc[g.index].clip(0.001, 0.999)), 4)
    print(s, r)
