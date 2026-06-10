# AI Compact Game Payload

Use this shape when sending full boxscore/game context to an LLM.

## Why this format

- Short keys reduce prompt tokens.
- Repeated labels are centralized.
- Team and player stats keep only the fields that matter.
- Full names are retained once for readability.

## Example shape

```json
{
  "gid": "20251225-LAL-BOS-001",
  "s": "2025-2026",
  "st": "Regular Season",
  "dt": "2025-12-25",
  "tm": "20:00 EST",
  "status": "Final",
  "arena": { "n": "Crypto.com Arena", "c": "Los Angeles", "s": "CA" },
  "teams": {
    "h": { "id": "LAL", "n": "Los Angeles Lakers", "c": "Los Angeles", "sc": 118, "q": [30, 28, 32, 28] },
    "a": { "id": "BOS", "n": "Boston Celtics", "c": "Boston", "sc": 112, "q": [25, 30, 29, 28] }
  },
  "stats": [
    { "id": "LAL", "fgm": 45, "fga": 90, "fgp": 0.5, "fg3m": 15, "fg3a": 35, "fg3p": 0.429, "ftm": 13, "fta": 16, "ftp": 0.813, "reb": 48, "oreb": 12, "dreb": 36, "ast": 28, "stl": 9, "blk": 6, "tov": 10, "pf": 18, "fbp": 20, "pip": 50, "scp": 15, "bench": 35 },
    { "id": "BOS", "fgm": 40, "fga": 88, "fgp": 0.455, "fg3m": 12, "fg3a": 38, "fg3p": 0.316, "ftm": 20, "fta": 24, "ftp": 0.833, "reb": 42, "oreb": 9, "dreb": 33, "ast": 25, "stl": 7, "blk": 4, "tov": 14, "pf": 20, "fbp": 15, "pip": 44, "scp": 10, "bench": 28 }
  ],
  "players": [
    { "id": "LAL-23", "n": "LeBron James", "t": "LAL", "p": "SF", "min": "38:15", "pts": 32, "reb": 9, "ast": 12, "stl": 2, "blk": 1, "tov": 3, "pf": 2, "fgm": 12, "fga": 22, "fgp": 0.545, "fg3m": 4, "fg3a": 8, "fg3p": 0.5, "ftm": 4, "fta": 5, "ftp": 0.8, "pm": "+8", "oreb": 1, "dreb": 8 }
  ],
  "leaders": {
    "pts": { "id": "LAL-23", "n": "LeBron James", "t": "LAL", "v": 32 },
    "reb": { "id": "LAL-3", "n": "Anthony Davis", "t": "LAL", "v": 15 },
    "ast": { "id": "LAL-23", "n": "LeBron James", "t": "LAL", "v": 12 }
  },
  "officials": [
    { "id": "OFF-1", "n": "Marc Davis" }
  ]
}
```

## Usage

```python
from src.processing import compact_game_payload

compact = compact_game_payload(full_game_payload, top_players=8)
```

## Prompting rule

Ask the model to treat:

- `teams.h` as home
- `teams.a` as away
- `stats` as team boxscore rows
- `players` as top player rows only
- `leaders` as the summary anchors

