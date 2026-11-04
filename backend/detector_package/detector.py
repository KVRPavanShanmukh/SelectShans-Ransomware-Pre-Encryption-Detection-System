"""
SelectShans FolderGuard – Authoritative Endpoint Detection Agent
Monitors protected filesystem directories, evaluates behavioral heuristics in real time,
identifies pre-encryption ransomware activity, and syncs telemetry with the SOC backend.
"""
import os
import sys
import time
import json
import socket
import uuid
import signal
import threading
from datetime import datetime
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# Consolidated detection modules
from canary import SafeCanaryManager
from engine import BehavioralDetectionEngine, DetectionDecision
from telemetry import TelemetryClient

# ==============================
# CONFIGURATION & INITIALIZATION
# ==============================

CONFIG_FILE = "config.json"
DEFAULT_CONFIG = {
    "api_base": "http://127.0.0.1:5000",
    "token": "demo_token",
    "email": "user@selectshans.sec",
    "time_window_seconds": 10.0,
    "threshold_rename": 5,
    "threshold_write": 10,
    "threshold_delete": 8,
    "entropy_threshold": 7.2,
    "alert_cooldown_seconds": 15.0,
    "max_queue_size": 1000,
    "custom_extensions": []
}

if os.path.exists(CONFIG_FILE):
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            config = {**DEFAULT_CONFIG, **json.load(f)}
    except Exception:
        config = DEFAULT_CONFIG
else:
    config = DEFAULT_CONFIG

API_BASE = config.get("api_base", "http://127.0.0.1:5000")
TOKEN = config.get("token", "")
USER_EMAIL = config.get("email", "")
HOSTNAME = socket.gethostname()
DETECTOR_ID = str(uuid.uuid4())

# Local log setup
LOG_DIR = "logs"
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "monitor.log")


