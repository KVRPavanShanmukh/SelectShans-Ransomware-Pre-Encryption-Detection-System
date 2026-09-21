import time
import math
import os
import threading
from collections import deque
from logger import logger
from risk import risk_engine
from canary import canary_manager
from config import config_manager
from process import get_process_for_file

class DetectionEngine:
    def __init__(self):
        self.rename_events = deque()
        self.write_events = deque()
        
        self.time_window = config_manager.get("time_window_seconds", 15)
        self.rename_threshold = config_manager.get("threshold_rename", 10)
        self.write_threshold = config_manager.get("threshold_write", 20)
        self.lock = threading.Lock()

    def _calculate_entropy(self, filepath):
        """Lightweight entropy analysis for suspicious file modifications."""
        try:
            with open(filepath, 'rb') as f:
                data = f.read(8192) # Read first 8KB
                if not data:
                    return 0.0
                
                entropy = 0
                for x in range(256):
                    p_x = float(data.count(x))/len(data)
                    if p_x > 0:
                        entropy += - p_x * math.log(p_x, 2)
                return entropy
        except Exception:
            return 0.0

    def process_event(self, event_type, src_path, dest_path=None):
        now = time.time()
        
        # Check canary
        if canary_manager.is_canary(src_path) or (dest_path and canary_manager.is_canary(dest_path)):
            proc_info = get_process_for_file(src_path)
            risk_engine.evaluate({
                "type": "canary_tamper",
                "filepath": src_path,
                "process_name": proc_info['name']
            })
            return

        with self.lock:
            if event_type == "moved":
                self.rename_events.append((now, dest_path))
                
                # Prune old
                while self.rename_events and now - self.rename_events[0][0] > self.time_window:
                    self.rename_events.popleft()
                
                if len(self.rename_events) >= self.rename_threshold:
                    proc_info = get_process_for_file(dest_path)
                    risk_engine.evaluate({
                        "type": "mass_rename",
                        "count": len(self.rename_events),
                        "directory": os.path.dirname(dest_path),
                        "process_name": proc_info['name']
                    })
                    self.rename_events.clear()
                    
            elif event_type == "modified":
                self.write_events.append((now, src_path))
                
                while self.write_events and now - self.write_events[0][0] > self.time_window:
                    self.write_events.popleft()
                    
                if len(self.write_events) >= self.write_threshold:
                    # Optional: check entropy of the last modified file
                    entropy = self._calculate_entropy(src_path)
                    if entropy > 7.5:
                        logger.warning(f"High entropy detected: {entropy:.2f} on {src_path}")
                        
                    proc_info = get_process_for_file(src_path)
                    risk_engine.evaluate({
                        "type": "mass_write",
                        "count": len(self.write_events),
                        "directory": os.path.dirname(src_path),
                        "process_name": proc_info['name']
                    })
                    self.write_events.clear()

detection_engine = DetectionEngine()
