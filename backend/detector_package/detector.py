import os
import time
import json
import requests
from datetime import datetime
from collections import deque
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# ==============================
# LOAD CONFIG
# ==============================

with open("config.json", "r") as f:
    config = json.load(f)

API_BASE = config["api_base"]
TOKEN = config["token"]
USER_EMAIL = config["email"]

# ==============================
# SETTINGS
# ==============================

RENAME_THRESHOLD = 5
TIME_WINDOW = 10           # seconds

rename_events = deque()

# ==============================
# LOCAL LOGGING
# ==============================

LOG_DIR = "logs"
LOG_FILE = os.path.join(LOG_DIR, "monitor.log")

if not os.path.exists(LOG_DIR):
    os.makedirs(LOG_DIR)

def write_local_log(message):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    entry = f"[{timestamp}] {message}\n"

    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(entry)

# ==============================
# BACKEND ALERT FUNCTION
# ==============================

def send_alert(event_type, details):
    payload = {
        "token": TOKEN,
        "event_type": event_type,
        "details": details,
        "timestamp": datetime.now().isoformat()
    }

    try:
        response = requests.post(
            f"{API_BASE}/api/detector/log",
            json=payload,
            timeout=5
        )

        print("Alert sent to backend. Status:", response.status_code)

    except Exception as e:
        print("Backend alert failed:", e)

# ==============================
# MONITOR CLASS
# ==============================

class FolderMonitor(FileSystemEventHandler):

    def on_moved(self, event):

        now = time.time()
        rename_events.append(now)

        write_local_log(f"File renamed: {event.src_path}")

        # Remove old events outside time window
        while rename_events and now - rename_events[0] > TIME_WINDOW:
            rename_events.popleft()

        print("Current rename count:", len(rename_events))

        # If threshold crossed → alert
        if len(rename_events) >= RENAME_THRESHOLD:

            message = "⚠ Mass file rename detected"
            write_local_log(message)

            send_alert(
                event_type="mass_rename",
                details={
                    "directory": MONITOR_PATH,
                    "count": len(rename_events)
                }
            )

            rename_events.clear()

# ==============================
# MAIN FUNCTION
# ==============================

import threading

def ping_loop():
    while True:
        try:
            requests.post(
                f"{API_BASE}/api/detector/ping",
                json={"token": TOKEN},
                timeout=5
            )
        except Exception:
            pass
        time.sleep(5)

def start_monitor(path):
    # Start active status ping background thread
    threading.Thread(target=ping_loop, daemon=True).start()

    observer = Observer()
    observer.schedule(FolderMonitor(), path, recursive=True)
    observer.start()

    print("\n===================================")
    print(" SentinelStream FolderGuard Running")
    print(" Monitoring:", path)
    print(" Logs stored in:", LOG_FILE)
    print(" Threshold:", RENAME_THRESHOLD)
    print(" Time Window:", TIME_WINDOW, "seconds")
    print("===================================\n")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()

    observer.join()

# ==============================
# ENTRY POINT
# ==============================

if __name__ == "__main__":

    user_input = input("Enter directory to monitor: ").strip()

    if not os.path.exists(user_input):
        print("Invalid directory.")
    else:
        MONITOR_PATH = user_input
        start_monitor(MONITOR_PATH)