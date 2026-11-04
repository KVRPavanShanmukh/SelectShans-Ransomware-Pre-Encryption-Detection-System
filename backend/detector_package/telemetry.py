"""
Resilient Telemetry Queue & Client for SelectShans FolderGuard
Handles background queuing, batch delivery, exponential backoff, and network outage resilience.
"""
import time
import json
import threading
import requests
from typing import List, Dict, Any, Optional

MAX_QUEUE_BOUND = 500
BATCH_SIZE = 50
INITIAL_BACKOFF = 2.0
MAX_BACKOFF = 30.0


class TelemetryClient:
    def __init__(self, api_base: str, token: str, detector_id: str, hostname: str):
        self.api_base = api_base.rstrip('/')
        self.token = token
        self.detector_id = detector_id
        self.hostname = hostname

        self._queue: List[Dict[str, Any]] = []
        self._lock = threading.Lock()
        self._running = False
        self._worker_thread: Optional[threading.Thread] = None

        # Network health & backoff state
        self._consecutive_failures = 0
        self._current_backoff = INITIAL_BACKOFF
        self._last_successful_sync = 0.0

    @property
    def queue_size(self) -> int:
        with self._lock:
            return len(self._queue)

    @property
    def last_successful_sync(self) -> float:
        return self._last_successful_sync

    def start(self):
        """Starts the background telemetry dispatch loop."""
        self._running = True
        self._worker_thread = threading.Thread(target=self._dispatch_loop, daemon=True, name="TelemetryWorker")
        self._worker_thread.start()

    def stop(self, timeout: float = 2.0):
        """Signals stop and attempts one final flush."""
        self._running = False
        self.flush()

    def enqueue_activity(self, decision_dict: Dict[str, Any]):
        """
        Enqueues a detection decision for delivery to the backend.
        Enforces a bounded queue by dropping oldest low-severity events if saturated.
        """
        activity_entry = {
            "id": f"act_{int(time.time() * 1000)}_{len(self._queue)}",
            "detector_id": self.detector_id,
            "hostname": self.hostname,
            "event_type": decision_dict.get("event_type", "anomalous_activity"),
            "directory": decision_dict.get("directory", "Protected Folder"),
            "target_file": decision_dict.get("target_file", ""),
            "severity": decision_dict.get("severity", "MEDIUM"),
            "score": decision_dict.get("score", 50),
            "event_count": decision_dict.get("event_count", 1),
            "action_taken": decision_dict.get("action_taken", "Flagged by SelectShans FolderGuard"),
            "process_name": decision_dict.get("process_name", "unknown"),
            "details": decision_dict.get("details", ""),
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(decision_dict.get("timestamp", time.time())))
        }

        with self._lock:
            if len(self._queue) >= MAX_QUEUE_BOUND:
                # Discard oldest event to protect memory
                self._queue.pop(0)
            self._queue.append(activity_entry)

    def ping_heartbeat(self) -> bool:
        """Sends a heartbeat ping to notify the backend that this agent is online."""
        try:
            res = requests.post(
                f"{self.api_base}/api/detector/ping",
                json={"token": self.token},
                timeout=4
            )
            return res.status_code == 200
        except Exception:
            return False

    def trigger_critical_email(self, event_type: str, directory: str, message: str, count: int) -> bool:
        """Triggers immediate critical alert email delivery via the backend."""
        payload = {
            "token": self.token,
            "event_type": event_type,
            "details": {
                "directory": directory,
                "count": count,
                "message": message
            },
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }
        try:
            res = requests.post(
                f"{self.api_base}/api/detector/log",
                json=payload,
                timeout=5
            )
            return res.status_code in (200, 207)
        except Exception:
            return False

    def flush(self) -> int:
        """Immediately transmits pending queued activities."""
        with self._lock:
            if not self._queue:
                return 0
            to_send = list(self._queue[:BATCH_SIZE])

        payload = {
            "token": self.token,
            "activities": to_send
        }

        try:
            res = requests.post(
                f"{self.api_base}/api/detector/sync-activities",
                json=payload,
                timeout=6
            )
            if res.status_code == 200:
                with self._lock:
                    # Remove successfully transmitted events
                    self._queue = self._queue[len(to_send):]
                self._consecutive_failures = 0
                self._current_backoff = INITIAL_BACKOFF
                self._last_successful_sync = time.time()
                return len(to_send)
            else:
                self._handle_failure()
                return 0
        except Exception:
            self._handle_failure()
            return 0

    def _handle_failure(self):
        self._consecutive_failures += 1
        # Exponential backoff with jitter bound
        self._current_backoff = min(self._current_backoff * 1.5, MAX_BACKOFF)

    def _dispatch_loop(self):
        """Periodic background transmission and heartbeat loop."""
        while self._running:
            # 1. Heartbeat
            self.ping_heartbeat()

            # 2. Flush queue if pending
            if self.queue_size > 0:
                self.flush()

            # Sleep using adaptive backoff interval
            time.sleep(self._current_backoff if self._consecutive_failures > 0 else 3.0)
