"""Condensed play-by-play "moments" for the game detail view.

Keeps the quarter scores and only the moments that change how the game reads:
- lead changes in the second half, plus ties and go-ahead baskets in clutch time
- clutch baskets (last 5 minutes of Q4/OT, score within 5)
- unanswered scoring runs of 10+ points (ignoring misses), reported once
- milestones at the moment they are crossed (20/30/40 points, double/triple double, ...)
- short bursts of threes and badges at their first tier only
- the final plays and the end of every period
"""

from __future__ import annotations

import re
from typing import Any

CLUTCH_SECONDS = 5 * 60
CLUTCH_MARGIN = 5
RUN_THRESHOLD = 10
THREE_WINDOW_SECONDS = 90
HEAT_CHECK_WINDOW_SECONDS = 240
BIG_LEAD = 12
GAME_WINNER_SECONDS = 30
GAME_WINNER_MARGIN = 3

# Badge tiers: a badge is kept only the first time its value reaches one of these.
BADGE_TIERS = {
    "points this quarter": (15, 20),
    "straight team points": (10, 14),
    "assists created": (8, 10, 12),
    "rebounds secured": (15, 20),
    "blocks": (4, 5),
    "steals": (4, 5),
}
BADGE_PATTERN = re.compile(r"^(\d+) (.+)$")


def norm_game_id(value: Any) -> str:
    text = str(value or "").split(".")[0]
    digits = re.sub(r"\D", "", text)
    return digits.zfill(10)


def parse_clock(clock: str | None) -> int:
    """Seconds left in the period. Accepts "11:32" and the ISO form "PT11M32.00S"."""
    if not clock:
        return 12 * 60
    text = str(clock).strip()
    try:
        if text.startswith("PT") and "M" in text:
            minutes, seconds = text[2:].rstrip("S").split("M", 1)
            return int(minutes) * 60 + int(float(seconds or 0))
        if ":" in text:
            minutes, seconds = text.split(":", 1)
            return int(minutes) * 60 + int(float(seconds))
    except ValueError:
        pass
    return 12 * 60


def elapsed_seconds(period: int, clock_remaining: int) -> int:
    """Game seconds played when the event happened."""
    if period <= 4:
        return (period - 1) * 720 + (720 - clock_remaining)
    return 4 * 720 + (period - 5) * 300 + (300 - clock_remaining)


def is_three_pointer(event: dict[str, Any]) -> bool:
    text = f"{event.get('description') or ''} {event.get('sub_type') or ''}".upper()
    return "3PT" in text or "3-PT" in text


def sign(value: int) -> int:
    return (value > 0) - (value < 0)


def milestone_reasons(event: dict[str, Any]) -> list[str]:
    """Milestones reached by this very event (the stat crosses the threshold now)."""
    before = event.get("player_stats_before")
    after = event.get("player_stats_after")
    if not isinstance(before, dict) or not isinstance(after, dict):
        return []

    def crossed(stat: str, threshold: int) -> bool:
        return int(before.get(stat) or 0) < threshold <= int(after.get(stat) or 0)

    def double_digit_count(stats: dict[str, Any]) -> int:
        return sum(1 for key in ("pts", "reb", "ast", "stl", "blk") if int(stats.get(key) or 0) >= 10)

    reasons: list[str] = []
    for threshold in (20, 30, 40):
        if crossed("pts", threshold):
            reasons.append(f"{threshold}_pt_game")
    if double_digit_count(before) < 2 <= double_digit_count(after):
        reasons.append("double_double")
    if double_digit_count(before) < 3 <= double_digit_count(after):
        reasons.append("triple_double")
    if crossed("ast", 10):
        reasons.append("10_ast")
    if crossed("reb", 15):
        reasons.append("15_reb")
    if crossed("stl", 5):
        reasons.append("5_stl")
    if crossed("blk", 5):
        reasons.append("5_blk")
    return reasons


