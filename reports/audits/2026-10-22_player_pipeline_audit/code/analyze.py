import sys, pandas as pd, numpy as np
d = pd.read_parquet(sys.argv[1])
print(len(d), 'player-games', d.GAME_ID.nunique(), 'games')
m = d.new_PRE_RAW_PROJ_PTS.notna() & d.old_PRE_RAW_PROJ_PTS.notna()
print('coverage (actual players found in roster)', round(m.mean(), 3))
e = lambda col, t: (d[f'ACT_{t}'] - d[col].fillna(0))[m].abs().mean()
rows = []
for t in ['PTS', 'REB', 'AST']:
    rows.append({'stat': t,
        'training rows (S0)': e(f'S0_{t}', t),
        'old live: raw model': e(f'old_PRE_RAW_PROJ_{t}', t),
        'new live: raw model': e(f'new_PRE_RAW_PROJ_{t}', t),
        'new: + redistribution': e(f'new_POST_RAW_PROJ_{t}', t),
        'new: + top-down scaling': e(f'new_SCALED_{t}', t),
        'old: + redistribution + top-down': e(f'old_SCALED_{t}', t)})
print(pd.DataFrame(rows).set_index('stat').round(3).T.to_string())
dnp = m & (d.new_POST_STATUS == 'DNP')
print('actual players predicted DNP:', round(dnp.sum() / m.sum(), 3), '| their actual MIN / PTS:', d[dnp][['MIN_ACT', 'ACT_PTS']].mean().round(1).to_dict())
nd = m & ~dnp
print('players not cut: PTS MAE raw', (d.ACT_PTS - d.new_PRE_RAW_PROJ_PTS)[nd].abs().mean().round(3), 'post', (d.ACT_PTS - d.new_POST_RAW_PROJ_PTS)[nd].abs().mean().round(3), 'scaled', (d.ACT_PTS - d.new_SCALED_PTS)[nd].abs().mean().round(3))
print('PTS bias actual-pred raw/post/scaled:', [round((d.ACT_PTS - d[c].fillna(0))[m].mean(), 3) for c in ['new_PRE_RAW_PROJ_PTS', 'new_POST_RAW_PROJ_PTS', 'new_SCALED_PTS']])
print('REB/AST: raw vs scaled-by-points', [(t, round(e(f'new_POST_RAW_PROJ_{t}', t), 3), round(e(f'new_SCALED_{t}', t), 3)) for t in ['REB', 'AST']])
