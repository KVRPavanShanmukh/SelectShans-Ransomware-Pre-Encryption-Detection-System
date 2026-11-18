"""
SelectShans FolderGuard – Endpoint Protection Desktop GUI
Lightweight, zero-dependency tkinter desktop interface for real-time ransomware defense,
target folder selection, and live in-memory threat monitoring without disk I/O bloat.
"""
import os
import sys
import json
import time
import socket
import uuid
import threading
from collections import deque
from datetime import datetime

import tkinter as tk
from tkinter import ttk, filedialog, messagebox

# Detection & Telemetry modules
from canary import SafeCanaryManager
from engine import BehavioralDetectionEngine, DetectionDecision
from telemetry import TelemetryClient
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# Configuration file location
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, "config.json")

DEFAULT_CONFIG = {
    "api_base": "http://127.0.0.1:5000",
    "token": "demo_token",
    "email": "kakarlapavanshanmukh@gmail.com",
    "user_id": 1,
    "time_window_seconds": 10.0,
    "threshold_rename": 5,
    "threshold_write": 10,
    "threshold_delete": 8,
    "entropy_threshold": 7.2,
    "alert_cooldown_seconds": 15.0,
    "max_queue_size": 1000,
    "custom_extensions": [".locked", ".crypto", ".enc", ".crypted", ".ransom", ".wnry"]
}


def load_config():
    """Loads configuration safely from config.json with fallback defaults."""
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return {**DEFAULT_CONFIG, **json.load(f)}
        except Exception:
            return DEFAULT_CONFIG
    return DEFAULT_CONFIG


# =====================================================
# IN-MEMORY WATCHDOG EVENT HANDLER (ZERO DISK LOGGING)
# =====================================================

class GuiFolderMonitor(FileSystemEventHandler):
    """
    Consumes filesystem events across monitored directories,
    evaluates behavioral heuristics, and routes alerts to the GUI in-memory feed.
    """
    def __init__(self, engine: BehavioralDetectionEngine, telemetry: TelemetryClient, log_callback, stats_callback):
        super().__init__()
        self.engine = engine
        self.telemetry = telemetry
        self.log_callback = log_callback
        self.stats_callback = stats_callback

    def _handle_decision(self, decision: DetectionDecision):
        if not decision:
            return

        sev = decision.severity
        score = decision.score
        target = decision.target_file or decision.directory
        log_msg = f"[{sev} - {score}/100] {decision.category}: {decision.details} -> {target}"
        
        level = "CRITICAL" if sev == "CRITICAL" else ("WARNING" if sev == "HIGH" else "INFO")
        self.log_callback(log_msg, level=level)
        self.stats_callback(alert=True)

        # Enqueue for backend SOC transmission over HTTPS/REST
        self.telemetry.enqueue_activity(decision.to_dict())

        # Immediate alert dispatch for severe anomalies
        if sev in ("HIGH", "CRITICAL"):
            threading.Thread(
                target=self.telemetry.trigger_critical_email,
                args=(decision.event_type, decision.directory, decision.details, decision.event_count),
                daemon=True
            ).start()

    def on_created(self, event):
        if event.is_directory:
            return
        self.stats_callback(event=True)
        decision = self.engine.process_file_created(event.src_path)
        if decision:
            self._handle_decision(decision)

    def on_modified(self, event):
        if event.is_directory:
            return
        self.stats_callback(event=True)
        decision = self.engine.process_file_modified(event.src_path)
        if decision:
            self._handle_decision(decision)

    def on_moved(self, event):
        self.stats_callback(event=True)
        decision = self.engine.process_file_renamed(event.src_path, event.dest_path)
        if decision:
            self._handle_decision(decision)

    def on_deleted(self, event):
        if event.is_directory:
            return
        self.stats_callback(event=True)
        decision = self.engine.process_file_deleted(event.src_path)
        if decision:
            self._handle_decision(decision)


# =====================================================
# MULTI-DIRECTORY PROTECTION CONTROLLER
# =====================================================