def first_tier_badges(event: dict[str, Any], seen: set[tuple[Any, ...]]) -> list[str]:
    """Drop badge repeats such as "10", "11", "12 points this quarter": keep each tier once."""
    kept: list[str] = []
    for badge in event.get("badges") or []:
        match = BADGE_PATTERN.match(str(badge))
        if not match:
            kept.append(badge)
            continue
        value, kind = int(match.group(1)), match.group(2)
        tiers = BADGE_TIERS.get(kind)
        if tiers is None:
            kept.append(badge)
            continue
        tier = max((t for t in tiers if t <= value), default=None)
        if tier is None:
            continue
        key = (event.get("player_name"), kind, event.get("period") if kind == "points this quarter" else None, tier)
        if key in seen:
            continue
        seen.add(key)
        kept.append(badge)
    return kept


def game_winner_index(events: list[dict[str, Any]], diffs: list[int]) -> int | None:
    """Index of the basket that made the eventual winner lead for good, if it was late and close."""
    if not events:
        return None
    final_diff = diffs[-1]
    if final_diff == 0 or abs(final_diff) > GAME_WINNER_MARGIN:
        return None
    winner = sign(final_diff)
    last_not_winning = None
    for idx in range(len(diffs) - 1, -1, -1):
        if sign(diffs[idx]) != winner:
            last_not_winning = idx
            break
    if last_not_winning is None:
        return None
    for idx in range(last_not_winning + 1, len(events)):
        if int(events[idx].get("points_scored") or 0) > 0 and sign(diffs[idx]) == winner:
            event = events[idx]
            last_period = int(events[-1].get("period") or 0)
            if int(event.get("period") or 0) == last_period and parse_clock(str(event.get("clock") or "")) <= GAME_WINNER_SECONDS:
                return idx
            return None
    return None


def game_summary(events: list[dict[str, Any]], diffs: list[int], home: str | None, away: str | None) -> dict[str, Any]:
    """Whole-game facts for the header: biggest leads, comeback size and second-half lead changes."""
    largest_home = max([d for d in diffs if d > 0], default=0)
    largest_away = max([-d for d in diffs if d < 0], default=0)
    final_diff = diffs[-1] if diffs else 0
    comeback = 0
    if final_diff > 0:
        comeback = largest_away
    elif final_diff < 0:
        comeback = largest_home
    changes = 0
    prev = 0
    for event, diff in zip(events, diffs):
        if int(event.get("points_scored") or 0) <= 0:
            continue
        if prev and diff and sign(prev) != sign(diff) and int(event.get("period") or 0) >= 3:
            changes += 1
        if diff:
            prev = diff
    winner = home if final_diff > 0 else away if final_diff < 0 else None
    return {
        "largest_lead": {home or "home": largest_home, away or "away": largest_away},
        "comeback_points": comeback if comeback > 0 else 0,
        "comeback_team": winner if comeback > 0 else None,
        "second_half_lead_changes": changes,
    }


