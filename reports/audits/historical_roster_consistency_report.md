# Historical Roster Consistency Audit - 2024-25 Season

## Executive Summary

An audit of player roster movements was performed for the 2024-25 pilot season to evaluate the validity of the current static core players assumption. The findings reveal a significant number of mid-season team transfers, highlighting a critical flaw in models that assume static player-to-team affiliations.

*   **Total Players Appearing for Multiple Teams in 24-25:** 82
*   **Active Core Players Affected:** 51 (out of 516 unique players in `core_players.csv`)
*   **Duplicate Players inside the static `core_players.csv` itself:** 68 players listed under multiple teams.

### Estimated Severity Level: HIGH

> [!IMPORTANT]
> The severity of this issue is classified as **HIGH**. Assuming static rosters causes incorrect player stats mapping, features leakage across dates, and downstream model prediction distortion for team-level features. The fact that superstar players like **Luka Dončić** and **Anthony Davis** moved teams mid-season means that any model using static affiliations will attribute their production to the wrong team for major parts of the season.

---

## 1. Top Transferred Players

The following players had the most team affiliation changes (stints) during the 2024-25 season:

| Player Name | Player ID | Transfers | Stints Timeline & Game Counts |
| :--- | :--- | :--- | :--- |
| Colin Castleton | 1630658 | 3 | MEM (10g: 2024-10-31 to 2024-12-31) -> TOR (10g: 2025-03-07 to 2025-03-24) -> PHI (5g: 2025-04-03 to 2025-04-11) -> TOR (1g: 2025-04-13 to 2025-04-13) |
| David Roddy | 1631223 | 2 | ATL (27g: 2024-10-27 to 2025-01-30) -> PHI (3g: 2025-02-20 to 2025-02-24) -> HOU (3g: 2025-04-09 to 2025-04-13) |
| MarJon Beauchamp | 1630699 | 2 | MIL (26g: 2024-10-23 to 2025-02-05) -> LAC (3g: 2025-02-08 to 2025-02-23) -> NYK (6g: 2025-03-10 to 2025-04-13) |
| Elfrid Payton | 203901 | 2 | NOP (7g: 2024-11-20 to 2024-12-02) -> CHA (6g: 2025-02-09 to 2025-02-24) -> NOP (11g: 2025-03-21 to 2025-04-13) |
| Dennis Schröder | 203471 | 2 | BKN (23g: 2024-10-23 to 2024-12-13) -> GSW (24g: 2024-12-19 to 2025-02-03) -> DET (34g: 2025-02-09 to 2025-05-01) |

---

## 2. Most Impactful Transfers

The following are the transfers of the highest-rated core players (sorted by `importance_score`):

| Player Name | Player ID | Importance Score | Core Team in File | Actual 2024-25 Stints |
| :--- | :--- | :--- | :--- | :--- |
| Luka Dončić | 1629029 | 62.66 | LAL | DAL (22g: 2024-10-24 to 2024-12-25) -> LAL (33g: 2025-02-10 to 2025-04-30) |
| Anthony Davis | 203076 | 44.85 | DAL | LAL (42g: 2024-10-22 to 2025-01-28) -> DAL (11g: 2025-02-08 to 2025-04-18) |
| Kevin Porter Jr. | 1629645 | 43.01 | MIL | LAC (45g: 2024-10-23 to 2025-02-04) -> MIL (35g: 2025-02-10 to 2025-04-29) |
| Jimmy Butler III | 202710 | 42.82 | GSW | MIA (25g: 2024-10-23 to 2025-01-21) -> GSW (42g: 2025-02-08 to 2025-05-14) |
| De'Aaron Fox | 1628368 | 40.91 | SAS | SAC (45g: 2024-10-24 to 2025-02-01) -> SAS (17g: 2025-02-05 to 2025-03-12) |
| Zach LaVine | 203897 | 38.38 | SAC | CHI (42g: 2024-10-23 to 2025-01-27) -> SAC (33g: 2025-02-05 to 2025-04-16) |
| Andrew Wiggins | 203952 | 35.59 | MIA | GSW (43g: 2024-10-23 to 2025-02-03) -> MIA (23g: 2025-02-10 to 2025-04-28) |
| Jusuf Nurkić | 203994 | 34.17 | UTA | PHX (25g: 2024-10-23 to 2025-01-07) -> CHA (26g: 2025-02-12 to 2025-04-13) |
| Tre Jones | 1630200 | 33.74 | CHI | SAS (28g: 2024-10-24 to 2025-02-01) -> CHI (18g: 2025-02-08 to 2025-03-20) |
| Dennis Schröder | 203471 | 31.98 | CLE, SAC | BKN (23g: 2024-10-23 to 2024-12-13) -> GSW (24g: 2024-12-19 to 2025-02-03) -> DET (34g: 2025-02-09 to 2025-05-01) |

---

## 3. Core Players Duplication and Assumption Failures

The static roster assumption in `core_players.csv` is broken in two primary ways:

### A. Mid-Season Trades (Roster Timeline Shifts)
Players listed under one team actually played for another for a large portion of the season. For example, **Luka Dončić** is listed under `LAL` in the static file but played 22 games for `DAL` before moving to `LAL` for 33 games. 

### B. Duplicate Entries in `core_players.csv`
There are **{total_dups_in_core}** players listed under multiple teams in `core_players.csv` to bypass the single-team restriction of the static script. Examples of these duplications:
- **Trae Young** (1629027): listed under ATL, WAS
- **CJ McCollum** (203468): listed under ATL, WAS
- **Kristaps Porziņģis** (204001): listed under ATL, GSW
- **Jonathan Kuminga** (1630228): listed under ATL, GSW
- **Jock Landale** (1629111): listed under ATL, MEM
- **Vít Krejčí** (1630249): listed under ATL, POR
- **Luke Kennard** (1628379): listed under ATL, LAL
- **Corey Kispert** (1630557): listed under ATL, WAS
- **Gabe Vincent** (1629216): listed under ATL, LAL
- **RayJ Dennis** (1642484): listed under ATL, IND, LAC
- **Tony Bradley** (1628396): listed under ATL, IND
- **Christian Koloko** (1631132): listed under ATL, LAL, MEM
- **Buddy Hield** (1627741): listed under ATL, GSW
- **Cam Thomas** (1630560): listed under BKN, MIL
- **Josh Minott** (1631169): listed under BKN, BOS

---

## 4. Key Recommendations

1.  **Transition to Dynamic Roster Snapshots:** Deprecate static team affiliations in favor of transaction-aware daily roster snapshots generated by `roster_snapshot_generator.py`.
2.  **Date-bounded Feature Aggregations:** Ensure player-level statistics are mapped using the date-bounded team affiliation window to prevent data leakage and wrong-team feature attribution.
3.  **Resolve Core Players Duplicates:** Rebuild `core_players.csv` to be a unique registry of players with their canonical identifiers, separating their historical team affiliations into a relational lookup table.
