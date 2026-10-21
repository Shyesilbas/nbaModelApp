"""When a key player sits, how much of his production do teammates recover, and who gets it?
Regular seasons 2022-23..2025-26. Teammate excess = actual - pregame EMA-10, minus the same excess in
games with no key absence (control), so form drift is removed."""
import warnings; warnings.filterwarnings('ignore')
import numpy as np, pandas as pd
df = pd.read_csv('data/training/player_model_ready.csv', usecols=['PLAYER_ID', 'GAME_ID', 'GAME_DATE', 'TEAM_ABBREVIATION', 'SEASON_TYPE',
     'GAME_MIN', 'GAME_PTS', 'GAME_REB', 'GAME_AST', 'PTS_EMA_10', 'REB_EMA_10', 'AST_EMA_10', 'MIN_EMA_10', 'USG_PCT_EMA_10', 'PLAYER_POSITION_GROUP'])
df = df[(df.SEASON_TYPE == 'Regular Season') & (df.GAME_DATE >= '2022-10-01')].copy()
df['GAME_DATE'] = pd.to_datetime(df.GAME_DATE)
df = df.dropna(subset=['PTS_EMA_10', 'MIN_EMA_10'])
# per team: ordered games and the players in each
key_rows = []
for team, g in df.groupby('TEAM_ABBREVIATION'):
    order = g.drop_duplicates('GAME_ID').sort_values('GAME_DATE').GAME_ID.tolist()
    by_game = {gid: x.set_index('PLAYER_ID') for gid, x in g.groupby('GAME_ID')}
    for i in range(5, len(order)):
        gid = order[i]; prev = [by_game[x] for x in order[i - 5:i]]
        cur = by_game[gid]
        # key players: played 4+ of the last 5 with 28+ min EMA and 15+ pts EMA, absent tonight
        cands = pd.concat(prev)
        cnt = cands.index.value_counts()
        last = cands.groupby(level=0).last()
        keys = last[(cnt.reindex(last.index) >= 4) & (last.MIN_EMA_10 >= 28) & (last.PTS_EMA_10 >= 15)]
        absent = keys[~keys.index.isin(cur.index)]
        key_rows.append({'GAME_ID': gid, 'TEAM': team, 'n_absent': len(absent),
                         'abs_pts': absent.PTS_EMA_10.sum(), 'abs_reb': absent.REB_EMA_10.sum(), 'abs_ast': absent.AST_EMA_10.sum(),
                         'abs_min': absent.MIN_EMA_10.sum(), 'abs_pos': ','.join(absent.PLAYER_POSITION_GROUP.astype(str))})
K = pd.DataFrame(key_rows)
d = df.merge(K, left_on=['GAME_ID', 'TEAM_ABBREVIATION'], right_on=['GAME_ID', 'TEAM'])
for s in ['PTS', 'REB', 'AST', 'MIN']:
    d[f'X_{s}'] = d[f'GAME_{s}'] - d[f'{s}_EMA_10']
ctrl = d[d.n_absent == 0]; one = d[d.n_absent == 1].copy()
print('team-games with one key player out:', one.GAME_ID.nunique(), '| control:', ctrl.GAME_ID.nunique())
base = {s: ctrl[f'X_{s}'].mean() for s in ['PTS', 'REB', 'AST', 'MIN']}
print('control mean excess per player (form drift):', {k: round(v, 3) for k, v in base.items()})
# 1) team-level recovery
tg = one.groupby('GAME_ID').agg(abs_pts=('abs_pts', 'first'), abs_reb=('abs_reb', 'first'), abs_ast=('abs_ast', 'first'), abs_min=('abs_min', 'first'),
                                n=('PLAYER_ID', 'size'), **{f'x_{s}': (f'X_{s}', 'sum') for s in ['PTS', 'REB', 'AST', 'MIN']})
for s, a in [('PTS', 'abs_pts'), ('REB', 'abs_reb'), ('AST', 'abs_ast'), ('MIN', 'abs_min')]:
    rec = (tg[f'x_{s}'] - tg.n * base[s]).sum() / tg[a].sum()
    print(f'{s}: teammates recover {rec:.0%} of the absent player\'s EMA')
# 2) who gets it: excess (minus control drift) by teammate usage rank within the game
one['usg_rank'] = one.groupby('GAME_ID').USG_PCT_EMA_10.rank(ascending=False, method='first')
one['min_rank'] = one.groupby('GAME_ID').MIN_EMA_10.rank(ascending=False, method='first')
for s in ['PTS', 'REB', 'AST']:
    one[f'adj_{s}'] = one[f'X_{s}'] - base[s]
print('\nexcess by teammate usage rank (PTS / REB / AST / MIN, per player-game), and share of the recovered PTS:')
r = one.groupby(one.usg_rank.clip(upper=9)).agg(PTS=('adj_PTS', 'mean'), REB=('adj_REB', 'mean'), AST=('adj_AST', 'mean'), MIN=('X_MIN', 'mean'), n=('adj_PTS', 'size'))
r['MIN'] -= base['MIN']; r['PTS_share'] = r.PTS * r.n / (r.PTS * r.n).sum()
print(r.round(3).to_string())
# 3) same position as the absent player?
one['same_pos'] = [str(p) in a.split(',') for p, a in zip(one.PLAYER_POSITION_GROUP, one.abs_pos)]
print('\nby position match:'); print(one.groupby('same_pos')[['adj_PTS', 'adj_REB', 'adj_AST']].mean().round(3))
# 4) current rule check: 70% of PTS split by usage * sqrt(min)
one['w'] = one.USG_PCT_EMA_10.clip(lower=5) * np.sqrt(one.MIN_EMA_10.clip(lower=1))
one['rule_pts'] = 0.7 * one.abs_pts * one.w / one.groupby('GAME_ID').w.transform('sum')
for name, pred in [('no adjustment', 0.0), ('current rule (70% by usage*sqrt(min))', one.rule_pts)]:
    print(name, 'MAE of teammate PTS vs actual:', round((one.GAME_PTS - (one.PTS_EMA_10 + base['PTS'] + pred)).abs().mean(), 3))
one.to_parquet('data/experimental/player_audit/one_absent.parquet')
