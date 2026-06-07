Next Model Iteration Recommendation

Summary
- Win Probability: Keep Win Probability V1 in production. No change to deployment.
- Score Prediction: Keep Score Prediction V2 in production, continue to display score ranges not exact scores.

EMA features
- Recommended: Run a focused EMA experiment (3/5/10 game spans) using team and opponent PTS, PTS_ALLOWED, and WINRATE. The experimental datasets and scripts are included. EMA features are leakage-free (shifted) by design.
- Rationale: EMAs capture recency with less noise than simple rolling means. Experiments required to quantify gains.

Feature pruning
- Do not prune automatically yet. The audit script produces candidates and correlation clusters. Use the ablation runner to test removal groups and accept only those meeting strict acceptance rules.
- Early candidates: near-constant features, exact duplicates, and strongly correlated groups (|r|>=0.95) are the highest ROI to evaluate.

Redundant groups observed (candidate list)
- Several rolling-sum and rolling-mean pairs show very high correlation; exact list is in reports/feature_correlation_clusters.csv and reports/feature_pruning_candidates.csv.

Next implementation steps (priority)
1. Run: scripts/audit_feature_pruning_candidates.py -> produces candidate CSVs and EMA experimental datasets.
2. Run: scripts/run_feature_pruning_ablation.py -> performs chronological ablation experiments and writes ablation results.
3. Review ablation outputs and accept removals only when criteria are met:
   - Win: ROC-AUC drop <= 0.001 and Brier does not worsen meaningfully.
   - Score: MAE increase <= 0.10 points.
4. If accepted, open PRs that remove groups and include metrics and stability checks; do not change production artifacts until validated on holdout season.

Cross-season expansion
- Scaffold docs created to guide cross-season ingestion and schema. Implement after pruning & EMA experiments.

Recommendation order
1. Experiment with EMA (low effort, medium ROI).
2. Run pruning ablations (medium effort, high ROI if many redundant features exist).
3. Prepare cross-season ingestion (higher engineering cost, high long-term ROI).
4. Defer minutes model until feature quality and cross-season data are stabilized.

Files added/modified
- scripts/audit_feature_pruning_candidates.py
- scripts/run_feature_pruning_ablation.py
- docs/cross_season_expansion_todo.md
- docs/cross_season_schema_design.md

"