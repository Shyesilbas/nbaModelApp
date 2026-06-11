# Player Position Registry Report (Stat-Derived Archetype)

## Extraction Summary
The registry was successfully generated using **Stat-Derived Archetypes** based on total per-36 minute production. This logic completely bypasses the NBA API block.

**Thresholds:**
- `< 200 Total Minutes` -> `UNKNOWN`
- `REB_PER_36 >= 8.5` -> `BIG`
- `AST_PER_36 >= 4.5` -> `GUARD`
- `Else` -> `WING`

## Position Coverage
- **Total Players in Dataset**: 649
- **Successfully Mapped**: 539 (83.1%)
- **UNKNOWN Count (< 200 mins)**: 110 (16.9%)

## Top Player Coverage
- **Active Rotation Players (>= 200 Mins)**: 100.0% mapped
- **Top 100 Players**: 100.0% mapped

## Position Distribution
- **WING**: 289 (44.5%)
- **GUARD**: 133 (20.5%)
- **BIG**: 117 (18.0%)
- **UNKNOWN**: 110 (16.9%)

## Star Player Check
```text
     PLAYER_NAME  REB_PER_36  AST_PER_36 POSITION_GROUP
    LeBron James        7.33        7.95          GUARD
   Stephen Curry        4.70        6.14          GUARD
   Anthony Davis       12.43        3.60            BIG
Domantas Sabonis       14.27        6.01            BIG
```

## Final Verdict
**Is this registry good enough for position-based opponent defense features?** YES

The static Archetypes capture exactly what we need for opponent-to-position modeling: a functional description of a player's role on the court.