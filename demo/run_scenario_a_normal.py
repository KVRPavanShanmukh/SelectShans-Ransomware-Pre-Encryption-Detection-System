"""
SelectShans Demo — Scenario A: Normal Benign Activity
Simulates typical user operations:
- Creating text files with standard content
- Modifying text files with normal text
- Creating subdirectories
- Copying ordinary documents
Expected Outcome:
- Risk remains LOW (or NONE)
- Zero false CRITICAL or HIGH alerts
"""
import os
import sys
import time
import shutil

# Include detector package
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PKG_DIR = os.path.join(ROOT_DIR, "backend", "detector_package")
if PKG_DIR not in sys.path:
    sys.path.insert(0, PKG_DIR)

from engine import BehavioralDetectionEngine
from canary import SafeCanaryManager

DEMO_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_protected_folder")


def run_scenario_a():
    print("=" * 65)
    print("  SCENARIO A: Normal Benign User Activity Simulation")
    print("=" * 65)
    print(f"Target Directory : {DEMO_FOLDER}\n")

    os.makedirs(DEMO_FOLDER, exist_ok=True)
    canary_mgr = SafeCanaryManager(instance_id="demo_canary")
    engine = BehavioralDetectionEngine(
        monitored_directory=DEMO_FOLDER,
        time_window_seconds=10.0,
        threshold_rename=5,
        threshold_write=10,
        threshold_delete=8,
        entropy_threshold=7.2,
        alert_cooldown_seconds=1.0,
        canary_manager=canary_mgr
    )

    decisions = []

    # 1. Create subfolders
    print("[STEP 1] Creating ordinary subdirectories...")
    docs_dir = os.path.join(DEMO_FOLDER, "documents")
    reports_dir = os.path.join(DEMO_FOLDER, "reports")
    os.makedirs(docs_dir, exist_ok=True)
    os.makedirs(reports_dir, exist_ok=True)
    print("         Created /documents and /reports")

    # 2. Create normal text documents
    print("\n[STEP 2] Creating standard plain-text documents...")
    file1 = os.path.join(docs_dir, "meeting_notes.txt")
    with open(file1, "w", encoding="utf-8") as f:
        f.write("Weekly Team Sync Notes\n1. Project review\n2. Q3 milestones\n3. Action items.\n")
    d1 = engine.process_file_created(file1)
    if d1:
        decisions.append(d1)
    print(f"         Created: {os.path.basename(file1)} (Engine result: {d1.severity if d1 else 'LOW/NONE'})")

    file2 = os.path.join(reports_dir, "summary.txt")
    with open(file2, "w", encoding="utf-8") as f:
        f.write("Monthly summary report for Department Operations. All systems normal.\n")
    d2 = engine.process_file_created(file2)
    if d2:
        decisions.append(d2)
    print(f"         Created: {os.path.basename(file2)} (Engine result: {d2.severity if d2 else 'LOW/NONE'})")

    # 3. Edit an existing file with ordinary text
    print("\n[STEP 3] Modifying existing document with normal English sentences...")
    time.sleep(0.1)
    with open(file1, "a", encoding="utf-8") as f:
        f.write("4. Additional updates regarding deployment checklist.\n")
    d3 = engine.process_file_modified(file1)
    if d3:
        decisions.append(d3)
    print(f"         Modified: {os.path.basename(file1)} (Engine result: {d3.severity if d3 else 'LOW/NONE'})")

    # 4. Copy ordinary document
    print("\n[STEP 4] Copying an ordinary document...")
    file_copy = os.path.join(docs_dir, "meeting_notes_backup.txt")
    shutil.copy2(file1, file_copy)
    d4 = engine.process_file_created(file_copy)
    if d4:
        decisions.append(d4)
    print(f"         Copied to: {os.path.basename(file_copy)} (Engine result: {d4.severity if d4 else 'LOW/NONE'})")

    # Summary and verification
    print("\n" + "-" * 65)
    print("VERIFICATION & SAFETY RESULTS:")
    critical_or_high = [d for d in decisions if d and d.severity in ("CRITICAL", "HIGH")]

    if critical_or_high:
        print(f"FAILED: Unexpected elevated alerts triggered on benign activity!")
        for alert in critical_or_high:
            print(f"  - [{alert.severity}] {alert.category}: {alert.details}")
        return False
    else:
        print("PASS: Zero false-positive CRITICAL or HIGH alerts.")
        print("      Normal activity evaluated as LOW risk or ignored as expected.")
        print("=" * 65)
        return True


if __name__ == "__main__":
    success = run_scenario_a()
    sys.exit(0 if success else 1)