class MultiFolderGuardController:
    """
    Orchestrates multi-folder behavioral detection, canary trap deployment,
    and background telemetry synchronization.
    """
    def __init__(self, config: dict, log_callback, stats_callback):
        self.config = config
        self.log_callback = log_callback
        self.stats_callback = stats_callback

        self.api_base = config.get("api_base") or config.get("api_url", "http://127.0.0.1:5000")
        self.token = config.get("token") or config.get("detector_token", "")
        self.user_email = config.get("email", "kakarlapavanshanmukh@gmail.com")
        self.hostname = socket.gethostname()
        self.detector_id = str(uuid.uuid4())

        self.canary_mgr = SafeCanaryManager(instance_id=self.detector_id[:8])
        self.telemetry = TelemetryClient(
            api_base=self.api_base,
            token=self.token,
            detector_id=self.detector_id,
            hostname=self.hostname
        )
        self.observer = None
        self.is_running = False
        self._lock = threading.Lock()

    def start(self, directories: list):
        with self._lock:
            if self.is_running:
                return

            valid_dirs = [os.path.normcase(os.path.abspath(d)) for d in directories if os.path.isdir(d)]
            if not valid_dirs:
                raise ValueError("No valid existing directories selected for protection.")

            self.log_callback("Starting SelectShans Endpoint Protection...", level="INFO")
            
            # Start background telemetry sync
            self.telemetry.start()
            self.observer = Observer()
            total_canaries = 0

            for target_dir in valid_dirs:
                # Deploy cryptographically signed canary decoys
                deployed = self.canary_mgr.deploy_canaries(target_dir)
                total_canaries += len(deployed)
                self.log_callback(f"Canary decoys deployed: {len(deployed)} traps armed in {target_dir}", level="CANARY")

                engine = BehavioralDetectionEngine(
                    monitored_directory=target_dir,
                    time_window_seconds=float(self.config.get("time_window_seconds", 10.0)),
                    threshold_rename=int(self.config.get("threshold_rename", 5)),
                    threshold_write=int(self.config.get("threshold_write", 10)),
                    threshold_delete=int(self.config.get("threshold_delete", 8)),
                    entropy_threshold=float(self.config.get("entropy_threshold", 7.2)),
                    alert_cooldown_seconds=float(self.config.get("alert_cooldown_seconds", 15.0)),
                    max_queue_size=int(self.config.get("max_queue_size", 1000)),
                    custom_extensions=self.config.get("custom_extensions", []),
                    canary_manager=self.canary_mgr
                )

                handler = GuiFolderMonitor(engine, self.telemetry, self.log_callback, self.stats_callback)
                self.observer.schedule(handler, target_dir, recursive=True)

            self.observer.start()
            self.is_running = True
            self.stats_callback(canaries=total_canaries)
            self.log_callback(f"Active Protection ONLINE: Monitoring {len(valid_dirs)} directory paths ({total_canaries} canaries active).", level="SUCCESS")

    def stop(self):
        with self._lock:
            if not self.is_running:
                return

            self.log_callback("Initiating safe protection shutdown...", level="INFO")
            self.is_running = False

            if self.observer:
                try:
                    self.observer.stop()
                    self.observer.join(timeout=3)
                except Exception:
                    pass
                self.observer = None

            # Safely decommission all canary decoys
            cleaned = self.canary_mgr.cleanup()
            self.log_callback(f"Canary decoys cleanly disarmed and removed: {cleaned} files purged.", level="CANARY")

            # Flush remaining telemetry events
            self.telemetry.stop(timeout=2.0)
            self.stats_callback(canaries=0)
            self.log_callback("SelectShans Endpoint Protection STOPPED cleanly.", level="INFO")


# =====================================================
# TKINTER DESKTOP INTERFACE
# =====================================================

