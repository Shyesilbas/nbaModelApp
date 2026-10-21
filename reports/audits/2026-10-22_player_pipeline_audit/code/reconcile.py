"""Ways to reconcile player PTS projections with the team score, evaluated on the dumped live rosters."""
import sys, numpy as np, pandas as pd
d = pd.read_parquet(sys.argv[1])
a = d[d.STATUS.isin(['ACTIVE', 'RESTRICTED'])].copy()
print(a.GAME_ID.nunique(), 'games', len(a), 'active player rows;', int(a.PLAYED.sum()), 'of them played')
P_PLAY = [(5, .267), (8, .380), (12, .514), (16, .655), (20, .729), (25, .756), (30, .788), (99, .823)]
a['p_play'] = [next(p for hi, p in P_PLAY if m <= hi) for m in a.MIN_EMA_10.fillna(0)]
key = [a.GAME_ID, a.TEAM_ABBREVIATION]
p = a.RAW_PROJ_PTS; T = a.TEAM_SCORE_PRED; S = p.groupby(key).transform('sum')
V = {'no reconciliation (current)': p,
     'uniform scale to team score': p * (T / S).clip(0.7, 1.3)}
w = a.BASE_USG.clip(lower=5) * a.OWN_MIN.clip(lower=1)
V['team score split by usage x minutes'] = T * w / w.groupby(key).transform('sum')
u = (1 - a.p_play) * p; E = (S - T).clip(lower=0); U = u.groupby(key).transform('sum')
V['cut excess from uncertain players'] = (p - E * u / U.where(U > 0, 1)).clip(lower=0)
V['half way (no scaling / uniform)'] = 0.5 * V['no reconciliation (current)'] + 0.5 * V['uniform scale to team score']
V['expected value (proj x P(play))'] = p * a.p_play
rows = []
for name, v in V.items():
    played = a.PLAYED; clean = a.PLAYED & ~a.ASSUMED
    tsum = v.groupby(key).sum(); tact = a.groupby(key).TEAM_PTS_ACT.first(); tpred = a.groupby(key).TEAM_SCORE_PRED.first()
    rows.append({'method': name,
                 'MAE played': (a.ACT_PTS - v)[played].abs().mean(),
                 'bias played': (a.ACT_PTS - v)[played].mean(),
                 'MAE all active (0 if sat)': (a.ACT_PTS - v).abs().mean(),
                 'team sum - actual pts': (tsum - tact).abs().mean(),
                 'team sum / predicted score': (tsum / tpred).mean()})
print(pd.DataFrame(rows).set_index('method').round(3).to_string())
star = a.groupby(key).RAW_PROJ_PTS.transform('max') == a.RAW_PROJ_PTS
print('\ntop projected scorer of each team (played):')
print(pd.DataFrame({n: [(a.ACT_PTS - v)[star & a.PLAYED].abs().mean(), (a.ACT_PTS - v)[star & a.PLAYED].mean()] for n, v in V.items()}, index=['MAE', 'bias']).T.round(3).to_string())
