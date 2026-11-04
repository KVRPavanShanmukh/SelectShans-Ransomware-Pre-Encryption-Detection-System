"""
SelectShans Demo — Scenario E: Shannon Entropy Analysis & Encryption Surge Detection
Demonstrates:
- Configurable entropy threshold evaluation (7.2/8.0)
- Baseline entropy tracking vs post-modification entropy delta
- Detection of synthetic high-entropy encryption surges on plaintext documents
- False-positive prevention: naturally compressed files (.zip) are recognized and not flagged as encryption surges
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
from entropy import EntropyTracker
from canary import SafeCanaryManager

DEMO_DIR = os.path.dirname(os.path.abspath(__file__))
if DEMO_DIR not in sys.path:
    sys.path.insert(0, DEMO_DIR)
from cleanup_demo import cleanup_test_folder, PROTECTED_FOLDER

DEMO_FOLDER = PROTECTED_FOLDER


def run_scenario_e():
    print("=" * 65)
    print("  SCENARIO E: Entropy Surge vs Compressed Format Analysis")
    print("=" * 65)
    print(f"Target Directory : {DEMO_FOLDER}\n")

    cleanup_test_folder(silent=True)
    os.makedirs(DEMO_FOLDER, exist_ok=True)

    canary_mgr = SafeCanaryManager(instance_id="demo_node_e")
    engine = BehavioralDetectionEngine(
        monitored_directory=DEMO_FOLDER,
        time_window_seconds=10.0,
        threshold_rename=5,
        threshold_write=5,
        threshold_delete=8,
        entropy_threshold=7.2,
        alert_cooldown_seconds=0.0,
        canary_manager=canary_mgr
    )

    # 1. Plaintext file baseline & encryption surge simulation
    print("[STEP 1] Creating ordinary plaintext document (low baseline entropy)...")
    doc_path = os.path.join(DEMO_FOLDER, "executive_report.txt")
    with open(doc_path, "wb") as f:
        f.write(b"Quarterly corporate strategic outlook. Market dynamics and risk indicators. " * 30)

    engine.process_file_created(doc_path)
    baseline_ent = engine.entropy_tracker.get_baseline(doc_path)
    print(f"         Baseline Shannon Entropy: {baseline_ent:.2f} / 8.00 (Plaintext)")

    print("\n[STEP 2] Simulating encryption surge: Overwriting with high-entropy bytes...")
    # Overwrite with high entropy pseudo-random bytes
    with open(doc_path, "wb") as f:
        f.write(os.urandom(4096))

    analysis1 = engine.entropy_tracker.analyze_modification(doc_path, entropy_threshold=7.2)
    print(f"         Post-Modification Entropy : {analysis1['current_entropy']:.2f} / 8.00")
    print(f"         Entropy Delta (Increase) : +{analysis1['delta']:.2f}")
    print(f"         Entropy Surge Flagged    : {analysis1['is_surge']}")

    assert analysis1["is_surge"], "Expected entropy surge to be True for encrypted plaintext document!"
    print("  -> Verified: Synthetic encryption surge identified on plaintext document.")

    # 2. Multi-write encryption surge leading to engine decision
    print("\n[STEP 3] Triggering correlated encryption surge alert...")
    doc2_path = os.path.join(DEMO_FOLDER, "client_roster.txt")
    with open(doc2_path, "wb") as f:
        f.write(b"Client names, account balances, and contract renewal dates. " * 30)
    engine.process_file_created(doc2_path)

    # Overwrite doc1 and doc2 to reach entropy surge threshold (2 surges)
    engine.process_file_modified(doc_path)
    with open(doc2_path, "wb") as f:
        f.write(os.urandom(4096))
    decision = engine.process_file_modified(doc2_path)

    if decision:
        print(f"\n  [ENCRYPTION SURGE HEURISTIC DECISION]")
        print(f"  Severity    : {decision.severity} (Score: {decision.score}/100)")
        print(f"  Category    : {decision.category}")
        print(f"  Event Type  : {decision.event_type}")
        print(f"  Details     : {decision.details}")
        print(f"  Action      : {decision.action_taken}")
        assert decision.score >= 60, f"Expected elevated score >= 60, got {decision.score}"

    # 3. False-Positive Prevention: Pre-compressed archive
    print("\n[STEP 4] False-Positive Prevention Test on Pre-Compressed Archive (.zip)...")
    archive_path = os.path.join(DEMO_FOLDER, "system_backup.zip")
    with open(archive_path, "wb") as f:
        f.write(os.urandom(4096))

    zip_analysis = engine.entropy_tracker.analyze_modification(archive_path, entropy_threshold=7.2)
    print(f"         Archive Current Entropy  : {zip_analysis['current_entropy']:.2f} / 8.00")
    print(f"         Is Natural Compressed    : {zip_analysis['is_natural_compressed']}")
    print(f"         Entropy Surge Flagged    : {zip_analysis['is_surge']}")

    assert zip_analysis["is_natural_compressed"], "Expected .zip to be recognized as natural compressed!"
    assert not zip_analysis["is_surge"], "Pre-compressed .zip must NOT trigger false entropy surge!"
    print("  -> Verified: Naturally compressed archives safely exempt from false surge flags.")

    # Summary
    print("\n" + "-" * 65)
    print("VERIFICATION & DETECTION RESULTS:")
    print("PASS: Shannon entropy thresholding detects high-entropy encryption.")
    print("      Compressed file types (.zip) safely handled without false alarms.")
    print("=" * 65)
    return True


if __name__ == "__main__":
    success = run_scenario_e()
    sys.exit(0 if success else 1)
