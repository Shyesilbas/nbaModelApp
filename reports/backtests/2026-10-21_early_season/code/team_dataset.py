"""Game-level dataset for early-season SCORE experiments (one row per game, home view)."""
import warnings; warnings.filterwarnings('ignore')
import numpy as np, pandas as pd
from src.features.continuous_elo import build_continuous_elo_dataset

SEASONS = ['2020-21','2021-22','2022-23','2023-24','2024-25','2025-26']
STATS = ['PACE','OFF_RTG','DEF_RTG','NET_RTG']

def load():
    tf = []
    for s in SEASONS:
        d = pd.read_csv(f'data/season={s}/features/team_features.csv', dtype={'GAME_ID': str})
        d = d[d.SEASON_TYPE != 'Pre Season'].copy()
        d['SEASON'] = s
        tf.append(d[['SEASON','GAME_ID','GAME_DATE','TEAM_ABBREVIATION','OPPONENT_ABBREVIATION','IS_HOME','SEASON_TYPE','PTS','POSS','DAYS_REST','IS_B2B'] + STATS])
    tf = pd.concat(tf, ignore_index=True)
    tf['GAME_DATE'] = pd.to_datetime(tf.GAME_DATE)
    tf['GAME_ID'] = tf.GAME_ID.str.zfill(10)
    tf = tf.sort_values(['SEASON','TEAM_ABBREVIATION','GAME_DATE'], kind='stable')
    g = tf.groupby(['SEASON','TEAM_ABBREVIATION'])
    tf['N'] = g.cumcount()
    for st in STATS:
        sh = g[st].shift(1)
        key = [tf.SEASON, tf.TEAM_ABBREVIATION]
        for w in [3,4,5,10,15]:
            tf[f'{st}_L{w}'] = sh.groupby(key).transform(lambda x: x.rolling(w, min_periods=1).mean())
        tf[f'{st}_STD'] = sh.groupby(key).transform(lambda x: x.expanding(min_periods=1).mean())
        for sp in [5,10,20]:
            tf[f'{st}_EW{sp}'] = sh.groupby(key).transform(lambda x: x.ewm(span=sp, min_periods=1).mean())
    # prior = previous regular season team mean
    reg = tf[tf.SEASON_TYPE == 'Regular Season']
    prev = reg.groupby(['SEASON','TEAM_ABBREVIATION'])[STATS].mean()
    nxt = {a: b for a, b in zip(SEASONS[:-1], SEASONS[1:])}
    prev = prev.reset_index(); prev['SEASON'] = prev.SEASON.map(nxt); prev = prev.dropna(subset=['SEASON'])
    prev = prev.rename(columns={st: f'{st}_PRIOR' for st in STATS})
    tf = tf.merge(prev, on=['SEASON','TEAM_ABBREVIATION'], how='left')
    # Elo
    elo, _ = build_continuous_elo_dataset(SEASONS)
    ecol = [c for c in elo.columns if 'ELO' in c.upper()]
    elo['GAME_ID'] = elo.GAME_ID.astype(str).str.split('.').str[0].str.zfill(10)
    tf = tf.merge(elo[['GAME_ID','TEAM_ABBREVIATION'] + ecol].drop_duplicates(['GAME_ID','TEAM_ABBREVIATION']), on=['GAME_ID','TEAM_ABBREVIATION'], how='left')
    return tf, ecol

if __name__ == '__main__':
    tf, ecol = load()
    print(tf.shape, ecol)
    import os; os.makedirs('data/experimental/early_season', exist_ok=True)
    tf.to_parquet('data/experimental/early_season/team_rows.parquet')
    print(tf[['SEASON','TEAM_ABBREVIATION','N','PACE_L10','PACE_PRIOR']+ecol].head(3))
