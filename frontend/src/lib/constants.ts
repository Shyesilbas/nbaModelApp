/**
 * Centralized Application Constants & Configuration
 * Provides single source of truth for seasons, dates, and API defaults across the frontend.
 */

export const CURRENT_SEASON = "2026-27";
export const DEFAULT_HISTORICAL_SEASON = "2025-26";
export const MIN_PREDICTION_DATE = "2026-10-01";

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8001"
).replace(/\/$/, "");

export const API_DATA_TOKEN = import.meta.env.VITE_DATA_API_TOKEN || "";
