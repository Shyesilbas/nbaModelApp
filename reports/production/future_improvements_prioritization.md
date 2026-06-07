Future Improvements Prioritization — Win & Score Models

Objective

Rank candidate improvements by: expected impact on Win Model, expected impact on Score Model, implementation difficulty, data requirements, and leakage risk. Provide a recommended roadmap for the next development cycle.

Candidate improvements

A. Cross-season expansion (5+ seasons)
B. Strength-of-Schedule (SoS) features (opponent quality, adjusted offense/defense)
C. EMA feature set (PTS, PTS_ALLOWED, WINRATE)
D. Minutes prediction model (see design doc)
E. Travel & fatigue features (distance, timezone, altitude)
F. Feature pruning/consolidation (audit + removal)
G. Lineup/rotation modeling (lineup embeddings, synergy features)
H. Better player availability modeling (injury probabilities, medical timelines)
I. Learned embeddings for players/teams (reduce high-cardinality interactions)
J. Play-by-play derived features (possession-level, clutch metrics)

Ranking methodology

- Expected impact: qualitative estimate (High/Medium/Low) on Win and Score models.
- Implementation difficulty: time & engineering complexity (High/Med/Low).
- Data requirements: minimal vs new data sources (Low/Med/High).
- Leakage risk: how likely a feature is to introduce future info (Low/Med/High).

Prioritization table (summary)

1) Feature pruning & consolidation (F)
  - Win impact: Medium
  - Score impact: Medium
  - Difficulty: Low–Medium
  - Data reqs: Low (existing)
  - Leakage risk: Low
  - Rationale: Low-cost, reduces overfitting, improves interpretability; immediate ROI.

2) Cross-season expansion (A)
  - Win impact: High
  - Score impact: High
  - Difficulty: Medium
  - Data reqs: Medium–High (ingest 5 seasons)
  - Leakage risk: Low (if done correctly)
  - Rationale: More training diversity, better temporal generalization, enables SoS and travel featurization.

3) Minutes prediction model V1 (D)
  - Win impact: High
  - Score impact: High
  - Difficulty: Medium
  - Data reqs: Medium (player-game history, injury flags)
  - Leakage risk: Low–Medium (must use temporal cutoffs)
  - Rationale: Accurate minutes underpin player-level expected production and availability; large downstream benefit.

4) Strength-of-Schedule features (B)
  - Win impact: High
  - Score impact: Medium–High
  - Difficulty: Medium
  - Data reqs: Low–Medium (game results across seasons)
  - Leakage risk: Low (if computed historically)
  - Rationale: Replaces crude opponent proxies with principled adjusted offense/defense; high impact for matchups.

5) Travel & fatigue features (E)
  - Win impact: Medium
  - Score impact: Medium
  - Difficulty: Medium
  - Data reqs: Medium (schedule meta, venue lat/lon, timezone)
  - Leakage risk: Low
  - Rationale: Proven signal in sports analytics; complements minutes and performance models.

6) EMA features (C)
  - Win impact: Medium
  - Score impact: Medium
  - Difficulty: Low
  - Data reqs: Low (existing)
  - Leakage risk: Low
  - Rationale: EMAs capture recency more smoothly than multiple overlapping rolling windows; compact representation.

7) Player availability improvements (H)
  - Win impact: Medium–High
  - Score impact: Medium
  - Difficulty: Medium–High
  - Data reqs: High (accurate injury timelines, third-party reports)
  - Leakage risk: Medium (if using future-dated injury annotations incorrectly)
  - Rationale: Better availability modeling reduces misprediction in close games.

8) Lineup/rotation modeling (G)
  - Win impact: High (for micro-decisions)
  - Score impact: Medium
  - Difficulty: High
  - Data reqs: High (play-by-play lineups, rotations)
  - Leakage risk: Medium
  - Rationale: Captures synergy but requires heavier data and engineering.

9) Embeddings for player/team (I)
  - Win impact: Medium
  - Score impact: Medium
  - Difficulty: Medium
  - Data reqs: Low–Medium
  - Leakage risk: Low
  - Rationale: Reduces cardinality of interaction space; pairs well with tree/NN models.

10) Play-by-play derived features (J)
  - Win impact: Medium
  - Score impact: High (score predict)
  - Difficulty: High
  - Data reqs: High (PBP)
  - Leakage risk: Medium–High (must be careful with time indexing)
  - Rationale: Rich features at possession-level, but costly to maintain.

Recommended roadmap (next 3 cycles)

Cycle 0 (Immediate, 2–4 weeks)
  - Run feature pruning audit and remove low-value features (F).
  - Implement EMA prototypes for PTS/PTS_ALLOWED/WINRATE and compare to existing rollups (C).
  - Prepare ingestion for historical seasons (start A dataset ingestion).

Cycle 1 (Quarter, 8–12 weeks)
  - Implement cross-season ingestion and time-aware feature pipeline (A).
  - Build minutes model data tables and baseline heuristics (D base features).
  - Add SoS feature prototypes using historical team ratings (B simple).

Cycle 2 (Quarter+, 12–16 weeks)
  - Train Minutes Prediction Model V1 and run shadow deploy + downstream impact analysis (D).
  - Integrate travel/fatigue features into minutes & win/score pipelines (E).
  - Upgrade availability modeling with structured injury timeline ingestion (H).

Longer term (6+ months)
  - Lineup/rotation modeling and play-by-play derived features (G & J).
  - Learned embeddings and joint multi-task models (I).

Trade-offs & leakage notes

- Cross-season ingestion has low leakage risk but requires rigorous time-aware rollups.
- Minutes model and availability models must be strictly time-cutoff aware; treat as high-leakage danger if computed incorrectly.
- Play-by-play features are powerful but are the highest engineering cost and have many subtle leakage pitfalls (possession timestamps, stoppage corrections).

Final recommendation (highest ROI first)

1. Feature pruning & EMA prototyping (fast wins).
2. Cross-season expansion (enables many downstream features and stabilizes models).
3. Minutes model V1 (direct high-impact feeder into both Win and Score models).
4. SoS + travel features (complements minutes model and improves matchup reasoning).

End of prioritization.
