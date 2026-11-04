"""
SelectShans — Complete Academic Demonstration Runner
Executes all 5 harmless ransomware pre-encryption detection scenarios in sequence
and displays a structured demonstration scorecard suitable for project evaluation.
"""
import os
import sys
import time

DEMO_DIR = os.path.dirname(os.path.abspath(__file__))
if DEMO_DIR not in sys.path:
    sys.path.insert(0, DEMO_DIR)

from cleanup_demo import cleanup_test_folder, PROTECTED_FOLDER
from run_scenario_a_normal import run_scenario_a
from run_scenario_b_suspicious_ext import run_scenario_b
from run_scenario_c_rapid_burst import run_scenario_c
from run_scenario_d_canary import run_scenario_d
from run_scenario_e_entropy import run_scenario_e


def main():
    print("\n" + "#" * 70)
    print("  SELECTSHANS — RANSOMWARE PRE-ENCRYPTION DETECTION SYSTEM")
    print("  Academic Demonstration Suite (Phase 2.1 Demo-Ready)")
    print("#" * 70 + "\n")
    print(f"Isolated Demo Working Directory: {PROTECTED_FOLDER}\n")

    scenarios = [
        ("Scenario A: Normal Benign Activity", run_scenario_a, "Zero false CRITICAL alerts"),
        ("Scenario B: Suspicious Extension Renames", run_scenario_b, "Isolated=HIGH, Campaign=CRITICAL"),
        ("Scenario C: Rapid Behavioral Bursts", run_scenario_c, "Sliding-window threshold met"),
        ("Scenario D: Canary Decoy Tamper Trap", run_scenario_d, "Immediate CRITICAL decoy breach"),
        ("Scenario E: Shannon Entropy Surges", run_scenario_e, "Surge on text, zip exempt"),
    ]

    results = []

    for name, runner, expected in scenarios:
        cleanup_test_folder(silent=True)
        time.sleep(0.2)
        start_t = time.time()
        try:
            success = runner()
            elapsed = time.time() - start_t
            status = "PASSED" if success else "FAILED"
        except Exception as e:
            elapsed = time.time() - start_t
            status = f"ERROR ({type(e).__name__})"
            print(f"\n[EXCEPTION in {name}]: {e}\n")
        results.append((name, status, f"{elapsed:.2f}s", expected))
        print("\n")

    # Safe final cleanup
    cleanup_test_folder(silent=True)

    # Scorecard
    print("=" * 70)
    print("                 ACADEMIC DEMONSTRATION SCORECARD")
    print("=" * 70)
    print(f"{'Scenario Name':<42} | {'Status':<8} | {'Time':<6} | {'Expected Outcome'}")
    print("-" * 70)
    all_passed = True
    for name, status, timing, outcome in results:
        if status != "PASSED":
            all_passed = False
        print(f"{name:<42} | {status:<8} | {timing:<6} | {outcome}")
    print("=" * 70)

    if all_passed:
        print("\nOVERALL EVALUATION: 100% OF DEMONSTRATION SCENARIOS PASSED.")
        print("SelectShans detection engine is demo-ready for academic evaluation.\n")
        return 0
    else:
        print("\nOVERALL EVALUATION: One or more scenarios encountered issues.\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
