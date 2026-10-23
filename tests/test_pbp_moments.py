from src.frontend_store.pbp_moments import condense_payload, elapsed_seconds, parse_clock


def ev(period, clock, team, pts, home, away, player="P", before=None, after=None, badges=None, desc="Made Shot"):
    event = {
        "period": period,
        "clock": clock,
        "team": team,
        "player_name": player,
        "action_type": "Made Shot" if pts else "Missed Shot",
        "sub_type": "",
        "description": desc,
        "points_scored": pts,
        "score_home": home,
        "score_away": away,
        "badges": badges or [],
    }
    if before is not None:
        event["player_stats_before"] = before
        event["player_stats_after"] = after
    return event


def reasons(payload):
    return [[r for r in e["moment_reasons"] if r not in ("final_5", "quarter_end")] for e in payload["events"]]


def payload(events):
    return {"game_id": "1", "home_team": "HOM", "away_team": "AWY", "quarter_scores": [], "events": events}


def filler(n=6):
    return [ev(4, "00:01", "HOM", 0, 90, 90, desc="Missed Shot") for _ in range(n)]


def test_clock_formats():
    assert parse_clock("11:32") == 11 * 60 + 32
    assert parse_clock("PT04M05.00S") == 4 * 60 + 5
    assert elapsed_seconds(1, 720) == 0
    assert elapsed_seconds(5, 300) == 4 * 720


def test_first_half_lead_changes_are_ignored_second_half_kept():
    events = [
        ev(1, "10:00", "HOM", 2, 2, 0),
        ev(1, "09:00", "AWY", 3, 2, 3),
        ev(1, "08:00", "HOM", 2, 4, 3),
        ev(3, "10:00", "AWY", 3, 4, 6),
        ev(3, "09:00", "HOM", 3, 7, 6),
    ] + filler()
    out = condense_payload(payload(events))
    flagged = [(e["period"], e["clock"]) for e in out["events"] if "lead_change" in e["moment_reasons"]]
    assert flagged == [(3, "10:00"), (3, "09:00")]


def test_clutch_needs_late_close_game():
    close = condense_payload(payload([ev(4, "05:30", "AWY", 0, 90, 90), ev(4, "04:00", "HOM", 2, 92, 90)] + filler()))
    assert any("clutch" in e["moment_reasons"] for e in close["events"] if e["clock"] == "04:00")
    blowout = condense_payload(payload([ev(4, "05:30", "AWY", 0, 110, 90), ev(4, "04:00", "HOM", 2, 112, 90)] + filler()))
    assert all("clutch" not in e["moment_reasons"] for e in blowout["events"])


def test_unanswered_run_reported_once_with_final_size():
    events = [
        ev(2, "10:00", "HOM", 3, 3, 0),
        ev(2, "09:30", "HOM", 2, 5, 0),
        ev(2, "09:00", "HOM", 3, 8, 0),
        ev(2, "08:30", "HOM", 2, 10, 0),
        ev(2, "08:00", "HOM", 3, 13, 0),
        ev(2, "07:30", "HOM", 2, 15, 0),
        ev(2, "07:00", "AWY", 2, 15, 2),
    ] + filler()
    out = condense_payload(payload(events))
    runs = [e for e in out["events"] if "team_run" in e["moment_reasons"]]
    assert len(runs) == 1
    assert runs[0]["moment_detail"]["run_points"] == 15
    assert runs[0]["moment_detail"]["run_team"] == "HOM"


def test_milestones_fire_only_when_crossed():
    base = {"pts": 0, "reb": 0, "ast": 0, "stl": 0, "blk": 0}
    events = [
        ev(2, "10:00", "HOM", 2, 2, 0, before={**base, "pts": 18}, after={**base, "pts": 20}),
        ev(2, "09:00", "HOM", 2, 4, 0, before={**base, "pts": 20}, after={**base, "pts": 22}),
        ev(2, "08:00", "HOM", 2, 6, 0, before={**base, "pts": 22}, after={**base, "pts": 24}),
    ] + filler()
    out = condense_payload(payload(events))
    assert sum("20_pt_game" in r for r in reasons(out)) == 1


def test_double_double_once_and_badge_tiers_collapse():
    base = {"pts": 0, "reb": 0, "ast": 0, "stl": 0, "blk": 0}
    events = [
        ev(1, "10:00", "HOM", 2, 2, 0, before={**base, "pts": 8, "reb": 10}, after={**base, "pts": 10, "reb": 10}),
        ev(1, "09:00", "HOM", 2, 4, 0, before={**base, "pts": 10, "reb": 10}, after={**base, "pts": 12, "reb": 10}),
        ev(1, "08:00", "HOM", 2, 6, 0, badges=["15 points this quarter"]),
        ev(1, "07:00", "HOM", 2, 8, 0, badges=["16 points this quarter"]),
        ev(1, "06:00", "HOM", 2, 10, 0, badges=["17 points this quarter"]),
    ] + filler()
    out = condense_payload(payload(events))
    assert sum("double_double" in r for r in reasons(out)) == 1
    assert sum(len(e["badges"]) for e in out["events"]) == 1


def test_game_winner_and_summary():
    events = [
        ev(4, "05:00", "AWY", 2, 80, 82),
        ev(4, "00:10", "HOM", 3, 83, 82),
        ev(4, "00:01", "AWY", 0, 83, 82, desc="Missed Shot"),
    ] + filler(5)
    for e in events[3:]:
        e["score_home"], e["score_away"] = 83, 82
    out = condense_payload(payload(events))
    winners = [e for e in out["events"] if "game_winner" in e["moment_reasons"]]
    assert len(winners) == 1 and winners[0]["clock"] == "00:10"
    assert out["summary"]["second_half_lead_changes"] >= 1
