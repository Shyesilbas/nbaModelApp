"""Replay the live player path over 2025-26 with holdout models; stage-by-stage MAE."""
import sys, io, contextlib, time, warnings, logging
warnings.filterwarnings('ignore'); logging.disable(logging.CRITICAL)
import joblib, numpy as np, pandas as pd
from types import SimpleNamespace
from src.api.services import player_projection as pp
from src.api.services.usage_redistribution import redistribute_usage_and_minutes
from src.inference.top_down_scaling import apply_top_down_scaling
from src.features.player_form import add_player_matchup_features
from src.core.data_paths import PLAYER_TRAINING_CSV, PLAYER_METADATA_CSV
from src.core.season_utils import date_to_season

OUT = sys.argv[1]; N_DATES = int(sys.argv[2]); WITH_SCORE = len(sys.argv) > 3 and sys.argv[3] == 'score'
H = 'models/experimental/holdout_eval/'
feats = joblib.load(H + 'player_features.pkl')
M = {t: joblib.load(H + f'player_model_{t.lower()}.pkl') for t in ['PTS', 'REB', 'AST']}

train = pd.read_csv(PLAYER_TRAINING_CSV, dtype={'GAME_ID': str})
train['GAME_DATE'] = pd.to_datetime(train.GAME_DATE)
train['SEASON'] = train.GAME_DATE.map(date_to_season)
season_file = pd.read_csv('data/season=2025-26/features/player_features.csv', dtype={'Game_ID': str})
meta = pd.read_csv(PLAYER_METADATA_CSV, usecols=['PLAYER_ID', 'POSITION_GROUP']).drop_duplicates('PLAYER_ID').set_index('PLAYER_ID')['POSITION_GROUP']

def prep(df):
    d = pp._normalize_player_dataset(df)
    d['GAME_DATE'] = pd.to_datetime(d.GAME_DATE)
    can = d.PLAYER_ID.map(meta)
    for c in ('PLAYER_POSITION_GROUP', 'POSITION_GROUP'):
        d[c] = can.fillna(d[c] if c in d.columns else 'WING')
    return d

variants = {
    'old': prep(pd.concat([train[train.SEASON < '2025-26'].drop(columns='SEASON'), season_file], ignore_index=True)),
    'new': prep(pd.concat([train[train.SEASON < '2025-26'].drop(columns='SEASON'), pp.season_rows_from_raw('2025-26')], ignore_index=True)),
}
new_context, new_playoff = pp._opponent_context, pp.scheduled_is_playoff
def use(v):
    if v == 'old':
        pp._opponent_context = lambda past_df, opp, dt, season: pp._defense_context(past_df, opp)
        pp.scheduled_is_playoff = lambda dt, h, a, season: pp.is_playoff_date(dt)
    else:
        pp._opponent_context, pp.scheduled_is_playoff = new_context, new_playoff
cur = train[(train.SEASON == '2025-26') & (train.SEASON_TYPE == 'Regular Season')]
games = cur.groupby('GAME_ID').agg(GAME_DATE=('GAME_DATE', 'first')).reset_index()
teams = cur.groupby(['GAME_ID', 'IS_HOME']).TEAM_ABBREVIATION.first().unstack()
games['HOME'] = games.GAME_ID.map(teams[1] if 1 in teams.columns else teams[True]); games['AWAY'] = games.GAME_ID.map(teams[0] if 0 in teams.columns else teams[False])
dates = sorted(games.GAME_DATE.unique())
pick = [dates[int(i)] for i in np.linspace(3, len(dates) - 1, N_DATES)]
games = games[games.GAME_DATE.isin(pick) & games.HOME.notna() & games.AWAY.notna()]
print(len(games), 'games on', len(pick), 'dates', flush=True)

if WITH_SCORE:
    import os; os.environ['NBA_MODEL_DIR'] = 'models/experimental/holdout_eval'
    from src.inference.score_predictor import ScorePredictor
    from src.features.build_matchup_features import build_features
    sp = ScorePredictor()

