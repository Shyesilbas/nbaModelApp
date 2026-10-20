# NBA ML Project Consolidated Reference Reports

This directory houses the three core premium technical reports that act as the single points of truth for project design, operations, audits, and performance metrics.

## Core Reference Structure

- **[reports/production/model_performance_and_architecture_report.md](file:///Users/serhat/PycharmProjects/nbaModelApp/reports/production/model_performance_and_architecture_report.md)**: Details the active production models (Win Probability V10, Score Prediction V10, Player Prediction V9), mathematical calibration, model structures, features, and chronological validation results.
- **[reports/operations/data_pipeline_architecture_report.md](../reports/operations/data_pipeline_architecture_report.md)**: Explains the data ingestion logic, multi-threading setups, season bootstrapping runbook, roster discovery algorithms (Importance Score), and stint/transaction tracking pipelines.
- **[reports/operations/data_storage_and_delivery_analysis.md](../reports/operations/data_storage_and_delivery_analysis.md)**: Where data is stored (pipeline files, frontend JSON, SQLite), how the frontend loads it, duplicated and unused outputs, and the proposed single-channel (SQLite + API) layout.
