import warnings, logging, io, contextlib; warnings.filterwarnings('ignore'); logging.disable(logging.CRITICAL)
import numpy as np, pandas as pd
from src.features.build_matchup_features import build_features
from src.inference.win_predictor import WinPredictor
wp = WinPredictor()
rows = []
for s in ['2021-22','2022-23','2023-24','2024-25','2025-26']:
    gr = pd.read_csv(f'data/season={s}/processed/game_results.csv'); gr = gr[gr.SEASON_TYPE == 'Regular Season'].sort_values('GAME_DATE')
    seen = set()
    for r in gr.itertuples():
        h, a = r.HOME_TEAM_ABBREVIATION, r.AWAY_TEAM_ABBREVIATION
        if h in seen and a in seen: continue
        first_h, first_a = h not in seen, a not in seen
        seen |= {h, a}
        with contextlib.redirect_stdout(io.StringIO()):
            f = build_features(h, a, r.GAME_DATE, season=s)
        rec = {'season': s, 'home_win': int(r.HOME_SCORE > r.AWAY_SCORE), 'margin': r.HOME_SCORE - r.AWAY_SCORE,
               'abs_h': f['ABS_DELTA'], 'abs_a': f['OPP_ABS_DELTA'], 'first_h': first_h, 'first_a': first_a}
        rec['p_cur'] = wp.predict_from_dict(dict(f))['home_win_probability']
        g = dict(f)
        if first_h: g['ABS_DELTA'] = 0.0
        if first_a: g['OPP_ABS_DELTA'] = 0.0
        g['ABS_DIFF'] = g['ABS_DELTA'] - g['OPP_ABS_DELTA']
        rec['p_fix'] = wp.predict_from_dict(g)['home_win_probability']
        rows.append(rec)
df = pd.DataFrame(rows)
df.to_parquet('data/experimental/early_season/abs_openers.parquet')
print(len(df), 'games; mean |ABS| current', df[['abs_h','abs_a']].abs().mean().round(1).to_dict())
for c in ['p_cur','p_fix']:
    p = df[c]; y = df.home_win
    print(c, 'Brier %.4f' % ((p - y) ** 2).mean(), 'LogLoss %.4f' % (-(y*np.log(p) + (1-y)*np.log(1-p))).mean(), 'Acc %.3f' % ((p > .5) == y).mean())
print(df.groupby('season').apply(lambda d: pd.Series({c: ((d[c]-d.home_win)**2).mean() for c in ['p_cur','p_fix']})).round(4))
