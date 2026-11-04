"""
SelectShans Demo — Scenario D: Canary Decoy Trap & Tamper Detection
Demonstrates:
- Safe canary deployment with unique instance signatures
- Zero risk to pre-existing user files
- Immediate CRITICAL detection (Score 95/100) when a decoy file is modified, renamed, or deleted
- Actionable containment recommendations for SOC analysts
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
from canary import SafeCanaryManager, CANARY_PREFIX

DEMO_DIR = os.path.dirname(os.path.abspath(__file__))
if DEMO_DIR not in sys.path:
    sys.path.insert(0, DEMO_DIR)
from cleanup_demo import cleanup_test_folder, PROTECTED_FOLDER

DEMO_FOLDER = PROTECTED_FOLDER


def run_scenario_d():
    print("=" * 65)
    print("  SCENARIO D: Canary Decoy Trap & Tamper Detection")
    print("=" * 65)
    print(f"Target Directory : {DEMO_FOLDER}\n")

    cleanup_test_folder(silent=True)
    os.makedirs(DEMO_FOLDER, exist_ok=True)

    # 1. Simulate a pre-existing user document
    print("[STEP 1] Creating a pre-existing user file...")
    pre_existing_file = os.path.join(DEMO_FOLDER, f"{CANARY_PREFIX}legacy_user_file.txt")
    with open(pre_existing_file, "w", encoding="utf-8") as f:
        f.write("Important pre-existing user notes. Must NEVER be deleted.")
    print(f"         Created: {os.path.basename(pre_existing_file)}")

    # 2. Deploy Canary Decoys
    print("\n[STEP 2] Deploying active canary decoys...")
    canary_mgr = SafeCanaryManager(instance_id="demo_node_d")
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

    deployed = canary_mgr.deploy_canaries(DEMO_FOLDER)
    print(f"         Deployed {len(deployed)} canary decoy(s):")
    for c in deployed:
        print(f"           - {os.path.basename(c)}")

    # Verify pre-existing file was NOT treated as a canary
    assert pre_existing_file not in deployed, "Pre-existing user file was wrongly registered as canary!"
    print("         Verified: Pre-existing user file was preserved and bypassed.")

    # 3. Simulate Canary Tampering (Ransomware modifying early alphabetical decoy)
    print("\n[STEP 3] Simulating ransomware traversal modifying first canary decoy...")
    target_canary = deployed[0]
    with open(target_canary, "a", encoding="utf-8") as f:
        f.write("\n[MALICIOUS_OVERWRITE_SIMULATION]")

    decision = engine.process_file_modified(target_canary)

    if not decision:
        print("FAILED: Canary modification was not detected by Behavioral Engine!")
        return False

    print("\n  [CANARY TAMPER DECISION]")
    print(f"  Severity    : {decision.severity} (Score: {decision.score}/100)")
    print(f"  Category    : {decision.category}")
    print(f"  Target File : {decision.target_file}")
    print(f"  Details     : {decision.details}")
    print(f"  Action      : {decision.action_taken}")

    assert decision.severity == "CRITICAL", f"Expected CRITICAL, got {decision.severity}"
    assert decision.score >= 90, f"Expected score >= 90, got {decision.score}"
    assert decision.event_type == "canary_tamper", f"Expected canary_tamper, got {decision.event_type}"

    # 4. Safe Cleanup Verification
    print("\n[STEP 4] Testing Safe Canary Cleanup...")
    removed_canaries = canary_mgr.cleanup()
    print(f"         Cleaned up {removed_canaries} active canary decoy(s).")

    # Ensure pre-existing user file STILL exists
    if not os.path.exists(pre_existing_file):
        print("CRITICAL SAFETY FAILURE: Canary cleanup deleted pre-existing user file!")
        return False
    print("         Verified: Pre-existing user document is intact and undamaged!")

    # Summary
    print("\n" + "-" * 65)
    print("VERIFICATION & DETECTION RESULTS:")
    print("PASS: Canary decoy tamper detected with immediate CRITICAL severity.")
    print("      Decoy cleanup confirmed 100% safe against pre-existing user files.")
    print("=" * 65)
    return True


if __name__ == "__main__":
    success = run_scenario_d()
    sys.exit(0 if success else 1)
