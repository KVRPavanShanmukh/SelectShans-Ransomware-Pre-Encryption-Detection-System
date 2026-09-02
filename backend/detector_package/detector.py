import os
import time
import json
import requests
import threading
from datetime import datetime
from collections import deque
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# ==============================
# LOAD CONFIG
# ==============================

CONFIG_FILE = "config.json"
if os.path.exists(CONFIG_FILE):
    with open(CONFIG_FILE, "r") as f:
        config = json.load(f)
else:
    config = {
        "api_base": "http://127.0.0.1:5000",
        "token": "demo_token",
        "email": "user@selectshans.sec"
    }

API_BASE = config.get("api_base", "http://127.0.0.1:5000")
TOKEN = config.get("token", "")
USER_EMAIL = config.get("email", "")

# ==============================
# SETTINGS & LISTS
# ==============================

RENAME_THRESHOLD = 4
WRITE_THRESHOLD = 10
TIME_WINDOW = 10           # seconds

rename_events = deque()
write_events = deque()

# Marked list of anomalous activities to share with website
anomalous_activities_list = []
activity_lock = threading.Lock()

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
    print(entry.strip())
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(entry)

# ==============================
# WEBSITE SYNC & EMAIL TRIGGER
# ==============================

def trigger_website_email_alert(event_type, directory, details_str, count):
    """Triggers the website backend to send an immediate email alert to the user."""
    payload = {
        "token": TOKEN,
        "event_type": event_type,
        "details": {
            "directory": directory,
            "count": count,
            "message": details_str
        },
        "timestamp": datetime.now().isoformat()
    }

    try:
        response = requests.post(
            f"{API_BASE}/api/detector/log",
            json=payload,
            timeout=5
        )
        write_local_log(f"⚡ Website email trigger sent to backend (Status: {response.status_code})")
    except Exception as e:
        write_local_log(f"⚠️ Website email trigger failed: {e}")

def sync_activities_to_website():
    """Syncs the compiled anomalous activities list to the website server."""
    with activity_lock:
        if not anomalous_activities_list:
            return
        # Copy current list to sync
        to_sync = list(anomalous_activities_list)

    payload = {
        "token": TOKEN,
        "activities": to_sync
    }

    try:
        response = requests.post(
            f"{API_BASE}/api/detector/sync-activities",
            json=payload,
            timeout=5
        )
        if response.status_code == 200:
            write_local_log(f"🌐 Shared {len(to_sync)} anomalous activity items with website.")
    except Exception as e:
        write_local_log(f"⚠️ Failed to sync activities with website: {e}")

def mark_anomalous_activity(event_type, directory, target_file, severity, count, action_taken, process_name="FolderGuard Agent"):
    """Marks an anomalous activity and adds it to the list shared with the website."""
    activity_entry = {
        "id": f"act_{int(time.time()*1000)}",
        "event_type": event_type,
        "directory": directory,
        "target_file": target_file,
        "severity": severity,
        "event_count": count,
        "action_taken": action_taken,
        "process_name": process_name,
        "timestamp": datetime.now().isoformat()
    }

    with activity_lock:
        anomalous_activities_list.append(activity_entry)

    write_local_log(f"🚨 MARKED ANOMALOUS ACTIVITY [{severity}]: {event_type} on {target_file or directory}")

    # Immediately sync list to website
    threading.Thread(target=sync_activities_to_website, daemon=True).start()

    # Trigger website to email user if severity is HIGH or CRITICAL
    if severity in ["HIGH", "CRITICAL"]:
        threading.Thread(
            target=trigger_website_email_alert,
            args=(event_type, directory, f"Flagged {event_type} on {target_file}", count),
            daemon=True
        ).start()

# ==============================
# MONITOR CLASS
# ==============================

