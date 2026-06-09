# Final Pre-Merge Audit: 2024-25 Experimental Dataset Verification

This report provides a read-only audit of the generated 2024-25 experimental datasets before any cross-season merge operations.

## 1. Physical File Verification

This section verifies the existence and basic properties of the generated CSV files.

### `team_win_model_ready_v2_2024_25.csv`

*   **`ls -lh` output:**
    ```
    -
    ```
*   **`wc -l` output:**
    ```
    -
    ```

### `team_score_model_ready_v2_2024_25.csv`

*   **`ls -lh` output:**
    ```
    -
    ```
*   **`wc -l` output:**
    ```
    -
    ```

## 2. Dataset Shape Verification

### `team_win_model_ready_v2_2024_25.csv`

*   **Shape:**
*   **First 20 Columns:**
*   **Last 20 Columns:**

### `team_score_model_ready_v2_2024_25.csv`

*   **Shape:**
*   **First 20 Columns:**
*   **Last 20 Columns:**

## 3. Target Validation

### Win Dataset (`WIN`)

*   **Exists:**
*   **Distribution:**

### Score Dataset (`HOME_PTS`, `AWAY_PTS`)

*   **`HOME_PTS` Stats:**
*   **`AWAY_PTS` Stats:**

## 4. Feature Population Audit

### `team_win_model_ready_v2_2024_25.csv`

*   **Top Columns with Missing Values:**
*   **Roster Features Population:**

### `team_score_model_ready_v2_2024_25.csv`

*   **Top Columns with Missing Values:**
*   **Roster Features Population:**

## 5. GAME_ID Integrity Audit

*   **`game_results_2024_25.csv` Unique GAME_IDs:**
*   **`team_win_model_ready_v2_2024_25.csv` Unique GAME_IDs:**
*   **`team_score_model_ready_v2_2024_25.csv` Unique GAME_IDs:**
*   **Win Dataset Duplicate Keys (`GAME_ID`, `TEAM_ABBREVIATION`):**
*   **Score Dataset Duplicate Keys (`GAME_ID`):**
*   **Verdict:**

## 6. Leakage Audit

*   **Result:**

## 7. Feature Parity Audit (vs. 2025-26 Production)

*   **Win Dataset:**
*   **Score Dataset:**
*   **Verdict:**

## 8. Final Verdict

1.  **Do the files physically exist?**
2.  **Are row counts correct?**
3.  **Are targets correct?**
4.  **Are roster features populated?**
5.  **Is GAME_ID integrity valid?**
6.  **Is leakage absent?**
7.  **Is schema parity confirmed?**
8.  **Is 2024-25 genuinely ready for cross-season merge?**

**Confidence Score:** 0/100
