from src.ingestion.nba_injury_report import parse_report

SAMPLE = """Injury Report: 10/22/26 08:45 AM
Page 1 of 2
Game Date
Game Time
Matchup
Team
Player Name
Current Status
Reason
10/22/2026
07:00 (ET)
CLE@PHI
Cleveland Cavaliers
Allen, Jarrett
Questionable
Injury/Illness - Right Patellar
Tendinopathy
Diop, Khalifa
Out
Injury/Illness - Left Knee Injury
Management
Philadelphia 76ers
Lively II, Dereck
Out
G League - Two-Way
09:30 (ET)
DEN@OKC
Denver Nuggets
NOT YET SUBMITTED
Oklahoma City Thunder
Topic, Nikola
Out
Injury/Illness - Low Back Surgery
Injury Report: 10/22/26 08:45 AM
Page 2 of 2
10/23/2026
04:00 (ET)
CHI@MIL
Chicago Bulls
NOT YET SUBMITTED
Milwaukee Bucks
NOT YET SUBMITTED
"""


def test_parse_entries_names_and_wrapped_reasons():
    report = parse_report(SAMPLE)
    assert report.published_et == "10/22/26 08:45 AM"
    allen, diop, lively, topic = report.entries
    assert (allen["team"], allen["player_name"], allen["status"]) == ("CLE", "Jarrett Allen", "Questionable")
    assert allen["reason"] == "Injury/Illness - Right Patellar Tendinopathy"
    assert diop["reason"] == "Injury/Illness - Left Knee Injury Management"
    assert lively["player_name"] == "Dereck Lively II" and lively["team"] == "PHI"
    assert topic["matchup"] == "DEN@OKC" and topic["game_time"] == "09:30 (ET)"


def test_not_yet_submitted_teams_are_tracked_per_game():
    report = parse_report(SAMPLE)
    assert not report.submitted("DEN", "OKC", "DEN")
    assert report.submitted("DEN", "OKC", "OKC")
    assert not report.submitted("CHI", "MIL", "CHI") and not report.submitted("CHI", "MIL", "MIL")
    assert report.for_matchup("CHI", "MIL") == []
    assert {e["game_date"] for e in report.entries} == {"10/22/2026"}


def test_display_name_handles_suffix_after_comma():
    from src.ingestion.nba_injury_report import _display_name, _plain

    assert _display_name("Lively II, Dereck") == "Dereck Lively II"
    assert _display_name("Udeh, Jr., Ernest") == "Ernest Udeh Jr."
    assert _plain(_display_name("Udeh, Jr., Ernest")) == _plain("Ernest Udeh Jr.")
