# NBA ML Project Consolidated Reference Reports

This directory houses the three core premium technical reports that act as the single points of truth for project design, operations, audits, and performance metrics.

## Core Reference Structure

- **[reports/production/model_performance_and_architecture_report.md](file:///Users/serhat/agProjects/nbaModelApp/reports/production/model_performance_and_architecture_report.md)**: Details the active production models (Win Probability V9, Score Prediction V9, Player Prediction V9), mathematical calibration, model structures, features, and chronological validation results.
- **[reports/production/v8_vs_v9_model_comparisons.md](file:///Users/serhat/agProjects/nbaModelApp/reports/production/v8_vs_v9_model_comparisons.md)**: Direct metrics and performance comparisons between V8 and V9 models with technical details on feature adjustments and calibration methods.
- **[reports/operations/data_pipeline_architecture_report.md](file:///Users/serhat/agProjects/nbaModelApp/reports/operations/data_pipeline_architecture_report.md)**: Explains the data ingestion logic, multi-threading setups, season bootstrapping runbook, roster discovery algorithms (Importance Score), and stint/transaction tracking pipelines.
- **[reports/audits/feature_engineering_flaws_audit_report.md](file:///Users/serhat/agProjects/nbaModelApp/reports/audits/feature_engineering_flaws_audit_report.md)**: Acts as the primary Quality Control ledger tracking feature engineering gaps, venue alignment issues, and training-inference parity.
