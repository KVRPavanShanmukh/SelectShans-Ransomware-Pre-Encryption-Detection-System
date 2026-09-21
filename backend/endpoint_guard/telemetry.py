import os
import json
import time
import requests
import sqlite3
import threading
from logger import logger
from config import config_manager

DB_DIR = os.path.join(os.environ.get('PROGRAMDATA', 'C:\\ProgramData'), 'SelectShans', 'db')
DB_FILE = os.path.join(DB_DIR, 'telemetry.db')

class TelemetryManager:
    def __init__(self):
        os.makedirs(DB_DIR, exist_ok=True)
        self.conn = sqlite3.connect(DB_FILE, check_same_thread=False)
        self.cursor = self.conn.cursor()
        self._init_db()
        self.api_base = config_manager.get("api_base")
        self.token = config_manager.get("token")
        
        # Start background sender
        self.running = True
        self.sender_thread = threading.Thread(target=self._send_loop, daemon=True)
        self.sender_thread.start()

    def _init_db(self):
        self.cursor.execute('''
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                endpoint_id TEXT,
                event_type TEXT,
                payload TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                priority INTEGER DEFAULT 0
            )
        ''')
        self.conn.commit()

    def queue_event(self, event_type, payload, priority=0):
        # Prevent unbounded disk growth
        self.cursor.execute('SELECT COUNT(*) FROM events')
        count = self.cursor.fetchone()[0]
        if count > 10000:
            # Delete oldest low priority events
            self.cursor.execute('DELETE FROM events WHERE id IN (SELECT id FROM events ORDER BY priority ASC, timestamp ASC LIMIT 1000)')
            self.conn.commit()
            logger.warning("Queue full. Dropped 1000 oldest events.")

        try:
            payload_json = json.dumps(payload)
            self.cursor.execute('''
                INSERT INTO events (endpoint_id, event_type, payload, priority)
                VALUES (?, ?, ?, ?)
            ''', (config_manager.endpoint_id, event_type, payload_json, priority))
            self.conn.commit()
            logger.debug(f"Queued {event_type} event (priority {priority})")
        except Exception as e:
            logger.error(f"Failed to queue event: {e}")

    def _send_loop(self):
        backoff = 5
        while self.running:
            try:
                self.cursor.execute('SELECT id, event_type, payload FROM events ORDER BY priority DESC, timestamp ASC LIMIT 50')
                rows = self.cursor.fetchall()
                
                if not rows:
                    time.sleep(backoff)
                    continue

                activities = []
                row_ids = []
                for row in rows:
                    row_ids.append(row[0])
                    event_type = row[1]
                    payload = json.loads(row[2])
                    
                    if event_type == "sync_activities":
                        activities.extend(payload)
                    elif event_type == "ping":
                        # We just send ping natively
                        pass

                # If there are activities, send them via sync
                success = True
                if activities:
                    data = {
                        "token": self.token,
                        "activities": activities
                    }
                    try:
                        resp = requests.post(f"{self.api_base}/api/detector/sync-activities", json=data, timeout=10)
                        if resp.status_code == 200:
                            logger.info(f"Successfully synced {len(activities)} activities.")
                        else:
                            logger.warning(f"Backend rejected sync with status {resp.status_code}")
                            success = False
                    except Exception as e:
                        logger.error(f"Network error during sync: {e}")
                        success = False

                if success:
                    # Mark sent
                    placeholders = ','.join('?' for _ in row_ids)
                    self.cursor.execute(f'DELETE FROM events WHERE id IN ({placeholders})', row_ids)
                    self.conn.commit()
                    backoff = 5 # reset backoff
                else:
                    backoff = min(backoff * 2, 300) # Max 5 min
                    time.sleep(backoff)

            except Exception as e:
                logger.error(f"Error in telemetry loop: {e}")
                time.sleep(backoff)

    def send_ping(self):
        payload = {
            "token": self.token,
            "endpoint_id": config_manager.endpoint_id,
            "hostname": config_manager.hostname,
            "version": config_manager.get("service_version"),
            "os": "Windows"
        }
        self.queue_event("ping", payload, priority=1)

    def shutdown(self):
        self.running = False
        self.sender_thread.join(timeout=2)
        self.conn.close()

telemetry_manager = TelemetryManager()
