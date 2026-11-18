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

from app import app, generate_pdf_report, create_detector_token
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
        admin_token = create_token(user_id=1, username="admin_test", email="kakarlapavanshanmukh@gmail.com", role="admin")
        admin_payload = verify_token(admin_token)
        self.assertIsNotNone(admin_payload)
        self.assertEqual(admin_payload.get("role"), "admin")
        self.assertEqual(admin_payload.get("user_id"), 1)

        # User token
        user_token = create_token(user_id=2, username="user_test", email="kakarlapavanshanmukh@gmail.com", role="user")
        user_payload = verify_token(user_token)
        self.assertIsNotNone(user_payload)
        self.assertEqual(user_payload.get("role"), "user")
        self.assertEqual(user_payload.get("user_id"), 2)

    def test_03_otp_verification_returns_role(self):
        import hashlib
        from datetime import timezone, timedelta
        test_email = "kakarlapavanshanmukh@gmail.com"

        mock_cursor = MagicMock()
        mock_cursor.fetchone.side_effect = [
            {
                "id": 1,
                "identifier": test_email,
                "challenge_type": "login",
                "otp_hash": hashlib.sha256(b"999888").hexdigest(),
                "psk_hash": hashlib.sha256(b"ABCDEF12").hexdigest(),
                "attempts": 0,
                "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5)
            },
            {
                "id": 99,
                "username": "soc_admin",
                "email": test_email,
                "role": "admin"
            }
        ]
        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch('app.pool.get_connection', return_value=mock_conn):
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
        token = create_detector_token(user_id=42, email="kakarlapavanshanmukh@gmail.com")
        response = self.client.get(f'/api/detector-download?token={token}')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "application/zip")

        # Inspect ZIP buffer
        zf = zipfile.ZipFile(io.BytesIO(response.data))
        namelist = zf.namelist()
        for required_file in ["config.json", "detector.py", "requirements.txt", "run.bat", "gui.py"]:
            self.assertIn(required_file, namelist, f"Missing required file {required_file} in detector ZIP")

        # Verify injected config.json
        config = json.loads(zf.read("config.json").decode('utf-8'))
        self.assertEqual(config.get("user_id"), 42)
        self.assertEqual(config.get("email"), "kakarlapavanshanmukh@gmail.com")
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
            pdf_path = generate_pdf_report(user_id=1, user_email="kakarlapavanshanmukh@gmail.com")
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

    # 7. Schema Definition for Pending Auth Challenges Table
    def test_08_schema_pending_auth_challenges(self):
        schema_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'schema.sql')
        with open(schema_path, 'r', encoding='utf-8') as f:
            schema_sql = f.read()

        self.assertIn("CREATE TABLE IF NOT EXISTS pending_auth_challenges", schema_sql)
        self.assertIn("otp_hash VARCHAR(128) NOT NULL", schema_sql)
        self.assertIn("psk_hash VARCHAR(128) NOT NULL", schema_sql)
        self.assertIn("attempts INT NOT NULL DEFAULT 0", schema_sql)
        self.assertIn("expires_at TIMESTAMPTZ NOT NULL", schema_sql)
        self.assertIn("idx_pending_auth_ident_type", schema_sql)
        self.assertIn("idx_pending_auth_expires_at", schema_sql)

    # 8. PostgreSQL Storage Logic & Attempt Throttling for Auth Challenges
    def test_09_auth_challenge_database_store_and_verify(self):
        from app import store_auth_challenge, verify_auth_challenge
        import hashlib
        from datetime import timezone, timedelta

        # Mock database connection and cursor
        fake_store = {}
        mock_cursor = MagicMock()

        def fake_execute(stmt, params=None):
            if "INSERT INTO pending_auth_challenges" in stmt:
                fake_store["challenge"] = {
                    "id": 101,
                    "identifier": params[0],
                    "challenge_type": params[1],
                    "otp_hash": params[2],
                    "psk_hash": params[3],
                    "attempts": 0,
                    "expires_at": params[4]
                }
            elif "SELECT id, identifier" in stmt:
                pass
            elif "UPDATE pending_auth_challenges" in stmt:
                fake_store["challenge"]["attempts"] = params[0]
            elif "DELETE FROM pending_auth_challenges WHERE id = %s" in stmt:
                fake_store.pop("challenge", None)

        mock_cursor.execute.side_effect = fake_execute
        mock_cursor.fetchone.side_effect = lambda: fake_store.get("challenge")
        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        # Store challenge (SHA-256 hashed)
        store_auth_challenge(mock_conn, "kakarlapavanshanmukh@gmail.com", "login", "123456", "secretpsk", expiry_minutes=3)
        self.assertIn("challenge", fake_store)
        self.assertEqual(fake_store["challenge"]["otp_hash"], hashlib.sha256(b"123456").hexdigest())

        # Verify incorrect OTP increments attempts
        is_valid, err_msg, code = verify_auth_challenge(mock_conn, "kakarlapavanshanmukh@gmail.com", "login", "000000", "secretpsk")
        self.assertFalse(is_valid)
        self.assertEqual(code, 401)
        self.assertEqual(fake_store["challenge"]["attempts"], 1)

        # Verify correct OTP succeeds and immediately purges row
        is_valid, err_msg, code = verify_auth_challenge(mock_conn, "kakarlapavanshanmukh@gmail.com", "login", "123456", "secretpsk")
        self.assertTrue(is_valid)
        self.assertEqual(code, 200)
        self.assertNotIn("challenge", fake_store)

    # 9. HTTPS Transactional Email & Dev Fallback Precedence
    def test_10_send_email_precedence_and_https_fallback(self):
        from app import send_email_safe

        # In dev mode without keys, non-blocking fallback returns True without crashing
        with patch.dict(os.environ, {"APP_ENV": "development", "RESEND_API_KEY": "", "BREVO_API_KEY": "", "MAIL_PASS": ""}):
            result = send_email_safe("kakarlapavanshanmukh@gmail.com", "Test Subject", "Test Body")
            self.assertTrue(result)

    # 10. Stale Telemetry Retention Pruning (30-Day Storage Guard)
    def test_11_telemetry_pruning(self):
        from app import prune_stale_telemetry_records

        mock_cursor = MagicMock()
        mock_cursor.rowcount = 42
        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_pool = MagicMock()
        mock_pool.get_connection.return_value = mock_conn

        pruned = prune_stale_telemetry_records(mock_pool)
        self.assertEqual(pruned, 42 * 3) # 3 tables pruned
        mock_conn.commit.assert_called_once()

if __name__ == '__main__':
    unittest.main()
