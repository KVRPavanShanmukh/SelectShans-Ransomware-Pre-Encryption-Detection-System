import unittest
import os
import sys
import json
import time
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from tests.test_auth_security import MockConnection
from jwt_utils import create_token, verify_token
from app import (
    app, 
    _active_user_last_seen, 
    _user_cumulative_extension, 
    _session_activity_lock,
    _net_metrics_cache
)

class TestPassiveSessionManager(unittest.TestCase):
    def setUp(self):
        self.app = app
        self.client = self.app.test_client()
        self.app.config['TESTING'] = True
        
        # Reset memory state
        with _session_activity_lock:
            _active_user_last_seen.clear()
            _user_cumulative_extension.clear()

    def _create_token(self, user_id=1, expired_by_seconds=0):
        exp = datetime.now(timezone.utc) + timedelta(minutes=15) - timedelta(seconds=expired_by_seconds)
        token = create_token(
            user_id=user_id,
            username="analyst_test",
            email="analyst@selectshans.sec",
            expiry_timedelta=timedelta(seconds=(exp - datetime.now(timezone.utc)).total_seconds())
        )
        return token

    # 1. Session stats returns valid structure and real metric fields
    def test_session_stats_endpoint(self):
        # Register a couple of users in memory
        with _session_activity_lock:
            _active_user_last_seen[101] = datetime.now(timezone.utc) # active
            _active_user_last_seen[102] = datetime.now(timezone.utc) - timedelta(minutes=10) # passive

        res = self.client.get('/api/session/stats')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "success")
        self.assertIn("metrics", data)
        self.assertGreaterEqual(data["metrics"]["active_sessions"], 1)
        self.assertGreaterEqual(data["metrics"]["passive_sessions"], 1)
        self.assertIn("network_metrics_status", data["metrics"])
        self.assertIn("policy", data)
        self.assertEqual(data["policy"]["max_extension_minutes"], 10)

    # 2. Session extend selects random duration between 1 and 10 minutes
    def test_session_extend_duration_bounds(self):
        token = self._create_token(user_id=50)
        res = self.client.post(
            '/api/session/extend',
            headers={'Authorization': f'Bearer {token}'}
        )
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("extension_minutes", data)
        self.assertGreaterEqual(data["extension_minutes"], 1)
        self.assertLessEqual(data["extension_minutes"], 10)
        self.assertIn("token", data)
        
        # Verify newly issued token
        new_payload = verify_token(data["token"])
        self.assertIsNotNone(new_payload)
        self.assertEqual(new_payload["user_id"], 50)

    # 3. Cumulative extension limit enforcement (10 minutes max total)
    def test_cumulative_extension_cap(self):
        user_id = 77
        with _session_activity_lock:
            # Pre-set user to 9 minutes extended already (540 seconds)
            _user_cumulative_extension[user_id] = 540

        token = self._create_token(user_id=user_id)
        res = self.client.post(
            '/api/session/extend',
            headers={'Authorization': f'Bearer {token}'}
        )
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        # Remaining was only 1 minute, so extension must not exceed 1 minute
        self.assertLessEqual(data["extension_minutes"], 1)

        # Now cumulative limit is reached (600s). Next request must fail with 403
        res2 = self.client.post(
            '/api/session/extend',
            headers={'Authorization': f'Bearer {data["token"]}'}
        )
        self.assertEqual(res2.status_code, 403)
        data2 = res2.get_json()
        self.assertTrue(data2.get("cumulative_limit_reached"))

    # 4. Reject expired sessions beyond grace period
    def test_reject_expired_session_beyond_grace(self):
        # Token expired 120 seconds ago (> 60s grace)
        expired_token = self._create_token(user_id=99, expired_by_seconds=1000)
        res = self.client.post(
            '/api/session/extend',
            headers={'Authorization': f'Bearer {expired_token}'}
        )
        self.assertEqual(res.status_code, 401)
        data = res.get_json()
        self.assertTrue(data.get("expired"))

    # 5. Reject unauthorized requests without token
    def test_reject_unauthorized_extension(self):
        res = self.client.post('/api/session/extend')
        self.assertEqual(res.status_code, 401)

        res2 = self.client.post(
            '/api/session/extend',
            headers={'Authorization': 'Bearer null'}
        )
        self.assertEqual(res2.status_code, 401)


if __name__ == '__main__':
    unittest.main()
