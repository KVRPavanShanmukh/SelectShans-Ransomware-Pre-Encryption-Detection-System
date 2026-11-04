"""
Phase 2 False-Positive Test Suite: Normal Workloads & Benign Activities
SelectShans – Ransomware Pre-Encryption Detection System
Verifies that legitimate everyday activities do not trigger false ransomware alerts.
"""
import unittest
import os
import sys
import tempfile
import time
import shutil

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'detector_package')))

from engine import BehavioralDetectionEngine
from canary import SafeCanaryManager


class TestPhase2FalsePositives(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.canary_mgr = SafeCanaryManager(instance_id="fp_test")
        self.engine = BehavioralDetectionEngine(
            monitored_directory=self.temp_dir,
            time_window_seconds=3.0,
            threshold_rename=6,
            threshold_write=12,
            threshold_delete=8,
            entropy_threshold=7.2,
            alert_cooldown_seconds=1.0,
            canary_manager=self.canary_mgr
        )

    def tearDown(self):
        self.canary_mgr.cleanup()
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_01_editing_multiple_text_documents(self):
        """
        Editing multiple text documents (e.g. coding or writing essays)
        exhibits normal entropy and legitimate extensions -> Must NOT trigger CRITICAL/HIGH alerts.
        """
        alerts = []
        for i in range(8):
            file_path = os.path.join(self.temp_dir, f"document_{i}.txt")
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(f"Meeting notes number {i}. Detailed minutes and action items.\n" * 20)

            c_alert = self.engine.process_file_created(file_path)
            if c_alert:
                alerts.append(c_alert)

            # Append some text (normal modification)
            with open(file_path, "a", encoding="utf-8") as f:
                f.write("Additional discussion points.\n")

            m_alert = self.engine.process_file_modified(file_path)
            if m_alert:
                alerts.append(m_alert)

        critical_high_alerts = [a for a in alerts if a.severity in ("CRITICAL", "HIGH")]
        self.assertEqual(len(critical_high_alerts), 0, "Normal document editing must not trigger CRITICAL/HIGH alerts")

    def test_02_working_with_compressed_and_media_files(self):
        """
        Creating or extracting ZIP archives or images contains naturally high-entropy bytes.
        Because they have legitimate formats (.zip, .jpg, .png), they must NOT be flagged as ransomware.
        """
        alerts = []
        for i in range(5):
            zip_path = os.path.join(self.temp_dir, f"backup_{i}.zip")
            with open(zip_path, "wb") as f:
                f.write(os.urandom(8192))  # High entropy byte stream

            c_alert = self.engine.process_file_created(zip_path)
            if c_alert:
                alerts.append(c_alert)

            m_alert = self.engine.process_file_modified(zip_path)
            if m_alert:
                alerts.append(m_alert)

        for i in range(5):
            img_path = os.path.join(self.temp_dir, f"photo_{i}.jpg")
            with open(img_path, "wb") as f:
                f.write(os.urandom(4096))

            c_alert = self.engine.process_file_created(img_path)
            if c_alert:
                alerts.append(c_alert)

            m_alert = self.engine.process_file_modified(img_path)
            if m_alert:
                alerts.append(m_alert)

        critical_high_alerts = [a for a in alerts if a.severity in ("CRITICAL", "HIGH")]
        self.assertEqual(len(critical_high_alerts), 0, "Compressed media files must not trigger false ransomware alerts")

    def test_03_creating_and_deleting_temporary_files(self):
        """
        Applications routinely create and clean up temporary files (.tmp, .log).
        Small volumes of temporary operations must NOT trigger false alerts.
        """
        alerts = []
        temp_files = []
        for i in range(4):
            tmp_path = os.path.join(self.temp_dir, f"app_temp_{i}.tmp")
            temp_files.append(tmp_path)
            with open(tmp_path, "w") as f:
                f.write("temporary buffer data\n")

            c_alert = self.engine.process_file_created(tmp_path)
            if c_alert:
                alerts.append(c_alert)

        # Cleanup
        for tmp_path in temp_files:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            d_alert = self.engine.process_file_deleted(tmp_path)
            if d_alert:
                alerts.append(d_alert)

        critical_high_alerts = [a for a in alerts if a.severity in ("CRITICAL", "HIGH")]
        self.assertEqual(len(critical_high_alerts), 0, "Scratch file creation and cleanup must not trigger CRITICAL/HIGH alerts")

    def test_04_legitimate_software_update_or_safe_renames(self):
        """
        Renaming 2 or 3 files to legitimate extensions (e.g. file.txt -> file.bak)
        stays below threshold and must NOT trigger mass rename alert.
        """
        alerts = []
        for i in range(2):
            src = os.path.join(self.temp_dir, f"source_{i}.txt")
            dest = os.path.join(self.temp_dir, f"source_{i}.bak")
            open(src, "w").close()

            r_alert = self.engine.process_file_renamed(src, dest)
            if r_alert:
                alerts.append(r_alert)

        critical_high_alerts = [a for a in alerts if a.severity in ("CRITICAL", "HIGH")]
        self.assertEqual(len(critical_high_alerts), 0, "Low-volume safe renames must not trigger ransomware alerts")


if __name__ == '__main__':
    unittest.main()
