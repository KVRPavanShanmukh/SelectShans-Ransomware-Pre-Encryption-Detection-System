"""
Phase 2 Integration Test Suite: End-to-End Pipeline & SOC Integration
SelectShans – Ransomware Pre-Encryption Detection System
"""
import unittest
import os
import sys
import tempfile
import time
import shutil
import json
from unittest.mock import patch, MagicMock

# Setup paths
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'detector_package')))

from app import app, create_detector_token
from jwt_utils import create_token
from engine import BehavioralDetectionEngine, DetectionDecision
from telemetry import TelemetryClient
from canary import SafeCanaryManager
from detector import FolderGuardAgent


class TestPhase2Integration(unittest.TestCase):
    def setUp(self):
        self.app = app
        self.client = self.app.test_client()
        self.app.config['TESTING'] = True
        self.temp_dir = tempfile.mkdtemp()
        self.user_id = 1
        self.email = "soc_admin@selectshans.sec"
        self.detector_token = create_detector_token(self.user_id, self.email)
        self.jwt_token = create_token(self.user_id, "soc_admin", self.email, role="admin")

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_01_telemetry_queue_and_serialization(self):
        client = TelemetryClient(
            api_base="http://127.0.0.1:5000",
            token=self.detector_token,
            detector_id="test_det_01",
            hostname="WIN-SOC-NODE"
        )
        self.assertEqual(client.queue_size, 0)

        decision = DetectionDecision(
            event_type="ransomware_extension_rename",
            directory=self.temp_dir,
            target_file="vault.db.locked",
            severity="CRITICAL",
            score=92,
            category="Ransomware Extension Rename",
            event_count=1,
            action_taken="Recommended: Isolate host and verify shadow copies",
            process_name="test_ransom.exe",
            details="Double extension pattern detected | high entropy",
            evidence={"entropy": 7.95}
        )

        client.enqueue_activity(decision.to_dict())
        self.assertEqual(client.queue_size, 1)

        # Inspect internal queue structure
        queued_item = client._queue[0]
        self.assertEqual(queued_item["severity"], "CRITICAL")
        self.assertEqual(queued_item["score"], 92)
        self.assertEqual(queued_item["process_name"], "test_ransom.exe")
        self.assertIn("Double extension", queued_item["details"])

    def test_02_backend_telemetry_ingestion_and_retrieval(self):
        mock_cursor = MagicMock()
        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        payload = {
            "token": self.detector_token,
            "activities": [
                {
                    "id": "act_test_101",
                    "detector_id": "det_01",
                    "hostname": "WORKSTATION-01",
                    "event_type": "encryption_surge",
                    "directory": self.temp_dir,
                    "target_file": "records.xlsx",
                    "severity": "CRITICAL",
                    "score": 95,
                    "event_count": 8,
                    "action_taken": "Recommended: Isolate host",
                    "process_name": "malicious_proc.exe",
                    "details": "Rapid write burst + high entropy surge (+4.2 delta)"
                }
            ]
        }

        with patch('app.pool.get_connection', return_value=mock_conn):
            # 1. Sync activities to backend
            response = self.client.post('/api/detector/sync-activities', json=payload)
            self.assertEqual(response.status_code, 200)
            res_data = response.get_json()
            self.assertEqual(res_data["synced_count"], 1)

            # Verify database executed INSERT with details column
            mock_cursor.execute.assert_called()
            call_sql = mock_cursor.execute.call_args_list[0][0][0]
            self.assertIn("details", call_sql)

            # 2. Retrieve detector activities
            mock_cursor.fetchall.return_value = [
                {
                    "id": 1,
                    "event_type": "encryption_surge",
                    "directory": self.temp_dir,
                    "target_file": "records.xlsx",
                    "severity": "CRITICAL",
                    "score": 95,
                    "detector_id": "det_01",
                    "hostname": "WORKSTATION-01",
                    "event_count": 8,
                    "action_taken": "Recommended: Isolate host",
                    "process_name": "malicious_proc.exe",
                    "details": "Rapid write burst + high entropy surge (+4.2 delta)",
                    "created_at": None
                }
            ]

            get_res = self.client.get(
                f'/api/detector/activities?user_id={self.user_id}',
                headers={'Authorization': f'Bearer {self.jwt_token}'}
            )
            self.assertEqual(get_res.status_code, 200)
            activities = get_res.get_json()
            self.assertEqual(len(activities), 1)
            self.assertEqual(activities[0]["score"], 95)
            self.assertEqual(activities[0]["process_name"], "malicious_proc.exe")
            self.assertIn("Rapid write burst", activities[0]["details"])

    def test_03_network_outage_retry_and_backoff(self):
        client = TelemetryClient(
            api_base="http://127.0.0.1:5000",
            token=self.detector_token,
            detector_id="test_det_02",
            hostname="TEST-NODE"
        )

        decision = DetectionDecision(
            event_type="mass_rename",
            directory=self.temp_dir,
            target_file="test.locked",
            severity="HIGH",
            score=70,
            category="Mass Rename",
            event_count=5,
            action_taken="Marked",
            process_name="unknown",
            details="5 renames within 3s",
            evidence={}
        )
        client.enqueue_activity(decision.to_dict())
        self.assertEqual(client.queue_size, 1)

        # 1. Simulate network failure (e.g. backend offline)
        with patch('requests.post', side_effect=Exception("Connection refused: 5000")):
            sent = client.flush()
            self.assertEqual(sent, 0)
            # Item remains in queue!
            self.assertEqual(client.queue_size, 1)
            self.assertGreater(client._current_backoff, 2.0)

        # 2. Simulate network recovery
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        with patch('requests.post', return_value=mock_resp):
            sent = client.flush()
            self.assertEqual(sent, 1)
            # Queue is now empty after successful flush
            self.assertEqual(client.queue_size, 0)
            self.assertEqual(client._consecutive_failures, 0)

    def test_04_agent_lifecycle_and_safe_cleanup(self):
        agent = FolderGuardAgent(self.temp_dir)
        self.assertFalse(agent._running)

        # Start agent
        with patch.object(agent.observer, 'start'):
            with patch.object(agent.telemetry, 'start'):
                agent.start()
                self.assertTrue(agent._running)
                # Verify canaries deployed
                self.assertEqual(len(agent.canary_mgr.deployed_canaries), 3)

                # Stop agent
                with patch.object(agent.observer, 'stop'):
                    with patch.object(agent.observer, 'join'):
                        with patch.object(agent.telemetry, 'stop'):
                            agent.stop()
                            self.assertFalse(agent._running)
                            # Verify canaries safely cleaned up
                            self.assertEqual(len(agent.canary_mgr.deployed_canaries), 0)


if __name__ == '__main__':
    unittest.main()