class FolderGuardApp:
    """Dark SOC-themed Tkinter GUI for SelectShans Endpoint Protection."""
    
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("SelectShans FolderGuard — Endpoint Protection")
        self.root.geometry("880x680")
        self.root.minsize(780, 560)
        self.root.configure(bg="#0b0f19")

        self.config = load_config()
        self.target_folders = []
        self.event_counter = 0
        self.alert_counter = 0
        self.canary_counter = 0

        # In-memory bounded console log (strictly in RAM, max 200 entries)
        self.memory_logs = deque(maxlen=200)

        self.controller = MultiFolderGuardController(
            config=self.config,
            log_callback=self.thread_safe_log,
            stats_callback=self.thread_safe_stats
        )

        self._setup_styles()
        self._build_ui()
        self._init_defaults()

        # Intercept window close for safe canary disarm
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)

    def _setup_styles(self):
        """Configures dark SOC TTK palette."""
        style = ttk.Style(self.root)
        style.theme_use("clam")

        # Base Frame & Label styles
        style.configure("TFrame", background="#0b0f19")
        style.configure("Card.TFrame", background="#111827", relief="flat")
        style.configure("TLabel", background="#0b0f19", foreground="#e5e7eb", font=("Segoe UI", 9))
        style.configure("Card.TLabel", background="#111827", foreground="#e5e7eb", font=("Segoe UI", 9))
        style.configure("Muted.TLabel", background="#111827", foreground="#9ca3af", font=("Segoe UI", 8))
        style.configure("Header.TLabel", background="#0b0f19", foreground="#00ffcc", font=("Segoe UI", 14, "bold"))
        style.configure("SubHeader.TLabel", background="#0b0f19", foreground="#9ca3af", font=("Segoe UI", 9))
        style.configure("BadgeOnline.TLabel", background="#064e3b", foreground="#34d399", font=("Segoe UI", 8, "bold"), padding=4)
        style.configure("BadgeOffline.TLabel", background="#374151", foreground="#9ca3af", font=("Segoe UI", 8, "bold"), padding=4)

    def _build_ui(self):
        """Constructs the desktop GUI layout."""
        # Top Header Bar
        header_frame = tk.Frame(self.root, bg="#0d1424", height=65, padx=20, pady=12)
        header_frame.pack(fill=tk.X, side=tk.TOP)

        title_lbl = tk.Label(header_frame, text="🛡️ SELECTSHANS FOLDERGUARD", fg="#00ffcc", bg="#0d1424", font=("Segoe UI", 13, "bold"))
        title_lbl.pack(side=tk.LEFT)

        subtitle_lbl = tk.Label(header_frame, text="  |  Pre-Encryption Ransomware Defense Agent", fg="#64748b", bg="#0d1424", font=("Segoe UI", 9))
        subtitle_lbl.pack(side=tk.LEFT)

        self.status_pill = tk.Label(header_frame, text="● STANDBY", fg="#94a3b8", bg="#1e293b", font=("Consolas", 9, "bold"), padx=10, pady=4)
        self.status_pill.pack(side=tk.RIGHT)

        # Credentials & Metadata Strip
        cred_strip = tk.Frame(self.root, bg="#111827", padx=20, pady=8, highlightbackground="#1f2937", highlightthickness=1)
        cred_strip.pack(fill=tk.X, padx=16, pady=(12, 0))

        api_display = self.config.get("api_base") or self.config.get("api_url", "http://127.0.0.1:5000")
        email_display = self.config.get("email", "kakarlapavanshanmukh@gmail.com")
        user_id_display = str(self.config.get("user_id", 1))
        token_present = bool(self.config.get("token") or self.config.get("detector_token"))

        tk.Label(cred_strip, text="USER ID:", fg="#9ca3af", bg="#111827", font=("Segoe UI", 8, "bold")).pack(side=tk.LEFT)
        tk.Label(cred_strip, text=f" #{user_id_display}  ", fg="#38bdf8", bg="#111827", font=("Segoe UI", 8)).pack(side=tk.LEFT)

        tk.Label(cred_strip, text="OPERATOR:", fg="#9ca3af", bg="#111827", font=("Segoe UI", 8, "bold")).pack(side=tk.LEFT)
        tk.Label(cred_strip, text=f" {email_display}  ", fg="#e5e7eb", bg="#111827", font=("Segoe UI", 8)).pack(side=tk.LEFT)

        tk.Label(cred_strip, text="SOC GATEWAY:", fg="#9ca3af", bg="#111827", font=("Segoe UI", 8, "bold")).pack(side=tk.LEFT)
        tk.Label(cred_strip, text=f" {api_display}  ", fg="#e5e7eb", bg="#111827", font=("Segoe UI", 8)).pack(side=tk.LEFT)

        auth_text = "● AUTHENTICATED" if token_present else "○ UNBOUND"
        auth_color = "#10b981" if token_present else "#f59e0b"
        tk.Label(cred_strip, text=auth_text, fg=auth_color, bg="#111827", font=("Consolas", 8, "bold")).pack(side=tk.RIGHT)

        # Main Workspace Container
        main_container = tk.Frame(self.root, bg="#0b0f19", padx=16, pady=10)
        main_container.pack(fill=tk.BOTH, expand=True)

        # Upper Card: Target Folders Configuration
        folder_card = tk.LabelFrame(main_container, text=" Protected Directories Configuration ", bg="#111827", fg="#38bdf8", font=("Segoe UI", 9, "bold"), padx=12, pady=10)
        folder_card.pack(fill=tk.X, pady=(0, 10))

        picker_row = tk.Frame(folder_card, bg="#111827")
        picker_row.pack(fill=tk.X, pady=(0, 8))

        self.path_entry = tk.Entry(picker_row, bg="#0f172a", fg="#f1f5f9", insertbackground="#00ffcc", relief="flat", highlightbackground="#334155", highlightthickness=1, font=("Segoe UI", 9))
        self.path_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 8), ipady=3)

        btn_browse = tk.Button(picker_row, text="📁 Browse Folder...", bg="#1e293b", fg="#f8fafc", activebackground="#334155", activeforeground="#00ffcc", relief="flat", font=("Segoe UI", 9), padx=10, command=self.browse_folder)
        btn_browse.pack(side=tk.LEFT, padx=(0, 6))

        btn_add = tk.Button(picker_row, text="➕ Add to Targets", bg="#0284c7", fg="#ffffff", activebackground="#0369a1", relief="flat", font=("Segoe UI", 9, "bold"), padx=12, command=self.add_folder)
        btn_add.pack(side=tk.LEFT)

        # Folder Listbox + Management Buttons
        list_container = tk.Frame(folder_card, bg="#111827")
        list_container.pack(fill=tk.X)

        self.folder_listbox = tk.Listbox(list_container, height=3, bg="#090d16", fg="#00ffcc", selectbackground="#1e3a8a", selectforeground="#ffffff", relief="flat", highlightbackground="#1e293b", highlightthickness=1, font=("Consolas", 9))
        self.folder_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        list_scroll = tk.Scrollbar(list_container, orient=tk.VERTICAL, command=self.folder_listbox.yview)
        list_scroll.pack(side=tk.LEFT, fill=tk.Y)
        self.folder_listbox.config(yscrollcommand=list_scroll.set)

        btn_box = tk.Frame(list_container, bg="#111827", padx=8)
        btn_box.pack(side=tk.LEFT, fill=tk.Y)

        btn_remove = tk.Button(btn_box, text="Remove Selected", bg="#1f2937", fg="#f87171", activebackground="#374151", relief="flat", font=("Segoe UI", 8), width=15, command=self.remove_folder)
        btn_remove.pack(fill=tk.X, pady=2)

        btn_clear = tk.Button(btn_box, text="Clear List", bg="#1f2937", fg="#9ca3af", activebackground="#374151", relief="flat", font=("Segoe UI", 8), width=15, command=self.clear_folders)
        btn_clear.pack(fill=tk.X, pady=2)

        # Controls & Metrics Strip
        controls_frame = tk.Frame(main_container, bg="#0b0f19", pady=6)
        controls_frame.pack(fill=tk.X)

        self.btn_start = tk.Button(controls_frame, text="▶ START PROTECTION", bg="#059669", fg="#ffffff", activebackground="#047857", activeforeground="#ffffff", relief="flat", font=("Segoe UI", 10, "bold"), padx=18, pady=6, command=self.start_protection)
        self.btn_start.pack(side=tk.LEFT, padx=(0, 10))

        self.btn_stop = tk.Button(controls_frame, text="⏹ STOP PROTECTION", bg="#334155", fg="#94a3b8", state=tk.DISABLED, relief="flat", font=("Segoe UI", 10, "bold"), padx=18, pady=6, command=self.stop_protection)
        self.btn_stop.pack(side=tk.LEFT, padx=(0, 20))

        # Metrics Badges
        metrics_box = tk.Frame(controls_frame, bg="#0b0f19")
        metrics_box.pack(side=tk.RIGHT)

        self.badge_canaries = tk.Label(metrics_box, text="Canaries: 0", bg="#1e1b4b", fg="#c084fc", font=("Consolas", 8, "bold"), padx=8, pady=4)
        self.badge_canaries.pack(side=tk.LEFT, padx=4)

        self.badge_events = tk.Label(metrics_box, text="Events Inspected: 0", bg="#0f172a", fg="#38bdf8", font=("Consolas", 8), padx=8, pady=4)
        self.badge_events.pack(side=tk.LEFT, padx=4)

        self.badge_alerts = tk.Label(metrics_box, text="Threat Alerts: 0", bg="#450a0a", fg="#fca5a5", font=("Consolas", 8, "bold"), padx=8, pady=4)
        self.badge_alerts.pack(side=tk.LEFT, padx=4)

        # Lower Card: In-Memory Live Event Feed (Zero Disk Storage)
        log_card = tk.LabelFrame(main_container, text=" Live Threat Feed & Forensic Event Stream (In-Memory / Zero Disk I/O) ", bg="#111827", fg="#38bdf8", font=("Segoe UI", 9, "bold"), padx=10, pady=8)
        log_card.pack(fill=tk.BOTH, expand=True, pady=(6, 0))

        self.console = tk.Text(log_card, bg="#050a0e", fg="#00ffcc", insertbackground="#00ffcc", relief="flat", font=("Consolas", 9), wrap=tk.WORD, height=12)
        self.console.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        console_scroll = tk.Scrollbar(log_card, orient=tk.VERTICAL, command=self.console.yview)
        console_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        self.console.config(yscrollcommand=console_scroll.set)

        # Console color tags
        self.console.tag_config("INFO", foreground="#38bdf8")
        self.console.tag_config("SUCCESS", foreground="#34d399")
        self.console.tag_config("CANARY", foreground="#c084fc")
        self.console.tag_config("WARNING", foreground="#fbbf24")
        self.console.tag_config("CRITICAL", foreground="#f87171", font=("Consolas", 9, "bold"))

    def _init_defaults(self):
        """Populates default target folder with current directory or user home."""
        default_dir = os.path.normcase(os.path.abspath(os.getcwd()))
        self.target_folders.append(default_dir)
        self.folder_listbox.insert(tk.END, default_dir)
        self.path_entry.insert(0, default_dir)
        self.thread_safe_log("SelectShans Endpoint Protection GUI initialized.", level="SUCCESS")
        self.thread_safe_log(f"Pre-loaded default target directory: {default_dir}", level="INFO")

    def browse_folder(self):
        """Opens native OS folder picker."""
        selected = filedialog.askdirectory(title="Select Folder to Monitor")
        if selected:
            norm = os.path.normcase(os.path.abspath(selected))
            self.path_entry.delete(0, tk.END)
            self.path_entry.insert(0, norm)

    def add_folder(self):
        """Adds path to protected target folders list."""
        folder = self.path_entry.get().strip()
        if not folder:
            return
        norm = os.path.normcase(os.path.abspath(folder))
        if not os.path.isdir(norm):
            messagebox.showerror("Invalid Directory", f"The directory does not exist:\n{norm}")
            return
        if norm in self.target_folders:
            messagebox.showinfo("Duplicate Folder", f"Directory is already in monitoring list:\n{norm}")
            return

        self.target_folders.append(norm)
        self.folder_listbox.insert(tk.END, norm)
        self.thread_safe_log(f"Added protected target folder: {norm}", level="INFO")

    def remove_folder(self):
        """Removes selected target folder."""
        if self.controller.is_running:
            messagebox.showwarning("Protection Active", "Please stop protection before altering target folders.")
            return
        selected = self.folder_listbox.curselection()
        if not selected:
            return
        idx = selected[0]
        removed = self.target_folders.pop(idx)
        self.folder_listbox.delete(idx)
        self.thread_safe_log(f"Removed protected folder: {removed}", level="INFO")

    def clear_folders(self):
        """Clears all target folders."""
        if self.controller.is_running:
            messagebox.showwarning("Protection Active", "Please stop protection before clearing target folders.")
            return
        self.target_folders.clear()
        self.folder_listbox.delete(0, tk.END)
        self.thread_safe_log("Cleared all target directories.", level="INFO")

    def start_protection(self):
        """Launches detection agent in background thread."""
        if not self.target_folders:
            messagebox.showwarning("No Target Folders", "Please add at least one folder to monitor.")
            return

        self.btn_start.config(state=tk.DISABLED, bg="#064e3b", fg="#6ee7b7")
        self.btn_stop.config(state=tk.NORMAL, bg="#dc2626", fg="#ffffff")
        self.status_pill.config(text="● PROTECTING", fg="#34d399", bg="#064e3b")

        # Launch non-blocking background thread
        threading.Thread(target=self._run_start_thread, daemon=True).start()

    def _run_start_thread(self):
        try:
            self.controller.start(self.target_folders)
        except Exception as e:
            self.thread_safe_log(f"Failed to start protection: {e}", level="CRITICAL")
            self.root.after(0, self._reset_ui_stopped)

    def stop_protection(self):
        """Stops detection agent and disarms canary decoys."""
        self.btn_stop.config(state=tk.DISABLED, bg="#334155", fg="#94a3b8")
        threading.Thread(target=self._run_stop_thread, daemon=True).start()

    def _run_stop_thread(self):
        self.controller.stop()
        self.root.after(0, self._reset_ui_stopped)

    def _reset_ui_stopped(self):
        self.btn_start.config(state=tk.NORMAL, bg="#059669", fg="#ffffff")
        self.btn_stop.config(state=tk.DISABLED, bg="#334155", fg="#94a3b8")
        self.status_pill.config(text="● STANDBY", fg="#94a3b8", bg="#1e293b")

    def thread_safe_log(self, message: str, level: str = "INFO"):
        """Queues timestamped log message strictly in memory (thread-safe)."""
        timestamp = datetime.now().strftime("%H:%M:%S")
        entry = (f"[{timestamp}] {message}\n", level)
        self.root.after(0, self._append_console, entry)

    def _append_console(self, entry):
        text, level = entry
        self.memory_logs.append(text)
        
        self.console.config(state=tk.NORMAL)
        self.console.insert(tk.END, text, level)

        # Enforce strict 200-line memory bound in GUI console
        num_lines = int(float(self.console.index('end-1c')))
        if num_lines > 200:
            self.console.delete("1.0", f"{num_lines - 200}.0")

        self.console.see(tk.END)
        self.console.config(state=tk.DISABLED)

    def thread_safe_stats(self, event=False, alert=False, canaries=None):
        """Updates metric badges in thread-safe manner."""
        self.root.after(0, self._update_stats_ui, event, alert, canaries)

    def _update_stats_ui(self, event, alert, canaries):
        if event:
            self.event_counter += 1
            self.badge_events.config(text=f"Events Inspected: {self.event_counter}")
        if alert:
            self.alert_counter += 1
            self.badge_alerts.config(text=f"Threat Alerts: {self.alert_counter}")
        if canaries is not None:
            self.canary_counter = canaries
            self.badge_canaries.config(text=f"Canaries: {self.canary_counter}")

    def on_closing(self):
        """Handles graceful exit and canary trap disarm on window close."""
        if self.controller.is_running:
            if messagebox.askyesno("Exit Protection", "FolderGuard protection is currently active.\nDo you want to stop protection, safely disarm all canaries, and exit?"):
                self.controller.stop()
                self.root.destroy()
        else:
            self.root.destroy()


def main():
    """Application launcher."""
    root = tk.Tk()
    app = FolderGuardApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
