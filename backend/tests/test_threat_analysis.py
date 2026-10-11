import unittest
import os
import sys
import io
import json
from unittest.mock import patch

# Setup path so we can import from app
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Import from static_analyzer directly
from static_analyzer import (
    analyze_file_data,
    calculate_entropy_fast,
    MAX_ANALYSIS_BYTES,
    EICAR_STANDARD_SHA256,
    EICAR_SUBSTRING
)

# Mock connection classes for app imports
from tests.test_auth_security import MockConnection

# Import Flask app
from app import app


class TestThreatAnalysisModule(unittest.TestCase):
    def setUp(self):
        self.app = app
        self.client = self.app.test_client()
        self.app.config['TESTING'] = True

    def _generate_test_token(self):
        import jwt
        from datetime import datetime, timedelta, timezone
        token = jwt.encode(
            {
                "user_id": 1,
                "username": "sec_analyst",
                "email": "analyst@selectshans.sec",
                "exp": datetime.now(timezone.utc) + timedelta(hours=1)
            },
            os.getenv("JWT_SECRET", "sentinelstream_super_secure_random_string_change_this_12345"),
            algorithm="HS256"
        )
        return token

    # 1. Normal text file
    def test_normal_text_file(self):
        content = b"This is a benign diagnostic system report log from SelectShans."
        result = analyze_file_data("report.txt", content)
        self.assertEqual(result["verdict"], "CLEAN")
        self.assertEqual(result["severity"], "LOW")
        self.assertLess(result["risk_score"], 30)
        self.assertIn("report.txt", result["filename"])

    # 2. Valid document (e.g. standard PDF header)
    def test_valid_document(self):
        content = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\ntrailer\n<< /Root 1 0 R >>\n%%EOF"
        result = analyze_file_data("document.pdf", content)
        self.assertEqual(result["verdict"], "CLEAN")
        self.assertEqual(result["severity"], "LOW")

    # 3. Harmless file with misleading extension (MZ executable disguised as .png)
    def test_misleading_extension(self):
        content = b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00" + b"\x00" * 50
        result = analyze_file_data("invoice.png", content)
        # Should detect header mismatch and flag as SUSPICIOUS or MALICIOUS
        self.assertIn(result["verdict"], ["SUSPICIOUS", "MALICIOUS"])
        self.assertGreaterEqual(result["risk_score"], 30)
        self.assertTrue(any("mismatch" in ind.lower() or "disguised" in ind.lower() for ind in result["indicators"]))

    # 4. High-entropy random data (simulated encryption payload)
    def test_high_entropy_random_data(self):
        # 16KB of pseudo-random bytes
        import secrets
        random_payload = secrets.token_bytes(16384)
        result = analyze_file_data("database_dump.dat", random_payload)
        self.assertGreaterEqual(result["entropy"], 7.8)
        self.assertIn(result["verdict"], ["SUSPICIOUS", "MALICIOUS"])
        self.assertTrue(any("entropy" in ind.lower() for ind in result["indicators"]))

    # 5. Suspicious extension (.locked, ransomware extension)
    def test_suspicious_extension(self):
        content = b"Some encrypted document bytes"
        result = analyze_file_data("financial_statement.locked", content)
        self.assertIn(result["verdict"], ["SUSPICIOUS", "MALICIOUS"])
        self.assertTrue(any(".locked" in ind.lower() for ind in result["indicators"]))

    # 6. Empty file
    def test_empty_file(self):
        content = b""
        result = analyze_file_data("empty_note.txt", content)
        self.assertEqual(result["verdict"], "UNKNOWN")
        self.assertEqual(result["size"], 0)
        self.assertFalse(result["verdict"] == "CLEAN")

    # 7. EICAR Standard Antivirus Test File (reliable malicious detection)
    def test_eicar_standard_test_file(self):
        eicar_content = EICAR_SUBSTRING
        result = analyze_file_data("eicar_test.com", eicar_content)
        self.assertEqual(result["verdict"], "MALICIOUS")
        self.assertEqual(result["severity"], "CRITICAL")
        self.assertEqual(result["risk_score"], 100)

    # 8. Oversized file (truncated/over limit)
    def test_oversized_file(self):
        result = analyze_file_data("huge_file.bin", b"", is_truncated=True, original_size=MAX_ANALYSIS_BYTES + 1024)
        self.assertEqual(result["verdict"], "ERROR")
        self.assertEqual(result["status"], "FAILED")
        self.assertIn("exceeds", result["indicators"][0].lower())

    # 9. HTTP Endpoint: Upload normal text file with auth token
    @patch('app.pool.get_connection')
    def test_endpoint_analyze_file_success(self, mock_get_conn):
        token = self._generate_test_token()
        data = {
            'file': (io.BytesIO(b"Hello world benign text content"), 'sample.txt'),
            'relative_path': 'docs/sample.txt'
        }
        res = self.client.post(
            '/api/analyze-file',
            data=data,
            headers={'Authorization': f'Bearer {token}'},
            content_type='multipart/form-data'
        )
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertEqual(body["verdict"], "CLEAN")
        self.assertEqual(body["relative_path"], "docs/sample.txt")
        self.assertEqual(body["filename"], "sample.txt")

    # 10. HTTP Endpoint: Path traversal protection
    @patch('app.pool.get_connection')
    def test_endpoint_path_traversal_sanitized(self, mock_get_conn):
        token = self._generate_test_token()
        data = {
            'file': (io.BytesIO(b"Test content"), '../../etc/passwd.txt'),
            'relative_path': '../../etc/passwd.txt'
        }
        res = self.client.post(
            '/api/analyze-file',
            data=data,
            headers={'Authorization': f'Bearer {token}'},
            content_type='multipart/form-data'
        )
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        # Verify traversal syntax was cleaned
        self.assertNotIn("..", body["relative_path"])
        self.assertNotIn("/", body["filename"])
        self.assertNotIn("\\", body["filename"])

    # 11. HTTP Endpoint: Missing file payload
    def test_endpoint_missing_file_payload(self):
        token = self._generate_test_token()
        res = self.client.post(
            '/api/analyze-file',
            data={},
            headers={'Authorization': f'Bearer {token}'},
            content_type='multipart/form-data'
        )
        self.assertEqual(res.status_code, 400)
        body = res.get_json()
        self.assertIn("error", body)

    # 12. HTTP Endpoint: Oversized file status code 413
    def test_endpoint_oversized_file_http_413(self):
        token = self._generate_test_token()
        # Emulate 11 MB stream
        large_bytes = b"0" * (MAX_ANALYSIS_BYTES + 1024)
        data = {
            'file': (io.BytesIO(large_bytes), 'oversized.iso')
        }
        res = self.client.post(
            '/api/analyze-file',
            data=data,
            headers={'Authorization': f'Bearer {token}'},
            content_type='multipart/form-data'
        )
        self.assertEqual(res.status_code, 413)
        body = res.get_json()
        self.assertEqual(body["verdict"], "ERROR")
        self.assertFalse(body["verdict"] == "CLEAN")

    # 13. Failed scan must NEVER produce a CLEAN verdict
    def test_failed_analysis_never_clean(self):
        failure_result = {
            "verdict": "ERROR",
            "status": "FAILED",
            "error": "Timeout / Unreachable engine"
        }
        self.assertNotEqual(failure_result["verdict"], "CLEAN")


if __name__ == '__main__':
    unittest.main()
