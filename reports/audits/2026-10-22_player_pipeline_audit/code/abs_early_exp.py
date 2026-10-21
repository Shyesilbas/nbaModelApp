"""Games 2-5 of a team's season: old cross-season ABS window vs ABS = 0 (training semantics). WIN Brier."""
import io, contextlib, warnings, logging; warnings.filterwarnings('ignore'); logging.disable(logging.CRITICAL)
import numpy as np, pandas as pd
from src.features import roster_absence as ra
from src.features.build_matchup_features import build_features, _load_absence_logs
from src.inference.win_predictor import WinPredictor
wp = WinPredictor()

def old_delta(logs, team, pred_date):
    d = ra._prepare(logs)
    d = d[d.GAME_DATE < pd.to_datetime(pred_date)].sort_values('GAME_DATE', kind='stable')
    d = d[~d.GAME_ID.str.startswith('001')]
    cur = d.groupby('Player_ID').TEAM_ABBREVIATION.last()
    d = d[(d.TEAM_ABBREVIATION == team) & d.Player_ID.map(cur).eq(team)]
    if d.empty: return 0.0
    order = d.groupby('GAME_ID').GAME_DATE.first().sort_values(kind='stable')
    ids = list(order.index[-ra.WINDOW:]); n = len(ids)
    if n < ra.MIN_HISTORY_GAMES: return 0.0
    h = d[d.GAME_ID.isin(ids)]
    st = h.groupby('Player_ID').agg(gp=('MIN', 'size'), msum=('MIN', 'sum'), gs=('GS', 'mean'))
    st['presence'] = st.gp / n
    rot = st[st.msum / st.gp >= ra.MIN_ROTATION_MINUTES]
    last = d[d.GAME_ID == ids[-1]]
    if (pd.to_datetime(pred_date) - last.GAME_DATE.iloc[0]).days > ra.STALE_DAYS:
        return 0.0
    play = set(last.Player_ID)
    return float(sum(((1.0 if p in play else 0.0) - r.presence) * r.gs for p, r in rot.iterrows()))

rows = []
for s in ['2021-22', '2022-23', '2023-24', '2024-25', '2025-26']:
    logs = _load_absence_logs(s)
    gr = pd.read_csv(f'data/season={s}/processed/game_results.csv'); gr = gr[gr.SEASON_TYPE == 'Regular Season'].sort_values('GAME_DATE')
    cnt = {}
    for r in gr.itertuples():
        h, a = r.HOME_TEAM_ABBREVIATION, r.AWAY_TEAM_ABBREVIATION
        nh, na = cnt.get(h, 0), cnt.get(a, 0); cnt[h] = nh + 1; cnt[a] = na + 1
        early_h, early_a = 1 <= nh < 5, 1 <= na < 5
        if not (early_h or early_a): continue
        with contextlib.redirect_stdout(io.StringIO()):
            f = build_features(h, a, r.GAME_DATE, season=s)
        new = dict(f); old = dict(f)
        if early_h: new['ABS_DELTA'] = 0.0; old['ABS_DELTA'] = old_delta(logs, h, r.GAME_DATE)
        if early_a: new['OPP_ABS_DELTA'] = 0.0; old['OPP_ABS_DELTA'] = old_delta(logs, a, r.GAME_DATE)
        for x in (new, old): x['ABS_DIFF'] = x['ABS_DELTA'] - x['OPP_ABS_DELTA']
        rows.append({'season': s, 'y': int(r.HOME_SCORE > r.AWAY_SCORE), 'p_old': wp.predict_from_dict(old)['home_win_probability'],
                     'p_new': wp.predict_from_dict(new)['home_win_probability'], 'abs_old': old['ABS_DIFF']})
df = pd.DataFrame(rows)
print(len(df), 'games; mean |ABS_DIFF| old', df.abs_old.abs().mean().round(1))
for c in ['p_old', 'p_new']:
    p, y = df[c], df.y
    print(c, 'Brier %.4f' % ((p - y) ** 2).mean(), 'LogLoss %.4f' % (-(y * np.log(p) + (1 - y) * np.log(1 - p))).mean(), 'Acc %.3f' % ((p > .5) == y).mean())
print(df.groupby('season').apply(lambda d: pd.Series({c: ((d[c] - d.y) ** 2).mean() for c in ['p_old', 'p_new']})).round(4))
