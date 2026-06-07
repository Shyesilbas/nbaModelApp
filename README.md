# NBA Model App

## Project Structure

- `models/production`: current production artifacts used by inference and the ML service.
- `models/experimental`: experimental or candidate artifacts that should not be treated as production.
- `models/archive`: retained older artifacts that are no longer active.
- `data/production`: stable production datasets and source-of-truth tables.
- `data/experimental`: datasets used for EMA, pruning, and other experiments.
- `data/archive`: deprecated datasets kept for reference.
- `data/canonical`: canonical reference data for shared cross-season usage.
- `reports/audits`: structural, leakage, readiness, and validation reports.
- `reports/production`: reports tied to production models and deployment.
- `reports/experiments`: experiment result summaries and tuning outputs.
- `reports/archive`: historical reports that should be retained but are no longer active.
- `scripts/training`: training workflows.
- `scripts/inference`: prediction and serving entry points.
- `scripts/features`: feature generation helpers.
- `scripts/experiments`: experiment runners and tuning scripts.
- `scripts/ingest`: ingestion and data preparation scripts.
- `scripts/audit`: validation and audit utilities.
- `scripts/archive`: retired scripts kept for reference.
- `docs/architecture`: system and integration documentation.
- `docs/data`: data schema and cross-season planning docs.
- `docs/experiments`: experiment plans and proposals.
- `docs/archive`: deprecated drafts and retired docs.

The repo keeps legacy top-level paths for compatibility, but new work should prefer the organized structure above.
