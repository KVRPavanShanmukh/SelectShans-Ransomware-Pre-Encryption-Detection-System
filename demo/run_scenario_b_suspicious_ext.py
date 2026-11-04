"""
SelectShans Demo — Scenario B: Suspicious Extension Changes
Demonstrates:
- Isolated suspicious extension rename (Score 65, HIGH, no false CRITICAL)
- Follow-up suspicious extension renames (Escalates to CRITICAL 85-95)
- Human-readable behavioral explanations for SOC analysts
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


def run_scenario_b():
    print("=" * 65)
    print("  SCENARIO B: Suspicious Extension Renaming Detection")
    print("=" * 65)
    print(f"Target Directory : {DEMO_FOLDER}\n")

    # Safe initial reset of test folder
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
        alert_cooldown_seconds=0.0,  # 0 cooldown for demo testing
        canary_manager=canary_mgr
    )

    # 1. Create dummy files
    print("[STEP 1] Creating benign sample documents...")
    file1 = os.path.join(DEMO_FOLDER, "financial_data.xlsx")
    file2 = os.path.join(DEMO_FOLDER, "client_records.docx")
    file3 = os.path.join(DEMO_FOLDER, "legal_contracts.pdf")

    with open(file1, "w", encoding="utf-8") as f:
        f.write("Q3 Financial Balance Sheet Data")
    with open(file2, "w", encoding="utf-8") as f:
        f.write("Confidential Client List 2026")
    with open(file3, "w", encoding="utf-8") as f:
        f.write("Mutual Non-Disclosure Agreement")

    print(f"         Created: {os.path.basename(file1)}, {os.path.basename(file2)}, {os.path.basename(file3)}")

    # 2. Isolated Rename: financial_data.xlsx -> financial_data.xlsx.locked
    print("\n[STEP 2] Simulating an ISOLATED suspicious rename (.xlsx -> .locked)...")
    file1_locked = file1 + ".locked"
    os.rename(file1, file1_locked)
    decision1 = engine.process_file_renamed(file1, file1_locked)

    if decision1:
        print(f"  [RESULT 1 - Isolated Rename]")
        print(f"  Severity    : {decision1.severity} (Score: {decision1.score}/100)")
        print(f"  Category    : {decision1.category}")
        print(f"  Details     : {decision1.details}")
        print(f"  Action      : {decision1.action_taken}")
    else:
        print("  [RESULT 1] FAILED: No decision produced!")
        return False

    # Check isolated rename safety: Must be HIGH or MEDIUM, NOT premature false CRITICAL
    assert decision1.severity in ("MEDIUM", "HIGH"), f"Expected MEDIUM/HIGH for isolated rename, got {decision1.severity}"
    assert decision1.score < 80, f"Expected isolated score < 80, got {decision1.score}"
    print("  -> Verified: Isolated rename flagged without false CRITICAL panic.")

    # 3. Subsequent Renames: client_records.docx -> client_records.docx.locked, legal_contracts.pdf -> legal_contracts.pdf.crypto
    print("\n[STEP 3] Simulating MULTIPLE suspicious renames (Campaign Burst)...")
    file2_locked = file2 + ".locked"
    os.rename(file2, file2_locked)
    decision2 = engine.process_file_renamed(file2, file2_locked)

    file3_crypto = file3 + ".crypto"
    os.rename(file3, file3_crypto)
    decision3 = engine.process_file_renamed(file3, file3_crypto)

    if decision3:
        print(f"  [RESULT 2 - Campaign Escalation]")
        print(f"  Severity    : {decision3.severity} (Score: {decision3.score}/100)")
        print(f"  Category    : {decision3.category}")
        print(f"  Details     : {decision3.details}")
        print(f"  Action      : {decision3.action_taken}")
    else:
        print("  [RESULT 2] FAILED: No decision on subsequent renames!")
        return False

    assert decision3.severity == "CRITICAL", f"Expected CRITICAL for repeated renames, got {decision3.severity}"
    assert decision3.score >= 85, f"Expected CRITICAL score >= 85, got {decision3.score}"
    print("  -> Verified: Multiple suspicious renames escalated to CRITICAL.")

    # Summary
    print("\n" + "-" * 65)
    print("VERIFICATION & DETECTION RESULTS:")
    print("PASS: Suspicious extension detected accurately.")
    print("      Isolated rename produced explainable MEDIUM/HIGH alert.")
    print("      Sequential campaign burst escalated to CRITICAL alert.")
    print("=" * 65)
    return True


if __name__ == "__main__":
    success = run_scenario_b()
    sys.exit(0 if success else 1)
