"""Compare share rules for an absent key player's production (one key player out, 2022-23..2025-26).
Season split: fit nothing on 2025-26, report it separately as a check."""
import numpy as np, pandas as pd
one = pd.read_parquet('data/experimental/player_audit/one_absent.parquet')
base = {'PTS': -0.264, 'REB': -0.085, 'AST': -0.047}
one['season'] = np.where(one.GAME_DATE >= '2025-10-01', 'test 2025-26', 'fit 2022-25')
gid = one.GAME_ID
def shares(w): return w / w.groupby(gid).transform('sum')
pos_reb = one.PLAYER_POSITION_GROUP.map({'BIG': 1.0, 'WING': 0.5, 'GUARD': 0.15}).fillna(0.3)
pos_ast = one.PLAYER_POSITION_GROUP.map({'GUARD': 1.0, 'WING': 0.45, 'BIG': 0.15}).fillna(0.3)
same = one.same_pos.astype(float)
usg_min = one.USG_PCT_EMA_10.clip(lower=5) * np.sqrt(one.MIN_EMA_10.clip(lower=1))
mins = one.MIN_EMA_10.clip(lower=1)
rules = {
    'none': None,
    'current (PTS 70% usage*sqrt(min); REB/AST 60% position*own)': {'PTS': (0.70, usg_min), 'REB': (0.60, pos_reb * one.REB_EMA_10.clip(lower=1)), 'AST': (0.60, pos_ast * one.AST_EMA_10.clip(lower=0.5))},
    'current weights, 82%': {'PTS': (0.82, usg_min), 'REB': (0.82, pos_reb * one.REB_EMA_10.clip(lower=1)), 'AST': (0.82, pos_ast * one.AST_EMA_10.clip(lower=0.5))},
    'equal split, 82%': {s: (0.82, pd.Series(1.0, index=one.index)) for s in ['PTS', 'REB', 'AST']},
    'by minutes, 82%': {s: (0.82, mins) for s in ['PTS', 'REB', 'AST']},
    'by minutes x (1 + same position), 82%': {s: (0.82, mins * (1 + same)) for s in ['PTS', 'REB', 'AST']},
    'by own stat x (1 + same position), 82%': {s: (0.82, one[f'{s}_EMA_10'].clip(lower=0.5) * (1 + same)) for s in ['PTS', 'REB', 'AST']},
    'by own stat, 82%': {s: (0.82, one[f'{s}_EMA_10'].clip(lower=0.5)) for s in ['PTS', 'REB', 'AST']},
}
rows = []
for name, rule in rules.items():
    rec = {'rule': name}
    for s, a in [('PTS', 'abs_pts'), ('REB', 'abs_reb'), ('AST', 'abs_ast')]:
        add = 0.0 if rule is None else rule[s][0] * one[a] * shares(rule[s][1])
        err = (one[f'GAME_{s}'] - (one[f'{s}_EMA_10'] + base[s] + add)).abs()
        for seas, e in err.groupby(one.season):
            rec[f'{s} {seas}'] = e.mean()
    rows.append(rec)
print(pd.DataFrame(rows).set_index('rule').round(3).to_string())
