# Player Registry 2024-25 Cleanup Report

## 1. Summary of Duplicates Found
During the validation audit of the static `core_players.csv`, we identified **68 duplicate player IDs** that were mapped to multiple teams simultaneously. This bypass was originally used to handle players who transferred during the season, but it violated the single-player-record constraint and caused incorrect attributions in the daily roster snapshot generator.

## 2. Resolution Methodology
To resolve the duplicates without modifying the production environment or training data, we created an experimental registry at [player_registry_2024_25.csv](file:///Users/serhat/agProjects/nbaModelApp/data/experimental/player_registry_2024_25.csv) with the following rules:
- **One Row Per Player**: Grouped all entries by `PLAYER_ID` to ensure uniqueness.
- **Highest Importance Score**: For duplicate player records, the maximum `IMPORTANCE_SCORE` was preserved.
- **Aggregated Known Teams**: Built a unified list of all teams the player was associated with during the 2024-25 season (using both `core_players.csv` and `multi_team_players_2024_25.csv`).
- **Core Status and Duplicate Flags**: Explicitly marked whether the player had duplicate core records and tracked core status.

## 3. Ambiguous Players
Players who changed teams mid-season (like Dennis Schröder or Luka Dončić) remain logically "ambiguous" if we only look at a static list. They are resolved dynamically via observed team-affiliation timeline windows rather than a single static team assignment.

## 4. Why Production Core Players Was Not Modified
- **Production Safety**: Modifying the production [core_players.csv](file:///Users/serhat/agProjects/nbaModelApp/data/production/core_players.csv) directly could break active prediction models or production pipelines that rely on the legacy static layout.
- **Decoupled Development**: Keeping the production files intact and performing validation/reconstruction on experimental registries ensures that we do not promote unvalidated data changes to production.