class FolderMonitor(FileSystemEventHandler):

    def __init__(self, monitored_path):
        super().__init__()
        self.monitored_path = monitored_path

    def on_moved(self, event):
        now = time.time()
        rename_events.append(now)
        
        target_ext = os.path.splitext(event.dest_path)[1].lower()
        is_ransom_ext = target_ext in [".locked", ".crypto", ".enc", ".crypted", ".ransom"]

        write_local_log(f"File moved/renamed: {event.src_path} -> {event.dest_path}")

        # Remove old events outside time window
        while rename_events and now - rename_events[0] > TIME_WINDOW:
            rename_events.popleft()

        # Check for encrypted extension rename surge or mass rename
        if is_ransom_ext or len(rename_events) >= RENAME_THRESHOLD:
            severity = "CRITICAL" if is_ransom_ext else "HIGH"
            event_type = "ransomware_extension_rename" if is_ransom_ext else "mass_rename"
            
            mark_anomalous_activity(
                event_type=event_type,
                directory=self.monitored_path,
                target_file=os.path.basename(event.dest_path),
                severity=severity,
                count=len(rename_events),
                action_taken="Process Marked & Website Email Triggered",
                process_name="FolderGuard Agent"
            )
            rename_events.clear()

    def on_modified(self, event):
        if event.is_directory:
            return

        now = time.time()
        write_events.append(now)

        while write_events and now - write_events[0] > TIME_WINDOW:
            write_events.popleft()

        filename = os.path.basename(event.src_path)

        # Check for canary file tamper
        if "canary" in filename.lower() or "honey" in filename.lower():
            mark_anomalous_activity(
                event_type="canary_file_breach",
                directory=self.monitored_path,
                target_file=filename,
                severity="CRITICAL",
                count=1,
                action_taken="Canary Decoy Tripped & Email Alert Sent",
                process_name="FolderGuard Agent"
            )

        # Check for rapid write surge
        elif len(write_events) >= WRITE_THRESHOLD:
            mark_anomalous_activity(
                event_type="rapid_file_write",
                directory=self.monitored_path,
                target_file=filename,
                severity="MEDIUM",
                count=len(write_events),
                action_taken="Rapid Write Rate Logged to Website",
                process_name="FolderGuard Agent"
            )
            write_events.clear()

# ==============================
# BACKGROUND THREADS
# ==============================

def ping_and_sync_loop():
    while True:
        try:
            # 1. Ping active status
            requests.post(
                f"{API_BASE}/api/detector/ping",
                json={"token": TOKEN},
                timeout=5
            )
            # 2. Sync activity list to website
            sync_activities_to_website()
        except Exception:
            pass
        time.sleep(5)

def start_monitor(path):
    # Start heartbeat ping & activity sync loop
    threading.Thread(target=ping_and_sync_loop, daemon=True).start()

    observer = Observer()
    observer.schedule(FolderMonitor(path), path, recursive=True)
    observer.start()

    print("\n=======================================================")
    print("  SelectShans FolderGuard Agent - Running & Connected")
    print("=======================================================")
    print(f" Monitored Folder: {path}")
    print(f" Registered Email: {USER_EMAIL}")
    print(f" Website API Base: {API_BASE}")
    print(f" Local Log File  : {LOG_FILE}")
    print(" Status          : Active & Syncing Anomalous Activities")
    print("=======================================================\n")

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
    print("\n-------------------------------------------------------")
    print(" SelectShans FolderGuard - Downloadable Application")
    print("-------------------------------------------------------")
    user_input = input("Enter directory to monitor for anomalous activities: ").strip()

    if not user_input:
        user_input = os.getcwd()
        print(f"Using default current directory: {user_input}")

    if not os.path.exists(user_input):
        print(f"Directory '{user_input}' does not exist. Creating directory...")
        try:
            os.makedirs(user_input)
        except Exception as e:
            print("Failed to create directory:", e)
            user_input = os.getcwd()

    MONITOR_PATH = user_input
    start_monitor(MONITOR_PATH)