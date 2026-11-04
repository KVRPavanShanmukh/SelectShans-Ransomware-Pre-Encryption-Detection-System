"""
SelectShans Demo — Scenario C: Rapid File Changes & Burst Heuristics
Demonstrates:
- High-frequency file renaming bursts exceeding configured threshold (5)
- Sliding-window frequency aggregation
- Multi-signal event correlation (Renames + Modifications)
- Explainable risk escalation for SOC analysts
"""
import os
import sys
import time

# Include detector package
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PKG_DIR = os.path.join(ROOT_DIR, "backend", "detector_package")
if PKG_DIR not in sys.path:
    sys.path.insert(0, PKG_DIR)

from engine import BehavioralDetectionEngine
from canary import SafeCanaryManager

DEMO_DIR = os.path.dirname(os.path.abspath(__file__))
if DEMO_DIR not in sys.path:
    sys.path.insert(0, DEMO_DIR)
from cleanup_demo import cleanup_test_folder, PROTECTED_FOLDER

DEMO_FOLDER = PROTECTED_FOLDER


def run_scenario_c():
    print("=" * 65)
    print("  SCENARIO C: Rapid Behavioral Burst Detection")
    print("=" * 65)
    print(f"Target Directory : {DEMO_FOLDER}\n")

    cleanup_test_folder(silent=True)
    os.makedirs(DEMO_FOLDER, exist_ok=True)

    canary_mgr = SafeCanaryManager(instance_id="demo_canary")
    engine = BehavioralDetectionEngine(
        monitored_directory=DEMO_FOLDER,
        time_window_seconds=10.0,
        threshold_rename=5,
        threshold_write=10,
        threshold_delete=8,
        entropy_threshold=7.2,
        alert_cooldown_seconds=0.0,
        canary_manager=canary_mgr
    )

    # 1. Prepare files
    print("[STEP 1] Generating 6 working documents for rapid burst simulation...")
    files = []
    for i in range(6):
        fp = os.path.join(DEMO_FOLDER, f"batch_record_{i}.csv")
        with open(fp, "w", encoding="utf-8") as f:
            f.write(f"RecordID,FieldA,FieldB\n{i},valA,valB\n")
        files.append(fp)
    print("         Created 6 batch records.")

    # 2. Rapid Renames Burst (Simulating automated script/traversal renaming)
    print("\n[STEP 2] Executing rapid mass rename burst across 5+ files in window...")
    burst_decision = None
    for i, fp in enumerate(files):
        new_fp = os.path.join(DEMO_FOLDER, f"batch_record_{i}.tmp")
        os.rename(fp, new_fp)
        d = engine.process_file_renamed(fp, new_fp)
        if d:
            burst_decision = d
            print(f"  -> Threshold reached at file {i+1}: Event '{d.event_type}'")

    if not burst_decision:
        print("FAILED: Sliding window mass rename threshold was not triggered!")
        return False

    print("\n  [BURST HEURISTIC DECISION]")
    print(f"  Severity    : {burst_decision.severity} (Score: {burst_decision.score}/100)")
    print(f"  Category    : {burst_decision.category}")
    print(f"  Event Type  : {burst_decision.event_type}")
    print(f"  Event Count : {burst_decision.event_count}")
    print(f"  Details     : {burst_decision.details}")
    print(f"  Action      : {burst_decision.action_taken}")

    assert burst_decision.event_type == "mass_rename", f"Expected mass_rename, got {burst_decision.event_type}"
    assert burst_decision.event_count >= 5, f"Expected event_count >= 5, got {burst_decision.event_count}"
    assert burst_decision.severity in ("MEDIUM", "HIGH", "CRITICAL"), f"Unexpected severity: {burst_decision.severity}"

    # Summary
    print("\n" + "-" * 65)
    print("VERIFICATION & DETECTION RESULTS:")
    print("PASS: Sliding-window burst heuristic triggered accurately.")
    print("      Threshold of 5 rapid renames evaluated with explainable risk.")
    print("=" * 65)
    return True


if __name__ == "__main__":
    success = run_scenario_c()
    sys.exit(0 if success else 1)