def condense_payload(payload: dict[str, Any]) -> dict[str, Any]:
    events = payload.get("events", [])
    home, away = payload.get("home_team"), payload.get("away_team")
    diffs = [int(e.get("score_home") or 0) - int(e.get("score_away") or 0) for e in events]

    last_index_by_period: dict[int, int] = {}
    for idx, event in enumerate(events):
        try:
            last_index_by_period[int(event.get("period") or 0)] = idx
        except (TypeError, ValueError):
            continue

    winner_idx = game_winner_index(events, diffs)
    final_five_start = max(0, len(events) - 5)

    condensed_events: list[dict[str, Any]] = []
    scoring_events = 0
    highlight_events = 0
    seen_badges: set[tuple[Any, ...]] = set()
    peak_home = max([d for d in diffs if d > 0], default=0)
    peak_away = max([-d for d in diffs if d < 0], default=0)
    largest_lead_done: set[str] = set()

    run_team: str | None = None
    run_points = 0
    run_event: dict[str, Any] | None = None
    last_scoring: dict[str, Any] | None = None
    made_threes: dict[str, list[int]] = {}

    for idx, event in enumerate(events):
        period = int(event.get("period") or 0)
        clock_remaining = parse_clock(str(event.get("clock") or ""))
        now = elapsed_seconds(period, clock_remaining) if period > 0 else 0
        pts = int(event.get("points_scored") or 0)
        diff_after = diffs[idx]
        prev_diff = diffs[idx - 1] if idx else 0
        team = event.get("team")
        player = event.get("player_name")
        reasons: list[str] = []
        detail: dict[str, Any] = {}

        if pts > 0:
            scoring_events += 1
            clutch_time = period >= 4 and clock_remaining <= CLUTCH_SECONDS
            close = abs(prev_diff) <= CLUTCH_MARGIN

            if prev_diff != 0 and diff_after != 0 and sign(prev_diff) != sign(diff_after) and period >= 3:
                reasons.append("lead_change")
            if clutch_time and close:
                reasons.append("clutch")
                if prev_diff == 0 and diff_after != 0:
                    reasons.append("go_ahead")
                if prev_diff != 0 and diff_after == 0:
                    reasons.append("game_tie")

            if team:
                if team != run_team:
                    run_team, run_points, run_event = team, 0, None
                run_points += pts
                if run_event is not None:
                    run_event["moment_detail"]["run_points"] = run_points
                if run_points >= RUN_THRESHOLD and run_event is None:
                    reasons.append("team_run")
                    detail["run_team"] = team
                    detail["run_points"] = run_points

                if pts == 3 and is_three_pointer(event):
                    if (
                        last_scoring is not None
                        and last_scoring["team"] == team
                        and last_scoring["three"]
                        and now - last_scoring["time"] <= THREE_WINDOW_SECONDS
                    ):
                        reasons.append("back_to_back_3")
                    if player:
                        recent = [t for t in made_threes.get(player, []) if now - t <= HEAT_CHECK_WINDOW_SECONDS]
                        recent.append(now)
                        if len(recent) >= 3:
                            reasons.append("player_3_run")
                            recent = []
                        made_threes[player] = recent
                last_scoring = {"team": team, "three": pts == 3 and is_three_pointer(event), "time": now}

            if idx == winner_idx:
                reasons.append("game_winner")

        reasons.extend(milestone_reasons(event))

        for lead_team, peak, at_peak in ((home, peak_home, diff_after), (away, peak_away, -diff_after)):
            if lead_team and peak >= BIG_LEAD and at_peak == peak and lead_team not in largest_lead_done:
                largest_lead_done.add(lead_team)
                reasons.append("largest_lead")
                detail["lead_team"] = lead_team
                detail["lead"] = peak

        badges = first_tier_badges(event, seen_badges)
        if badges:
            highlight_events += 1
            reasons.append("badge")

        keep = bool(reasons)
        if idx >= final_five_start:
            keep = True
            reasons = ["final_5"] + reasons
        if idx == last_index_by_period.get(period):
            keep = True
            reasons = sorted(set(reasons + ["quarter_end"]))
        if not keep:
            continue

        slim = {
            "period": event.get("period"),
            "clock": event.get("clock"),
            "action_type": event.get("action_type"),
            "sub_type": event.get("sub_type"),
            "team": team,
            "player_name": player,
            "description": event.get("description"),
            "score_home": event.get("score_home"),
            "score_away": event.get("score_away"),
            "points_scored": event.get("points_scored", 0),
            "badges": badges,
            "moment_reasons": reasons,
        }
        if detail:
            slim["moment_detail"] = detail
        if "team_run" in reasons:
            run_event = slim
        if "player_id" in event:
            slim["player_id"] = event.get("player_id")
        stats = event.get("player_stats_after")
        if isinstance(stats, dict):
            slim["player_stats_after"] = {
                key: stats.get(key) for key in ("pts", "reb", "ast", "stl", "blk", "tov") if key in stats
            }
        condensed_events.append(slim)

    return {
        "game_id": payload.get("game_id"),
        "home_team": home,
        "away_team": away,
        "quarter_scores": payload.get("quarter_scores", []),
        "events": condensed_events,
        "summary": game_summary(events, diffs, home, away),
        "is_condensed": True,
        "source_event_count": len(events),
        "event_count": len(condensed_events),
        "scoring_event_count": scoring_events,
        "highlight_event_count": highlight_events,
    }
