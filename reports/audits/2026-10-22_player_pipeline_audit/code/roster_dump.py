"""Rotation cap x top-down scaling on the live player path (2025-26, holdout models).
Player MAE on players who played, and team coherence |sum of projected PTS - actual team PTS|."""
import sys, io, contextlib, time, os, warnings, logging
warnings.filterwarnings('ignore'); logging.disable(logging.CRITICAL)
os.environ['NBA_MODEL_DIR'] = 'models/experimental/holdout_eval'
import joblib, numpy as np, pandas as pd
from src.api.services import player_projection as pp
from src.api.services import usage_redistribution as ur
from src.features.player_form import add_player_matchup_features
from src.core.data_paths import PLAYER_TRAINING_CSV, PLAYER_METADATA_CSV
from src.core.season_utils import date_to_season
from src.inference.score_predictor import ScorePredictor
from src.features.build_matchup_features import build_features

OUT = sys.argv[1]; N_DATES = int(sys.argv[2])
H = 'models/experimental/holdout_eval/'
feats = joblib.load(H + 'player_features.pkl')
M = {t: joblib.load(H + f'player_model_{t.lower()}.pkl') for t in ['PTS', 'REB', 'AST']}
sp = ScorePredictor()
train = pd.read_csv(PLAYER_TRAINING_CSV, dtype={'GAME_ID': str})
train['GAME_DATE'] = pd.to_datetime(train.GAME_DATE); train['SEASON'] = train.GAME_DATE.map(date_to_season)
meta = pd.read_csv(PLAYER_METADATA_CSV, usecols=['PLAYER_ID', 'POSITION_GROUP']).drop_duplicates('PLAYER_ID').set_index('PLAYER_ID')['POSITION_GROUP']
df = pp._normalize_player_dataset(pd.concat([train[train.SEASON < '2025-26'].drop(columns='SEASON'), pp.season_rows_from_raw('2025-26')], ignore_index=True))
df['GAME_DATE'] = pd.to_datetime(df.GAME_DATE)
can = df.PLAYER_ID.map(meta)
for c in ('PLAYER_POSITION_GROUP', 'POSITION_GROUP'): df[c] = can.fillna(df[c] if c in df.columns else 'WING')
ur.ROTATION_MAX = 13
cur = train[(train.SEASON == '2025-26') & (train.SEASON_TYPE == 'Regular Season')]
games = cur.groupby('GAME_ID').agg(GAME_DATE=('GAME_DATE', 'first')).reset_index()
teams = cur.groupby(['GAME_ID', 'IS_HOME']).TEAM_ABBREVIATION.first().unstack()
teams.columns = [bool(c) for c in teams.columns]; games['HOME'] = games.GAME_ID.map(teams[True]); games['AWAY'] = games.GAME_ID.map(teams[False])
dates = sorted(games.GAME_DATE.unique()); pick = [dates[int(i)] for i in np.linspace(10, len(dates) - 1, N_DATES)]
games = games[games.GAME_DATE.isin(pick) & games.HOME.notna() & games.AWAY.notna()]
print(len(games), 'games', flush=True)
role = pp._role_model()
frames = []
for g in games.itertuples():
    ds = g.GAME_DATE.strftime('%Y-%m-%d')
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            f = build_features(g.HOME, g.AWAY, ds); fa = build_features(g.AWAY, g.HOME, ds, team_is_home=False)
            r = sp.predict(g.HOME, g.AWAY, ds, features=f, away_features=fa)
            hX, aX = pp._build_future_rosters(df, g.HOME, g.AWAY, g.GAME_DATE, ds)
    except Exception as e:
        print('skip', g.GAME_ID, e); continue
    score = {g.HOME: r['predicted_home_score'], g.AWAY: r['predicted_away_score']}
    X = add_player_matchup_features(pd.concat([hX, aX], ignore_index=True)); Xm = X.reindex(columns=feats)
    for t in ['PTS', 'REB', 'AST']: X[f'RAW_PROJ_{t}'] = np.maximum(0, M[t].predict(Xm))
    X = pp.blend_early_season_projection(pp.apply_no_history_rates(X), g.GAME_DATE)
    lookup = pp._with_assumed_out({}, g.HOME, g.AWAY, ds, None, False)
    R = ur.redistribute_usage_and_minutes(X, lookup, is_preseason=False, role_model=role)
    ref = cur[cur.GAME_ID == g.GAME_ID].set_index('PLAYER_ID')
    out = R[['PLAYER_ID', 'TEAM_ABBREVIATION', 'STATUS', 'MIN_EMA_10', 'BASE_USG', 'OWN_MIN', 'RAW_PROJ_PTS', 'RAW_PROJ_REB', 'RAW_PROJ_AST']].copy()
    out['ASSUMED'] = out.PLAYER_ID.astype(int).isin(lookup.keys())
    out['PLAYED'] = out.PLAYER_ID.isin(ref.index)
    for t in ['PTS', 'REB', 'AST']: out[f'ACT_{t}'] = out.PLAYER_ID.map(ref[f'TARGET_{t}']).fillna(0.0)
    out['TEAM_SCORE_PRED'] = out.TEAM_ABBREVIATION.map(score)
    out['TEAM_PTS_ACT'] = out.TEAM_ABBREVIATION.map(ref.groupby('TEAM_ABBREVIATION').TARGET_PTS.sum())
    # players who played but were not on the projected roster
    miss = ref[~ref.index.isin(out.PLAYER_ID)]
    out['N_MISSING_PLAYED'] = out.TEAM_ABBREVIATION.map(miss.groupby('TEAM_ABBREVIATION').size()).fillna(0)
    out['GAME_ID'] = g.GAME_ID
    frames.append(out)
    if len(frames) % 20 == 0: print(len(frames), 'games', flush=True); pd.concat(frames).to_parquet(OUT)
pd.concat(frames).to_parquet(OUT)
print('done', len(frames))
