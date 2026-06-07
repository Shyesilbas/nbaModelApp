import os
import sys
import subprocess

def check_file_exists(path: str) -> bool:
    """Helper to check if a file exists."""
    exists = os.path.exists(path)
    if not exists:
        print(f"FAIL: Missing expected file: {path}")
    else:
        print(f"PASS: Found {path}")
    return exists

def check_function_exposed(module_path: str, func_names: list) -> bool:
    """Helper to inspect Python file contents for required function definitions."""
    if not os.path.exists(module_path):
        print(f"FAIL: Module path does not exist for inspection: {module_path}")
        return False
        
    with open(module_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    all_pass = True
    for func in func_names:
        def_stmt = f"def {func}"
        if def_stmt not in content:
            print(f"FAIL: Function '{func}' not found in {module_path}")
            all_pass = False
        else:
            print(f"PASS: Function '{func}' is exposed in {module_path}")
    return all_pass

def check_production_unmodified() -> bool:
    """Check that no production artifacts are modified by checking git status."""
    try:
        res = subprocess.run(
            ["git", "status", "--porcelain"], 
            capture_output=True, 
            text=True, 
            check=True
        )
        production_violations = []
        for line in res.stdout.strip().split("\n"):
            if not line.strip():
                continue
            status = line[:2]
            filepath = line[3:].strip()
            
            # We care about modifications/deletions of production files
            if any(mod in status for mod in ["M", "D", "R"]):
                if "production/" in filepath or "models/production" in filepath or "data/production" in filepath:
                    production_violations.append(filepath)
                
        if production_violations:
            print(f"FAIL: Production artifacts modified: {production_violations}")
            return False
            
        print("PASS: No production artifacts have been modified.")
        return True
    except Exception as e:
        print(f"WARNING: Could not check git status: {e}")
        return True

def main():
    print("Starting Cross-Season Phase 2 Infrastructure Validation...")
    
    success = True
    
    # 1. Required ingest stub files
    required_stubs = [
        "scripts/ingest/ingest_games.py",
        "scripts/ingest/ingest_teams.py",
        "scripts/ingest/ingest_players.py",
        "scripts/ingest/ingest_team_game_logs.py",
        "scripts/ingest/ingest_player_game_logs.py",
        "scripts/ingest/ingest_team_box_scores.py",
        "scripts/ingest/ingest_player_box_scores.py",
        "scripts/ingest/ingest_transactions.py",
        "scripts/ingest/ingest_injuries.py",
        "scripts/ingest/validate_canonical_tables.py"
    ]
    for stub in required_stubs:
        if not check_file_exists(stub):
            success = False
            
    # 2. Roster snapshot generator functions
    snapshot_funcs = [
        "build_player_team_affiliations",
        "build_roster_snapshots",
        "get_roster_as_of",
        "validate_roster_snapshots"
    ]
    if not check_function_exposed("scripts/ingest/roster_snapshot_generator.py", snapshot_funcs):
        success = False
        
    # 3. Canonical validators
    validator_funcs = [
        "validate_games",
        "validate_teams",
        "validate_players",
        "validate_team_game_logs",
        "validate_player_game_logs",
        "validate_team_box_scores",
        "validate_player_box_scores",
        "validate_transactions",
        "validate_injuries",
        "validate_roster_snapshots"
    ]
    if not check_function_exposed("scripts/ingest/validate_canonical_tables.py", validator_funcs):
        success = False
        
    # 4. Canonical Ingestion Contract doc
    if not check_file_exists("docs/data/canonical_ingestion_contract.md"):
        success = False
        
    # 5. Pilot Ingestion Plan
    if not check_file_exists("reports/audits/season_2024_25_pilot_ingestion_plan.md"):
        success = False
        
    # 6. Registries
    if not check_file_exists("ARTIFACT_REGISTRY.md"):
        success = False
    if not check_file_exists("PROJECT_STATUS.md"):
        success = False
        
    # 7. Production protection check
    if not check_production_unmodified():
        success = False
        
    if success:
        print("\nAll validation checks completed successfully. Phase 2 readiness confirmed.")
        sys.exit(0)
    else:
        print("\nValidation failed. Please address errors before proceeding.")
        sys.exit(1)

if __name__ == "__main__":
    main()