def write_local_log(message: str):
    """Writes timestamped status or alert entry to local log and stdout."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    entry = f"[{timestamp}] {message}\n"
    try:
        enc = sys.stdout.encoding or 'utf-8'
        print(entry.strip().encode(enc, errors='replace').decode(enc))
    except Exception:
        print(entry.strip().encode('ascii', errors='replace').decode('ascii'))
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(entry)
    except Exception:
        pass


# ==============================
# WATCHDOG EVENT HANDLER
# ==============================

class FolderMonitor(FileSystemEventHandler):
    """
    User-mode filesystem event consumer.
    Captures create, modify, rename, and delete notifications and dispatches them
    to the BehavioralDetectionEngine.
    """
    def __init__(self, engine: BehavioralDetectionEngine, telemetry: TelemetryClient):
        super().__init__()
        self.engine = engine
        self.telemetry = telemetry

    def _handle_decision(self, decision: DetectionDecision):
        if not decision:
            return

        sev = decision.severity
        score = decision.score
        msg = f"🚨 [{sev} - {score}/100] {decision.category}: {decision.details} (Target: {decision.target_file or decision.directory})"
        write_local_log(msg)

        # Enqueue for backend SOC transmission
        self.telemetry.enqueue_activity(decision.to_dict())

        # If HIGH or CRITICAL, dispatch immediate email trigger
        if sev in ("HIGH", "CRITICAL"):
            threading.Thread(
                target=self.telemetry.trigger_critical_email,
                args=(
                    decision.event_type,
                    decision.directory,
                    decision.details,
                    decision.event_count
                ),
                daemon=True
            ).start()

    def on_created(self, event):
        if event.is_directory:
            return
        decision = self.engine.process_file_created(event.src_path)
        if decision:
            self._handle_decision(decision)

    def on_modified(self, event):
        if event.is_directory:
            return
        decision = self.engine.process_file_modified(event.src_path)
        if decision:
            self._handle_decision(decision)

    def on_moved(self, event):
        decision = self.engine.process_file_renamed(event.src_path, event.dest_path)
        if decision:
            self._handle_decision(decision)

    def on_deleted(self, event):
        if event.is_directory:
            return
        decision = self.engine.process_file_deleted(event.src_path)
        if decision:
            self._handle_decision(decision)


# ==============================
# MONITOR ORCHESTRATOR
# ==============================

class FolderGuardAgent:
    def __init__(self, monitored_path: str):
        self.monitored_path = os.path.normcase(os.path.abspath(monitored_path))
        self.canary_mgr = SafeCanaryManager(instance_id=DETECTOR_ID[:8])
        self.engine = BehavioralDetectionEngine(
            monitored_directory=self.monitored_path,
            time_window_seconds=float(config.get("time_window_seconds", 10.0)),
            threshold_rename=int(config.get("threshold_rename", 5)),
            threshold_write=int(config.get("threshold_write", 10)),
            threshold_delete=int(config.get("threshold_delete", 8)),
            entropy_threshold=float(config.get("entropy_threshold", 7.2)),
            alert_cooldown_seconds=float(config.get("alert_cooldown_seconds", 15.0)),
            max_queue_size=int(config.get("max_queue_size", 1000)),
            custom_extensions=config.get("custom_extensions", []),
            canary_manager=self.canary_mgr
        )
        self.telemetry = TelemetryClient(
            api_base=API_BASE,
            token=TOKEN,
            detector_id=DETECTOR_ID,
            hostname=HOSTNAME
        )
        self.observer = Observer()
        self._running = False

    def start(self):
        write_local_log("Deploying canary decoys in monitored directory...")
        deployed = self.canary_mgr.deploy_canaries(self.monitored_path)
        write_local_log(f"Active canary decoys: {len(deployed)} deployed.")

        # Start background telemetry sync & heartbeat
        self.telemetry.start()

        # Schedule watchdog handler
        handler = FolderMonitor(self.engine, self.telemetry)
        self.observer.schedule(handler, self.monitored_path, recursive=True)
        self.observer.start()
        self._running = True

        print("\n=======================================================")
        print("  SelectShans FolderGuard Agent - Running & Connected")
        print("=======================================================")
        print(f" Monitored Folder: {self.monitored_path}")
        print(f" Registered Email: {USER_EMAIL}")
        print(f" Website API Base: {API_BASE}")
        print(f" Local Log File  : {LOG_FILE}")
        print(f" Canaries Active : {len(deployed)}")
        print(" Status          : Active & Syncing Anomalous Activities")
        print("=======================================================\n")

    def stop(self):
        if not self._running:
            return
        self._running = False
        write_local_log("Shutting down SelectShans FolderGuard...")

        try:
            self.observer.stop()
            self.observer.join(timeout=3)
        except Exception:
            pass

        # Clean up only canaries created by this instance
        cleaned = self.canary_mgr.cleanup()
        write_local_log(f"Canary decoys safely removed: {cleaned}.")

        # Flush final telemetry
        self.telemetry.stop(timeout=2.0)
        write_local_log("FolderGuard stopped cleanly.")


def start_monitor(path: str):
    agent = FolderGuardAgent(path)

    def signal_handler(signum, frame):
        agent.stop()
        sys.exit(0)

    try:
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
    except Exception:
        pass

    agent.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        agent.stop()


# ==============================
# ENTRY POINT
# ==============================

if __name__ == "__main__":
    print("\n-------------------------------------------------------")
    print(" SelectShans FolderGuard - Downloadable Application")
    print("-------------------------------------------------------")
    if len(sys.argv) > 1:
        target_dir = sys.argv[1].strip()
    else:
        target_dir = input("Enter directory to monitor for anomalous activities: ").strip()

    if not target_dir:
        target_dir = os.getcwd()
        print(f"Using default current directory: {target_dir}")

    if not os.path.exists(target_dir):
        print(f"Directory '{target_dir}' does not exist. Creating directory...")
        try:
            os.makedirs(target_dir)
        except Exception as e:
            print("Failed to create directory:", e)
            target_dir = os.getcwd()

    start_monitor(target_dir)
