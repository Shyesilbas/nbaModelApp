import os, io, contextlib, warnings, logging; warnings.filterwarnings('ignore'); logging.disable(logging.CRITICAL)
import numpy as np, pandas as pd
from src.features import build_matchup_features as bmf
from src.inference.score_predictor import ScorePredictor
orig = bmf.blend_score_form_with_prior
def recording(res, season, team, opp, n_team, n_opp):
    for k in [p + s + '_LAST_10' for p in ('', 'OPP_') for s in bmf.SCORE_FORM_STATS]:
        res['_RAW_' + k] = res.get(k)
    orig(res, season, team, opp, n_team, n_opp)
bmf.blend_score_form_with_prior = recording
sp = ScorePredictor()
print('models from', sp.metadata.get('training_manifest', {}).get('validation_season'), sp.metadata.get('version'))
s = '2025-26'
gr = pd.read_csv(f'data/season={s}/processed/game_results.csv'); gr = gr[gr.SEASON_TYPE == 'Regular Season'].sort_values('GAME_DATE')
cnt = {}; rows = []
for r in gr.itertuples():
    h, a = r.HOME_TEAM_ABBREVIATION, r.AWAY_TEAM_ABBREVIATION
    nh, na = cnt.get(h, 0), cnt.get(a, 0); cnt[h] = nh + 1; cnt[a] = na + 1
    if min(nh, na) >= 8: continue
    with contextlib.redirect_stdout(io.StringIO()):
        f = bmf.build_features(h, a, r.GAME_DATE, season=s)
        fa = bmf.build_features(a, h, r.GAME_DATE, season=s, team_is_home=False)
    new = sp.predict(h, a, r.GAME_DATE, features=f, away_features=fa)['predicted_total']
    raw = lambda d: {k: (d['_RAW_' + k] if ('_RAW_' + k) in d else v) for k, v in d.items()}
    old = sp.predict(h, a, r.GAME_DATE, features=raw(f), away_features=raw(fa))['predicted_total']
    rows.append({'nmin': min(nh, na), 'actual': r.HOME_SCORE + r.AWAY_SCORE, 'old': old, 'new': new})
df = pd.DataFrame(rows)
df['bucket'] = pd.cut(df.nmin, [-1, 0, 2, 5, 7], labels=['0', '1-2', '3-5', '6-7'])
out = df.groupby('bucket').apply(lambda d: pd.Series({'n': len(d), 'MAE_old': (d.actual - d.old).abs().mean(), 'MAE_new': (d.actual - d.new).abs().mean(), 'pred_std_old': d.old.std(), 'pred_std_new': d.new.std()}))
print(out.round(2)); print('ALL', round((df.actual-df.old).abs().mean(), 2), round((df.actual-df.new).abs().mean(), 2), len(df))
df.to_parquet('data/experimental/early_season/replay_2025_26.parquet')
