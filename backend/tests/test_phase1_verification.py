"""
Phase 1 Verification & Remediation Test Suite
SelectShans – Ransomware Pre-Encryption Detection System
"""
import unittest
import os
import sys
import io
import json
import zipfile
import jwt
from datetime import datetime
from unittest.mock import patch, MagicMock

# Setup path so backend modules are importable
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app, generate_pdf_report, create_detector_token, _pending_logins
from jwt_utils import create_token, verify_token

class TestPhase1Remediation(unittest.TestCase):
    def setUp(self):
        self.app = app
        self.client = self.app.test_client()
        self.app.config['TESTING'] = True

    # 1. Health check test
    def test_01_health_check(self):
        response = self.client.get('/api/health')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIn("status", data)
        self.assertEqual(data["status"], "ok")

    # 2. Authentication Role Preservation and JWT
    def test_02_jwt_role_preservation(self):
        # Admin token
        admin_token = create_token(user_id=1, username="admin_test", email="admin@selectshans.sec", role="admin")
        admin_payload = verify_token(admin_token)
        self.assertIsNotNone(admin_payload)
        self.assertEqual(admin_payload.get("role"), "admin")
        self.assertEqual(admin_payload.get("user_id"), 1)

        # User token
        user_token = create_token(user_id=2, username="user_test", email="user@selectshans.sec", role="user")
        user_payload = verify_token(user_token)
        self.assertIsNotNone(user_payload)
        self.assertEqual(user_payload.get("role"), "user")
        self.assertEqual(user_payload.get("user_id"), 2)

    def test_03_otp_verification_returns_role(self):
        # Simulate pending login with role='admin'
        test_email = "soc_admin@selectshans.sec"
        _pending_logins[test_email] = {
            "user_id": 99,
            "username": "soc_admin",
            "email": test_email,
            "role": "admin",
            "otp": "999888",
            "psk": "ABCDEF12",
            "expires_at": 9999999999
        }

        response = self.client.post('/api/login/verify', json={
            "identifier": test_email,
            "otp": "999888",
            "psk": "ABCDEF12"
        })
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertIn("token", data)
        self.assertIn("role", data)
        self.assertEqual(data["role"], "admin")
        self.assertEqual(data["user_id"], 99)

        # Verify role is baked inside the returned JWT token
        token_claims = verify_token(data["token"])
        self.assertEqual(token_claims.get("role"), "admin")

    # 3. Detector Package Download Integrity
    def test_04_detector_download_package(self):
        token = create_detector_token(user_id=42, email="analyst@selectshans.sec")
        response = self.client.get(f'/api/detector-download?token={token}')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "application/zip")

        # Inspect ZIP buffer
        zf = zipfile.ZipFile(io.BytesIO(response.data))
        namelist = zf.namelist()
        for required_file in ["config.json", "detector.py", "requirements.txt", "run.bat"]:
            self.assertIn(required_file, namelist, f"Missing required file {required_file} in detector ZIP")

        # Verify injected config.json
        config = json.loads(zf.read("config.json").decode('utf-8'))
        self.assertEqual(config.get("user_id"), 42)
        self.assertEqual(config.get("email"), "analyst@selectshans.sec")
        self.assertEqual(config.get("token"), token)
        self.assertNotIn("JWT_SECRET", config)
        self.assertNotIn("DB_PASSWORD", config)

        # Verify run.bat
        run_bat = zf.read("run.bat").decode('utf-8')
        self.assertIn("Starting SelectShans FolderGuard", run_bat)

    # 4. Windows PDF Report Generation
    def test_05_pdf_report_generation(self):
        # Mock database connection for generate_pdf_report
        mock_cursor = MagicMock()
        mock_cursor.fetchall.side_effect = [
            # 1. detector_activities rows
            [
                {"event_type": "high_entropy", "count": 5, "last_seen": datetime.now()},
                {"event_type": "rapid_modification", "count": 3, "last_seen": datetime.now()}
            ],
            # 2. alerts rows
            [
                {"timestamp": datetime.now(), "severity": "HIGH", "process_name": "malware.exe", "pid": 1234, "trigger_reason": "Rapid write"}
            ]
        ]
        mock_cursor.fetchone.side_effect = [
            {"count": 2}, # unresolved alerts
            {"count": 15} # whitelisted processes
        ]

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch('app.pool.get_connection', return_value=mock_conn):
            pdf_path = generate_pdf_report(user_id=1, user_email="test@selectshans.sec")
            self.assertIsNotNone(pdf_path)
            self.assertTrue(os.path.exists(pdf_path), f"Generated PDF path {pdf_path} does not exist")
            
            # Verify valid PDF header
            with open(pdf_path, 'rb') as f:
                header = f.read(5)
                self.assertEqual(header, b"%PDF-", "Generated file is not a valid PDF")
                f.seek(0, os.SEEK_END)
                size = f.tell()
                self.assertGreater(size, 1000, "PDF file size too small")

            # Clean up temp PDF
            try:
                os.remove(pdf_path)
            except Exception:
                pass

    # 5. Schema and Migration Integrity
    def test_06_schema_definition_consistency(self):
        schema_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'schema.sql')
        self.assertTrue(os.path.exists(schema_path))
        with open(schema_path, 'r', encoding='utf-8') as f:
            schema_sql = f.read()

        # Check detector_activities columns
        self.assertIn("detector_activities", schema_sql)
        self.assertIn("directory VARCHAR(500)", schema_sql)
        self.assertIn("target_file VARCHAR(255)", schema_sql)
        self.assertIn("severity VARCHAR(20)", schema_sql)
        self.assertIn("event_count INT", schema_sql)
        self.assertIn("action_taken VARCHAR(255)", schema_sql)
        self.assertIn("process_name VARCHAR(100)", schema_sql)
        self.assertIn("details TEXT", schema_sql)
        self.assertIn("INDEX idx_det_activities_user", schema_sql)

    # 6. Protected Endpoints Authorization Enforcement
    def test_07_protected_endpoints_reject_unauthenticated(self):
        endpoints = [
            ('GET', '/api/admin/realtime-stats'),
            ('GET', '/api/admin/security-report'),
            ('GET', '/api/alerts'),
            ('POST', '/api/alerts/1/resolve'),
            ('GET', '/api/admin/audit-log'),
            ('POST', '/api/admin/clear-data')
        ]
        for method, endpoint in endpoints:
            if method == 'GET':
                res = self.client.get(endpoint)
            else:
                res = self.client.post(endpoint)
            self.assertEqual(res.status_code, 401, f"Endpoint {method} {endpoint} failed to reject unauthenticated request")

if __name__ == '__main__':
    unittest.main()
