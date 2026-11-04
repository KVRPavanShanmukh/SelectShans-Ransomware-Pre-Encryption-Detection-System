"""
Phase 2 Unit Test Suite: Ransomware Detection Engine & Behavioral Heuristics
SelectShans – Ransomware Pre-Encryption Detection System
"""
import unittest
import os
import sys
import tempfile
import time
import shutil

# Add detector_package to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'detector_package')))

from entropy import calculate_bytes_entropy, calculate_file_entropy, EntropyTracker
from extensions import SuspiciousExtensionDetector
from canary import SafeCanaryManager, CANARY_PREFIX
from process import ProcessAttributor
from risk import RiskEngine, THRESHOLD_CRITICAL, THRESHOLD_HIGH, THRESHOLD_MEDIUM
from engine import BehavioralDetectionEngine, DetectionDecision


class TestPhase2Entropy(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_01_bytes_entropy_calculation(self):
        # Empty bytes
        self.assertEqual(calculate_bytes_entropy(b""), 0.0)

        # Uniform single byte (minimum entropy = 0.0)
        self.assertEqual(calculate_bytes_entropy(b"A" * 1024), 0.0)

        # High entropy random bytes (approaching 8.0)
        random_bytes = os.urandom(8192)
        random_ent = calculate_bytes_entropy(random_bytes)
        self.assertGreaterEqual(random_ent, 7.8)
        self.assertLessEqual(random_ent, 8.0)

        # English plaintext string (typical entropy between 3.0 and 5.0)
        text_bytes = b"The quick brown fox jumps over the lazy dog. " * 50
        text_ent = calculate_bytes_entropy(text_bytes)
        self.assertGreater(text_ent, 3.0)
        self.assertLess(text_ent, 5.2)

    def test_02_file_entropy_safety(self):
        # Non-existent file
        self.assertEqual(calculate_file_entropy("C:\\non_existent_file_xyz_123.bin"), 0.0)

        # Empty file
        empty_file = os.path.join(self.temp_dir, "empty.txt")
        open(empty_file, "wb").close()
        self.assertEqual(calculate_file_entropy(empty_file), 0.0)

        # Directory path passed instead of file
        self.assertEqual(calculate_file_entropy(self.temp_dir), 0.0)

    def test_03_entropy_tracker_delta_and_natural_compressed(self):
        tracker = EntropyTracker()

        # 1. Plain text file that gets encrypted
        doc_file = os.path.join(self.temp_dir, "contract.txt")
        with open(doc_file, "wb") as f:
            f.write(b"Agreement contract terms and conditions. " * 40)

        baseline = tracker.record_baseline(doc_file)
        self.assertLess(baseline, 5.0)

        # Simulate encryption: overwrite with high entropy ciphertext
        with open(doc_file, "wb") as f:
            f.write(os.urandom(4096))

        analysis = tracker.analyze_modification(doc_file)
        self.assertTrue(analysis["is_surge"], "Expected entropy surge on encrypted text document")
        self.assertGreater(analysis["delta"], 2.0)
        self.assertFalse(analysis["is_natural_compressed"])

        # 2. Naturally compressed file (e.g. .zip)
        zip_file = os.path.join(self.temp_dir, "archive.zip")
        with open(zip_file, "wb") as f:
            f.write(os.urandom(4096))

        zip_analysis = tracker.analyze_modification(zip_file)
        self.assertTrue(zip_analysis["is_natural_compressed"])
        self.assertFalse(zip_analysis["is_surge"], "Pre-compressed zip should not trigger false entropy surge")


class TestPhase2Extensions(unittest.TestCase):
    def setUp(self):
        self.detector = SuspiciousExtensionDetector()

    def test_04_ransomware_extension_detection(self):
        # Known ransomware extensions
        self.assertTrue(self.detector.is_suspicious_extension("document.locked"))
        self.assertTrue(self.detector.is_suspicious_extension("data.crypto"))
        self.assertTrue(self.detector.is_suspicious_extension("sheet.xlsx.enc"))
        self.assertTrue(self.detector.is_suspicious_extension("image.jpg.WNRY"))
        self.assertTrue(self.detector.is_suspicious_extension("database.sql.lockbit"))

        # Legitimate extensions
        self.assertFalse(self.detector.is_suspicious_extension("document.docx"))
        self.assertFalse(self.detector.is_suspicious_extension("archive.zip"))
        self.assertFalse(self.detector.is_suspicious_extension("photo.jpeg"))
        self.assertFalse(self.detector.is_suspicious_extension("script.py"))

    def test_05_double_extension_analysis(self):
        analysis = self.detector.analyze_path("financial_records.xlsx.locked")
        self.assertTrue(analysis["is_suspicious"])
        self.assertTrue(analysis["is_double_ext"])
        self.assertEqual(analysis["original_ext"], ".xlsx")
        self.assertEqual(analysis["ransom_ext"], ".locked")

    def test_06_rename_analysis(self):
        rename_res = self.detector.analyze_rename("budget.xlsx", "budget.xlsx.crypto")
        self.assertTrue(rename_res["is_ransom_rename"])
        self.assertEqual(rename_res["src_ext"], ".xlsx")
        self.assertEqual(rename_res["dest_analysis"]["ransom_ext"], ".crypto")


class TestPhase2Canary(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.canary_mgr = SafeCanaryManager(instance_id="unit_test_node")

    def tearDown(self):
        self.canary_mgr.cleanup()
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_07_safe_canary_deployment_and_cleanup(self):
        # Deploy decoys
        deployed = self.canary_mgr.deploy_canaries(self.temp_dir)
        self.assertEqual(len(deployed), 3)

        # Verify deployed files exist and are identified
        for path in deployed:
            self.assertTrue(os.path.exists(path))
            self.assertTrue(self.canary_mgr.is_canary(path))
            self.assertTrue(os.path.basename(path).startswith(CANARY_PREFIX))

        # Ordinary user file must NOT be mistaken for canary
        user_file = os.path.join(self.temp_dir, "my_notes.docx")
        open(user_file, "w").close()
        self.assertFalse(self.canary_mgr.is_canary(user_file))

        # Safe cleanup: removes only canaries, preserves user files
        removed = self.canary_mgr.cleanup()
        self.assertEqual(removed, 3)
        self.assertTrue(os.path.exists(user_file), "User file must NOT be deleted by canary cleanup")

    def test_08_canary_event_identification(self):
        deployed = self.canary_mgr.deploy_canaries(self.temp_dir)
        target_canary = deployed[0]

        event = self.canary_mgr.identify_canary_event(target_canary, "modified")
        self.assertIsNotNone(event)
        self.assertTrue(event["is_canary"])
        self.assertEqual(event["severity"], "CRITICAL")
        self.assertEqual(event["score"], 95)


class TestPhase2ProcessAttribution(unittest.TestCase):
    def test_09_process_attribution_safety(self):
        attributor = ProcessAttributor(cache_size=10, ttl=5)

        # Uncached, handle inspection disabled -> honest unknown fallback
        res = attributor.attribute_event("C:\\any_dummy_file.txt", check_handles=False)
        self.assertEqual(res["pid"], 0)
        self.assertEqual(res["process_name"], "unknown")
        self.assertEqual(res["attribution_confidence"], "unknown")

        # Empty path handling
        empty_res = attributor.attribute_event("")
        self.assertEqual(empty_res["pid"], 0)


class TestPhase2RiskScoring(unittest.TestCase):
    def setUp(self):
        self.risk_engine = RiskEngine(alert_cooldown_seconds=5.0)

    def test_10_score_and_severity_agreement(self):
        # CRITICAL
        crit_eval = self.risk_engine.evaluate_signals(
            event_type="canary_tamper",
            directory="C:\\Protected",
            target_file="canary.docx",
            is_canary=True
        )
        self.assertGreaterEqual(crit_eval["score"], THRESHOLD_CRITICAL)
        self.assertEqual(crit_eval["severity"], "CRITICAL")
        self.assertIn("Canary Decoy File Breach", crit_eval["category"])

        # HIGH
        high_eval = self.risk_engine.evaluate_signals(
            event_type="mass_rename",
            directory="C:\\Protected",
            event_count=8
        )
        self.assertGreaterEqual(high_eval["score"], THRESHOLD_HIGH)
        self.assertEqual(high_eval["severity"], "HIGH")

        # MEDIUM
        med_eval = self.risk_engine.evaluate_signals(
            event_type="mass_write",
            directory="C:\\Protected",
            event_count=10
        )
        self.assertGreaterEqual(med_eval["score"], THRESHOLD_MEDIUM)
        self.assertEqual(med_eval["severity"], "MEDIUM")

    def test_11_alert_cooldown_prevention(self):
        key = "test_alert_cooldown_key"
        self.assertFalse(self.risk_engine.is_cooling_down(key), "First alert must not be blocked")
        self.assertTrue(self.risk_engine.is_cooling_down(key), "Immediate duplicate alert must be cooling down")


class TestPhase2BehavioralEngine(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.canary_mgr = SafeCanaryManager(instance_id="engine_test")
        self.engine = BehavioralDetectionEngine(
            monitored_directory=self.temp_dir,
            time_window_seconds=2.0,
            threshold_rename=4,
            threshold_write=5,
            threshold_delete=4,
            entropy_threshold=7.2,
            alert_cooldown_seconds=1.0,
            canary_manager=self.canary_mgr
        )

    def tearDown(self):
        self.canary_mgr.cleanup()
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_12_boundary_enforcement(self):
        # Event outside protected folder should be completely ignored
        outside_file = os.path.join(tempfile.gettempdir(), "outside_file.txt")
        res = self.engine.process_file_created(outside_file)
        self.assertIsNone(res)

    def test_13_ransomware_extension_rename_immediate_alert(self):
        src = os.path.join(self.temp_dir, "taxes.pdf")
        dest = os.path.join(self.temp_dir, "taxes.pdf.locked")
        open(src, "w").close()

        decision = self.engine.process_file_renamed(src, dest)
        self.assertIsNotNone(decision)
        self.assertEqual(decision.severity, "CRITICAL")
        self.assertEqual(decision.event_type, "ransomware_extension_rename")
        self.assertIn("taxes.pdf.locked", decision.target_file)

    def test_14_sliding_window_mass_rename_burst(self):
        # Trigger 4 rapid renames within time window
        decision = None
        for i in range(4):
            src = os.path.join(self.temp_dir, f"doc_{i}.txt")
            dest = os.path.join(self.temp_dir, f"new_{i}.dat")
            open(src, "w").close()
            d = self.engine.process_file_renamed(src, dest)
            if d:
                decision = d

        self.assertIsNotNone(decision, "Mass rename threshold of 4 must trigger detection decision")
        self.assertEqual(decision.event_type, "mass_rename")
        self.assertIn(decision.severity, ("MEDIUM", "HIGH"))
        self.assertEqual(decision.event_count, 4)

    def test_15_canary_tamper_detection(self):
        deployed = self.canary_mgr.deploy_canaries(self.temp_dir)
        target = deployed[0]

        # Simulate modification to canary
        decision = self.engine.process_file_modified(target)
        self.assertIsNotNone(decision)
        self.assertEqual(decision.severity, "CRITICAL")
        self.assertEqual(decision.event_type, "canary_tamper")


if __name__ == '__main__':
    unittest.main()
