# Opportunity features for PLAYER (box score proxy for tracking data)

Question: would tracking-style "chances" data (rebound chances, assist opportunities, shot volume) help PLAYER PTS/REB/AST?
Instead of fetching tracking endpoints, the opportunity is approximated from box scores already stored, for all six seasons
(`code/opportunity_exp.py`, no API calls).

Added to the 21 production features: pre-game EMA-10 of REB per available rebound (own + opponent misses x minutes/48),
AST per teammate made field goal, shot use per team shot; the expected game environment (rolling-10 team and opponent
misses / makes / shots x expected minutes share); and rate x environment products (9 features).

Walk-forward, 5 folds (train on all earlier seasons, test 2021-22..2025-26), production LightGBM settings:

| target | prod MAE | +opportunity MAE | gain | 95% CI | seasons better |
|---|---|---|---|---|---|
| PTS | 4.5373 | 4.5309 | +0.0064 | [+0.0040, +0.0088] | 4/5 |
| REB | 1.9104 | 1.9089 | +0.0015 | [+0.0007, +0.0023] | 5/5 |
| AST | 1.3214 | 1.3213 | +0.0002 | [-0.0004, +0.0008] | 3/5 |

Reading: gains are 0.1-0.14% of MAE (the bootstrap CI treats rows as independent, so it is optimistic). Not worth
the 9 extra features. The EMA-10 and USG features already carry the opportunity signal. A real tracking feed
(touches, potential assists, rebound chances) is therefore unlikely to move MAE by more than this either; it was not fetched.
Production is unchanged.