role = pp._role_model()
rows = []; t0 = time.time()
for g in games.itertuples():
    ds = g.GAME_DATE.strftime('%Y-%m-%d')
    ref = cur[cur.GAME_ID == g.GAME_ID].copy()
    refX = add_player_matchup_features(ref)
    rec = pd.DataFrame({'PLAYER_ID': ref.PLAYER_ID.values, 'TEAM': ref.TEAM_ABBREVIATION.values,
                        'MIN_ACT': ref.GAME_MIN.values,
                        **{f'ACT_{t}': ref[f'TARGET_{t}'].values for t in ['PTS', 'REB', 'AST']},
                        **{f'S0_{t}': M[t].predict(refX.reindex(columns=feats)) for t in ['PTS', 'REB', 'AST']}})
    scores = None
    if WITH_SCORE:
      try:
        with contextlib.redirect_stdout(io.StringIO()):
            f = build_features(g.HOME, g.AWAY, ds); fa = build_features(g.AWAY, g.HOME, ds, team_is_home=False)
        r = sp.predict(g.HOME, g.AWAY, ds, features=f, away_features=fa)
        scores = {g.HOME: r['predicted_home_score'], g.AWAY: r['predicted_away_score']}
      except Exception as e:
        print('score fail', g.GAME_ID, e); continue
    for v, df in variants.items():
        use(v)
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                hX, aX = pp._build_future_rosters(df, g.HOME, g.AWAY, g.GAME_DATE, ds)
        except Exception as e:
            print('fail', v, g.GAME_ID, e); continue
        X = add_player_matchup_features(pd.concat([hX, aX], ignore_index=True))
        Xm = X.reindex(columns=feats)
        for t in ['PTS', 'REB', 'AST']:
            X[f'RAW_PROJ_{t}'] = np.maximum(0, M[t].predict(Xm))
        X = pp.apply_no_history_rates(X)
        X = pp.blend_early_season_projection(X, g.GAME_DATE)
        pre = X.set_index('PLAYER_ID')[[f'RAW_PROJ_{t}' for t in ['PTS', 'REB', 'AST']] + ['MIN_EMA_10', 'USG_PCT_EMA_10', 'OPP_POS_PTS_ALLOWED_LAST_10']].add_prefix(f'{v}_PRE_')
        R = redistribute_usage_and_minutes(X, {}, is_preseason=False, role_model=role)
        post = R.set_index('PLAYER_ID')[[f'RAW_PROJ_{t}' for t in ['PTS', 'REB', 'AST']] + ['PROJ_MIN', 'STATUS', 'TEAM_ABBREVIATION']].add_prefix(f'{v}_POST_')
        if scores is not None:
            for team, tdf in R.groupby('TEAM_ABBREVIATION'):
                _, scale = apply_top_down_scaling(scores[team], tdf.RAW_PROJ_PTS.tolist())
                for t in ['PTS', 'REB', 'AST']:
                    post.loc[tdf.PLAYER_ID.values, f'{v}_SCALED_{t}'] = (tdf[f'RAW_PROJ_{t}'] * scale).values
        rec = rec.merge(pre, left_on='PLAYER_ID', right_index=True, how='left').merge(post, left_on='PLAYER_ID', right_index=True, how='left')
        n_roster = len(X)
        rec[f'{v}_N_ROSTER'] = n_roster
    rec['GAME_ID'] = g.GAME_ID; rec['GAME_DATE'] = g.GAME_DATE
    rows.append(rec)
    if len(rows) % 20 == 0:
        print(len(rows), 'games', round(time.time() - t0), 's', flush=True)
        pd.concat(rows, ignore_index=True).to_parquet(OUT)
out = pd.concat(rows, ignore_index=True)
out.to_parquet(OUT)
print('done', len(out), 'player-games', round(time.time() - t0), 's')
