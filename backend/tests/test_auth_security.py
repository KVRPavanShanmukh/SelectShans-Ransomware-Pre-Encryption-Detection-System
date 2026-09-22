import unittest
import os
import sys
import json
from unittest.mock import patch, MagicMock

# Setup path so we can import from app
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# We need to mock MySQL before importing app
class MockCursor:
    def __init__(self, role='user', returns_data=True):
        self.role = role
        self.returns_data = returns_data
        
    def execute(self, *args, **kwargs):
        pass
        
    def fetchone(self):
        if not self.returns_data:
            return None
        return {'id': 1, 'email': 'test@example.com', 'role': self.role}
        
    def fetchall(self):
        if not self.returns_data:
            return []
        return [{'id': 1, 'email': 'test@example.com', 'role': self.role}]
        
    def close(self):
        pass

class MockConnection:
    def __init__(self, role='user', returns_data=True):
        self.role = role
        self.returns_data = returns_data
        
    def cursor(self, dictionary=False, buffered=False):
        return MockCursor(role=self.role, returns_data=self.returns_data)
        
    def commit(self):
        pass
        
    def rollback(self):
        pass
        
    def close(self):
        pass

class MockPool:
    def __init__(self, role='user'):
        self.role = role
        
    def get_connection(self):
        return MockConnection(role=self.role)

# Now we can import the app. We'll patch the pool.
from app import app, pool

class TestAuthSecurity(unittest.TestCase):
    def setUp(self):
        self.app = app
        self.client = self.app.test_client()
        self.app.config['TESTING'] = True

    def _generate_test_token(self, role):
        import jwt
        from datetime import datetime, timedelta, timezone
        token = jwt.encode(
            {
                "user_id": 1,
                "username": "testuser",
                "email": "test@example.com",
                "exp": datetime.now(timezone.utc) + timedelta(hours=1)
            },
            os.getenv("JWT_SECRET", "sentinelstream_super_secure_random_string_change_this_12345"),
            algorithm="HS256"
        )
        return token

    @patch('app.pool.get_connection')
    def test_unauthenticated_security_report(self, mock_get_conn):
        # Should return 401 Unauthorized
        response = self.client.get('/api/admin/security-report')
        self.assertEqual(response.status_code, 401)
        
    @patch('app.pool.get_connection')
    def test_normal_user_security_report(self, mock_get_conn):
        mock_get_conn.return_value = MockConnection(role='user')
        token = self._generate_test_token('user')
        
        response = self.client.get('/api/admin/security-report', headers={'Authorization': f'Bearer {token}'})
        self.assertEqual(response.status_code, 403)
        self.assertIn(b"Admin access required", response.data)
        
    @patch('app.pool.get_connection')
    def test_admin_user_security_report(self, mock_get_conn):
        mock_get_conn.return_value = MockConnection(role='admin')
        token = self._generate_test_token('admin')
        
        # Will fail with 500 in test because generate_pdf_report expects full DB data, 
        # but shouldn't return 403 or 401. Let's patch generate_pdf_report to avoid DB errors during test.
        with patch('app.generate_pdf_report', return_value='/tmp/fake.pdf'):
            with patch('app.os.path.exists', return_value=True):
                with patch('app.send_file', return_value=self.app.response_class("PDF_CONTENT", status=200)):
                    response = self.client.get('/api/admin/security-report', headers={'Authorization': f'Bearer {token}'})
                    self.assertEqual(response.status_code, 200)

    @patch('app.pool.get_connection')
    def test_unauthenticated_alerts(self, mock_get_conn):
        response = self.client.get('/api/alerts')
        self.assertEqual(response.status_code, 401)
        
    @patch('app.pool.get_connection')
    def test_unauthenticated_alert_resolve(self, mock_get_conn):
        response = self.client.post('/api/alerts/1/resolve')
        self.assertEqual(response.status_code, 401)
        
    @patch('app.pool.get_connection')
    def test_normal_user_clear_data(self, mock_get_conn):
        mock_get_conn.return_value = MockConnection(role='user')
        token = self._generate_test_token('user')
        
        response = self.client.post('/api/admin/clear-data', headers={'Authorization': f'Bearer {token}'})
        self.assertEqual(response.status_code, 403)

    @patch('app.pool.get_connection')
    def test_admin_clear_data(self, mock_get_conn):
        mock_get_conn.return_value = MockConnection(role='admin')
        token = self._generate_test_token('admin')
        
        response = self.client.post('/api/admin/clear-data', headers={'Authorization': f'Bearer {token}'})
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"All data cleared", response.data)

if __name__ == '__main__':
    unittest.main()
