Feature Engineering Audit — Win & Score Models

Summary

This audit identifies redundancy, duplicated information, and weak features in the current feature set used by the Win and Score models (V1 & V2). It recommends an actionable pruning plan and next analysis steps to quantify removable features while preserving predictive power and avoiding leakage.

1) Objectives

- Detect highly correlated features and duplicated signals.
- Find near-zero-importance features via permutation importance and low variance.
- Estimate how many features can be safely removed without measurable performance loss.
- Produce a prioritized action list for feature consolidation and instrumentation.

2) Data and assumptions

- Work on game-level, team-level, lineup-level and player-level features already computed per-game.
- All rolling features must be recomputed with a strict time cutoff relative to the game datetime (no leakage).
- V2 added player availability and expected production features — treat as candidates for redundancy if they correlate strongly with lineup/team signals.

3) Recommended analysis steps (runnable checklist)

- a) Data preparation
  - Ensure a single canonical feature table with columns: game_id, game_datetime (UTC), team_id, opponent_id, home_flag, season, features...
  - Remove duplicates, unify naming (e.g., home_pts vs HOME_PTS).

- b) Correlation & clustering
  - Compute Pearson (for continuous) and Spearman (ranked/non-normal) correlations on training window only.
  - Use distance-based hierarchical clustering on correlation matrix and cut at 0.9/0.95 similarity to identify feature clusters.
  - Visualize clusters with heatmap + dendrogram; label clusters by semantic group (rolling_pts_7, rolling_pts_30, ema_pts_14, season_avg_pts).

- c) Variance & uniqueness checks
  - Identify near-constant features (std ≈ 0) or features with <1% non-zero values.
  - Check cardinality of categorical features (one-hot explosion) — collapse infrequent levels.

- d) Permutation importance and SHAP
  - Run permutation importance (model-agnostic) for Win and Score models independently on validation set.
  - Compute SHAP summary and per-feature interactions to spot redundant signals that collectively matter but individually appear weak.
  - Identify features with near-zero permutation importance across multiple random seeds and folds.

- e) Multicollinearity tests
  - Compute Variance Inflation Factor (VIF) for linear-ish models or for interpretable feature subsets. Flag VIF > 10 as problematic.

- f) Targeted ablation
  - For each correlated cluster, drop entire cluster or representative features and measure impact on: ROC-AUC, Brier, MAE (score targets) using temporally-valid holdout.
  - Use a cost-aware rule: if removing a cluster changes primary metric by <0.1% (relative) and reduces features by >=2%, accept removal.

4) Findings: expected redundancy patterns (based on current project artifacts)

- Rolling windows of similar span (7/14/30) for same metric (PTS, PTS_ALLOWED, USAGE) will be highly correlated. Candidate: keep two per timescale hierarchy (short/medium/long) or an EMA instead.
- Player-level expected production vs aggregated lineup expected production may duplicate signal — prefer storing player-level features and derive lineup features on the fly when needed.
- Team-season aggregate stats (season averages) will be redundant with long-window rolling stats. Keep season_avg only for cold-start; otherwise prefer time-decayed metrics.
- Multiple injury/availability encodings (binary, probability, minutes-adjusted) might duplicate. Standardize to: availability_prob and expected_minutes_adjusted.
- Pairwise interaction features created exhaustively (team_x_player, opponent_x_player) often add high cardinality and low marginal gain; replace with learned interactions (tree models / embedding features).

5) Weak / near-zero importance features to check first

- Rarely present lineup-specific features with <5% coverage.
- Features derived from proxies (e.g., "expected_production_vintage" vs computed expected_production) where original computation exists elsewhere.
- Over-engineered temporal features that are monotonic transformations of others.

6) Estimate of removable features

- Conservative baseline: remove 5–10% immediately (near-constant, duplicated exact copies, misnamed duplicates).
- After clustering + ablation: safe removal of 20–40% of engineered features is plausible (especially redundant rolling windows, exhaustive interactions, and under-powered high-cardinality encodings).
- Realistic target for next cycle: prune ~15–25% with low risk, then re-evaluate.

7) Actionable pruning & consolidation plan (priority order)

- 1. Remove exact duplicates and unused legacy features (immediate).
- 2. Collapse highly-correlated rolling windows: keep short (7), medium (30) and long (season) or swap medium for an EMA — evaluate.
- 3. Replace season-averages for active-season modeling with expanding window stats; retain season_avg for cold-start only.
- 4. Consolidate availability encodings into two features: availability_prob and expected_minutes.
- 5. Replace exhaustive pairwise interactions with low-dimensional learned embeddings (player_id/team_id) if model supports.
- 6. Remove sparse lineup features (<5% coverage) or re-encode them as 'seen_in_last_30_games' flags.

8) Instrumentation & CI

- Add feature-health tests: missingness thresholds, distribution drift alerts (per-season), correlation sanity checks.
- Maintain a feature registry: name, dtype, source, last-update, owner, and leakage-risk flag.
- Add unit tests that re-compute rolling features from historical raw data and assert equality to persisted features (sanity check for pipelines).

9) Expected outcome and verification

- Expected reduction in model size, inference cost, and overfitting risk.
- Verify by re-running backtests with pruned feature sets and measuring primary metrics (win ROC-AUC/Brier, score MAE). Accept prune if metric delta is within noise band and complexity reduced.

10) Next steps (immediate)

- Run correlation clustering and permutation importance on the current latest training window (script + config in /scripts feature_audit).
- Produce a ranked CSV of candidate removals and run targeted ablations using temporal CV.

Appendix: Quick commands & suggested thresholds

- High-correlation cut: |r| >= 0.9 (flag), >= 0.95 (strong candidate for removal).
- Low-importance threshold: permutation importance near 0 across 5 random seeds and folds.
- VIF problematic threshold: > 10.
- Sparsity threshold: feature present in <5% of rows -> re-encode or drop.

End of audit.
