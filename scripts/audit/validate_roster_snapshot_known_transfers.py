import pandas as pd
import numpy as np
import os
import sys

def main() -> None:
    """
    Validate the roster snapshot generator output for known superstar transfer cases.
    Creates:
    - reports/audits/roster_snapshot_known_transfer_validation.csv
    - reports/audits/roster_snapshot_known_transfer_validation_report.md
    """
    events_path = "data/experimental/observed_affiliation_events_2024_25.csv"
    if not os.path.exists(events_path):
        print(f"Error: {events_path} does not exist. Run build_observed_affiliation_events.py first.")
        sys.exit(1)

    events_df = pd.read_csv(events_path)

    # Expected timelines from multi_team_players_2024_25.csv
    expected_timelines = {
        1629029: [
            {"team": "DAL", "start": "2024-10-24", "end": "2024-12-25"},
            {"team": "LAL", "start": "2025-02-10", "end": "2025-04-30"}
        ],
        203076: [
            {"team": "LAL", "start": "2024-10-22", "end": "2025-01-28"},
            {"team": "DAL", "start": "2025-02-08", "end": "2025-04-18"}
        ],
        202710: [
            {"team": "MIA", "start": "2024-10-23", "end": "2025-01-21"},
            {"team": "GSW", "start": "2025-02-08", "end": "2025-05-14"}
        ],
        1628368: [
            {"team": "SAC", "start": "2024-10-24", "end": "2025-02-01"},
            {"team": "SAS", "start": "2025-02-05", "end": "2025-03-12"}
        ],
        203471: [
            {"team": "BKN", "start": "2024-10-23", "end": "2024-12-13"},
            {"team": "GSW", "start": "2024-12-19", "end": "2025-02-03"},
            {"team": "DET", "start": "2025-02-09", "end": "2025-05-01"}
        ],
        203897: [
            {"team": "CHI", "start": "2024-10-23", "end": "2025-01-27"},
            {"team": "SAC", "start": "2025-02-05", "end": "2025-04-16"}
        ],
        203952: [
            {"team": "GSW", "start": "2024-10-23", "end": "2025-02-03"},
            {"team": "MIA", "start": "2025-02-10", "end": "2025-04-28"}
        ]
    }

    names = {
        1629029: "Luka Doncic",
        203076: "Anthony Davis",
        202710: "Jimmy Butler",
        1628368: "De'Aaron Fox",
        203471: "Dennis Schroder",
        203897: "Zach LaVine",
        203952: "Andrew Wiggins"
    }

    validation_results = []
    all_passed = True

    for pid, expected_stints in expected_timelines.items():
        pname = names[pid]
        p_events = events_df[events_df["player_id"] == pid].sort_values(by="start_date")
        
        reconstructed_stints = []
        for _, row in p_events.iterrows():
            reconstructed_stints.append({
                "team": row["team_abbreviation"],
                "start": row["start_date"],
                "end": row["end_date"]
            })
            
        # Match each stint
        for i, exp in enumerate(expected_stints):
            passed = False
            recon_team = "N/A"
            recon_start = "N/A"
            recon_end = "N/A"
            reason = ""
            
            if i < len(reconstructed_stints):
                recon = reconstructed_stints[i]
                recon_team = recon["team"]
                recon_start = recon["start"]
                recon_end = recon["end"] if pd.notna(recon["end"]) else "OPEN"
                
                # Check team and start_date match
                team_match = recon_team == exp["team"]
                start_match = recon_start == exp["start"]
                
                # For end_date, if it's the last expected stint and reconstructed end is open, it is a match
                is_last = (i == len(expected_stints) - 1)
                if is_last and (recon["end"] is None or pd.isna(recon["end"])):
                    end_match = True
                else:
                    end_match = recon["end"] == exp["end"]
                    
                if team_match and start_match and end_match:
                    passed = True
                else:
                    reasons = []
                    if not team_match:
                        reasons.append(f"Team mismatch (expected {exp['team']}, got {recon_team})")
                    if not start_match:
                        reasons.append(f"Start date mismatch (expected {exp['start']}, got {recon_start})")
                    if not end_match:
                        reasons.append(f"End date mismatch (expected {exp['end']}, got {recon_end})")
                    reason = "; ".join(reasons)
            else:
                reason = "Reconstructed stint missing entirely"

            if not passed:
                all_passed = False

            validation_results.append({
                "player_id": pid,
                "player_name": pname,
                "stint_index": i + 1,
                "expected_team": exp["team"],
                "expected_start": exp["start"],
                "expected_end": exp["end"],
                "reconstructed_team": recon_team,
                "reconstructed_start": recon_start,
                "reconstructed_end": recon_end,
                "status": "PASS" if passed else "FAIL",
                "details": reason
            })

    # Save to CSV
    val_df = pd.DataFrame(validation_results)
    os.makedirs("reports/audits", exist_ok=True)
    val_csv_path = "reports/audits/roster_snapshot_known_transfer_validation.csv"
    val_df.to_csv(val_csv_path, index=False)
    print(f"Generated validation CSV at {val_csv_path}")

    # Generate validation report markdown
    report_markdown_path = "reports/audits/roster_snapshot_known_transfer_validation_report.md"
    
    with open(report_markdown_path, "w", encoding="utf-8") as f:
        f.write("# Roster Snapshot Known Transfer Validation Report\n\n")
        f.write("## 1. Validation Verdict\n\n")
        verdict = "PASS" if all_passed else "FAIL"
        f.write(f"**Overall Verdict:** **{verdict}**\n\n")
        f.write("This report validates that the reconstructed player affiliation stints for the 7 target players match the expected historical timelines derived from game logs.\n\n")
        f.write("## 2. Validation Results Table\n\n")
        f.write("| Player Name | Stint | Expected Team | Expected Start | Expected End | Reconstructed Team | Reconstructed Start | Reconstructed End | Status | Details |\n")
        f.write("| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |\n")
        for res in validation_results:
            status_style = f"**{res['status']}**" if res["status"] == "PASS" else f"**{res['status']}**"
            f.write(f"| {res['player_name']} | {res['stint_index']} | {res['expected_team']} | {res['expected_start']} | {res['expected_end']} | {res['reconstructed_team']} | {res['reconstructed_start']} | {res['reconstructed_end']} | {status_style} | {res['details']} |\n")
            
    print(f"Generated validation report at {report_markdown_path}")

    if not all_passed:
        print("Validation FAIL: Some target stints were reconstructed incorrectly.")
        sys.exit(1)
    else:
        print("Validation PASS: All target stints were reconstructed correctly!")
        sys.exit(0)

if __name__ == "__main__":
    main()
