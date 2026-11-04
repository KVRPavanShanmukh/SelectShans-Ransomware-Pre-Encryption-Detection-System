"""
Behavioral Detection Engine for SelectShans FolderGuard
Implements sliding-window event aggregation, multi-signal correlation,
and heuristic ransomware detection.
"""
import os
import time
import threading
from collections import deque
from typing import Dict, List, Optional, Any, Tuple

from entropy import EntropyTracker
from extensions import SuspiciousExtensionDetector
from canary import SafeCanaryManager
from process import ProcessAttributor
from risk import RiskEngine


class DetectionDecision:
    """Represents a structured detection event produced by the engine."""
    def __init__(
        self,
        event_type: str,
        directory: str,
        target_file: str,
        severity: str,
        score: int,
        category: str,
        event_count: int,
        action_taken: str,
        process_name: str,
        details: str,
        evidence: Dict[str, Any]
    ):
        self.event_type = event_type
        self.directory = directory
        self.target_file = target_file
        self.severity = severity
        self.score = score
        self.category = category
        self.event_count = event_count
        self.action_taken = action_taken
        self.process_name = process_name
        self.details = details
        self.evidence = evidence
        self.timestamp = time.time()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_type": self.event_type,
            "directory": self.directory,
            "target_file": self.target_file,
            "severity": self.severity,
            "score": self.score,
            "category": self.category,
            "event_count": self.event_count,
            "action_taken": self.action_taken,
            "process_name": self.process_name,
            "details": self.details,
            "evidence": self.evidence,
            "timestamp": self.timestamp
        }


class BehavioralDetectionEngine:
    def __init__(
        self,
        monitored_directory: str,
        time_window_seconds: float = 10.0,
        threshold_rename: int = 5,
        threshold_write: int = 10,
        threshold_delete: int = 8,
        entropy_threshold: float = 7.2,
        alert_cooldown_seconds: float = 15.0,
        max_queue_size: int = 1000,
        custom_extensions: Optional[List[str]] = None,
        canary_manager: Optional[SafeCanaryManager] = None
    ):
        self.monitored_directory = os.path.normcase(os.path.abspath(monitored_directory))
        self.time_window = time_window_seconds
        self.threshold_rename = threshold_rename
        self.threshold_write = threshold_write
        self.threshold_delete = threshold_delete
        self.entropy_threshold = entropy_threshold
        self.max_queue_size = max_queue_size

        # Submodules
        self.entropy_tracker = EntropyTracker()
        self.extension_detector = SuspiciousExtensionDetector(custom_extensions)
        self.canary_manager = canary_manager or SafeCanaryManager()
        self.process_attributor = ProcessAttributor()
        self.risk_engine = RiskEngine(alert_cooldown_seconds)

        # Thread-safe sliding event windows: store (timestamp, path, metadata)
        self._rename_window: deque[Tuple[float, str, str]] = deque()
        self._write_window: deque[Tuple[float, str, Dict[str, Any]]] = deque()
        self._delete_window: deque[Tuple[float, str]] = deque()
        self._create_window: deque[Tuple[float, str]] = deque()

        self._lock = threading.Lock()
        self._total_events_processed = 0

    @property
    def total_events_processed(self) -> int:
        return self._total_events_processed

    def _is_within_boundary(self, filepath: str) -> bool:
        """Ensures events stay within the monitored folder boundary."""
        if not filepath:
            return False
        try:
            norm = os.path.normcase(os.path.abspath(filepath))
            return norm == self.monitored_directory or norm.startswith(self.monitored_directory + os.sep)
        except Exception:
            return False

    def _prune_windows(self, now: float):
        """Removes expired events outside the sliding time window."""
        cutoff = now - self.time_window
        while self._rename_window and self._rename_window[0][0] < cutoff:
            self._rename_window.popleft()
        while self._write_window and self._write_window[0][0] < cutoff:
            self._write_window.popleft()
        while self._delete_window and self._delete_window[0][0] < cutoff:
            self._delete_window.popleft()
        while self._create_window and self._create_window[0][0] < cutoff:
            self._create_window.popleft()

    def process_file_created(self, filepath: str) -> Optional[DetectionDecision]:
        """Handles file creation event."""
        if not self._is_within_boundary(filepath):
            return None

        now = time.time()
        self._total_events_processed += 1

        with self._lock:
            self._prune_windows(now)
            if len(self._create_window) >= self.max_queue_size:
                self._create_window.popleft()
            self._create_window.append((now, filepath))

            # Record baseline entropy for subsequent delta comparison
            self.entropy_tracker.record_baseline(filepath)

            # Check if created with suspicious extension (e.g. ransomware payload or immediate encrypted drop)
            ext_info = self.extension_detector.analyze_path(filepath)
            if ext_info["is_suspicious"]:
                cooldown_key = f"ext_create_{filepath}"
                if not self.risk_engine.is_cooling_down(cooldown_key):
                    proc_info = self.process_attributor.attribute_event(filepath, check_handles=True)
                    evaluation = self.risk_engine.evaluate_signals(
                        event_type="ransomware_extension_create",
                        directory=self.monitored_directory,
                        target_file=os.path.basename(filepath),
                        event_count=1,
                        extension_info=ext_info,
                        process_info=proc_info
                    )
                    return DetectionDecision(
                        event_type="ransomware_extension_create",
                        directory=self.monitored_directory,
                        target_file=os.path.basename(filepath),
                        severity=evaluation["severity"],
                        score=evaluation["score"],
                        category=evaluation["category"],
                        event_count=1,
                        action_taken=evaluation["recommended_response"],
                        process_name=proc_info.get("process_name", "unknown"),
                        details=evaluation["explanation"],
                        evidence=evaluation["evidence"]
                    )
        return None

    def process_file_modified(self, filepath: str) -> Optional[DetectionDecision]:
        """Handles file modification event."""
        if not self._is_within_boundary(filepath):
            return None

        now = time.time()
        self._total_events_processed += 1

        # 1. Immediate Canary Check
        canary_alert = self.canary_manager.identify_canary_event(filepath, "modified")
        if canary_alert:
            cooldown_key = f"canary_mod_{filepath}"
            if not self.risk_engine.is_cooling_down(cooldown_key):
                proc_info = self.process_attributor.attribute_event(filepath, check_handles=True)
                evaluation = self.risk_engine.evaluate_signals(
                    event_type="canary_tamper",
                    directory=self.monitored_directory,
                    target_file=os.path.basename(filepath),
                    event_count=1,
                    is_canary=True,
                    process_info=proc_info
                )
                return DetectionDecision(
                    event_type="canary_tamper",
                    directory=self.monitored_directory,
                    target_file=os.path.basename(filepath),
                    severity=evaluation["severity"],
                    score=evaluation["score"],
                    category=evaluation["category"],
                    event_count=1,
                    action_taken=evaluation["recommended_response"],
                    process_name=proc_info.get("process_name", "unknown"),
                    details=evaluation["explanation"],
                    evidence=evaluation["evidence"]
                )

        # 2. Entropy analysis on modified file
        entropy_res = self.entropy_tracker.analyze_modification(filepath)

        with self._lock:
            self._prune_windows(now)
            if len(self._write_window) >= self.max_queue_size:
                self._write_window.popleft()
            self._write_window.append((now, filepath, entropy_res))

            write_count = len(self._write_window)
            entropy_surge_count = sum(1 for _, _, e in self._write_window if e.get("is_surge"))

            # Multi-signal check: rapid writes + entropy surges
            if write_count >= self.threshold_write or (entropy_surge_count >= 2 and write_count >= 3):
                cooldown_key = f"mass_write_{self.monitored_directory}"
                if not self.risk_engine.is_cooling_down(cooldown_key):
                    proc_info = self.process_attributor.attribute_event(filepath, check_handles=True)
                    correlated = {
                        "renames": len(self._rename_window),
                        "writes": write_count,
                        "entropy_surges": entropy_surge_count
                    }
                    evaluation = self.risk_engine.evaluate_signals(
                        event_type="mass_write" if entropy_surge_count == 0 else "encryption_surge",
                        directory=self.monitored_directory,
                        target_file=os.path.basename(filepath),
                        event_count=write_count,
                        entropy_info=entropy_res,
                        process_info=proc_info,
                        correlated_events=correlated
                    )
                    decision = DetectionDecision(
                        event_type="mass_write" if entropy_surge_count == 0 else "encryption_surge",
                        directory=self.monitored_directory,
                        target_file=os.path.basename(filepath),
                        severity=evaluation["severity"],
                        score=evaluation["score"],
                        category=evaluation["category"],
                        event_count=write_count,
                        action_taken=evaluation["recommended_response"],
                        process_name=proc_info.get("process_name", "unknown"),
                        details=evaluation["explanation"],
                        evidence=evaluation["evidence"]
                    )
                    # Clear window after alert dispatch to prevent re-trigger on next single event
                    self._write_window.clear()
                    return decision

        return None

    def process_file_renamed(self, src_path: str, dest_path: str) -> Optional[DetectionDecision]:
        """Handles file move or rename event."""
        if not self._is_within_boundary(src_path) and not self._is_within_boundary(dest_path):
            return None

        now = time.time()
        self._total_events_processed += 1

        # 1. Canary Tamper Check
        if self.canary_manager.is_canary(src_path) or self.canary_manager.is_canary(dest_path):
            cooldown_key = f"canary_rename_{src_path}"
            if not self.risk_engine.is_cooling_down(cooldown_key):
                proc_info = self.process_attributor.attribute_event(dest_path, check_handles=True)
                evaluation = self.risk_engine.evaluate_signals(
                    event_type="canary_rename",
                    directory=self.monitored_directory,
                    target_file=os.path.basename(dest_path),
                    event_count=1,
                    is_canary=True,
                    process_info=proc_info
                )
                return DetectionDecision(
                    event_type="canary_rename",
                    directory=self.monitored_directory,
                    target_file=os.path.basename(dest_path),
                    severity=evaluation["severity"],
                    score=evaluation["score"],
                    category=evaluation["category"],
                    event_count=1,
                    action_taken=evaluation["recommended_response"],
                    process_name=proc_info.get("process_name", "unknown"),
                    details=evaluation["explanation"],
                    evidence=evaluation["evidence"]
                )

        # 2. Suspicious Ransomware Extension Check (Immediate trigger)
        rename_analysis = self.extension_detector.analyze_rename(src_path, dest_path)
        if rename_analysis["is_ransom_rename"]:
            cooldown_key = f"ransom_ext_rename_{dest_path}"
            if not self.risk_engine.is_cooling_down(cooldown_key):
                proc_info = self.process_attributor.attribute_event(dest_path, check_handles=True)
                evaluation = self.risk_engine.evaluate_signals(
                    event_type="ransomware_extension_rename",
                    directory=self.monitored_directory,
                    target_file=os.path.basename(dest_path),
                    event_count=1,
                    extension_info=rename_analysis["dest_analysis"],
                    process_info=proc_info
                )
                return DetectionDecision(
                    event_type="ransomware_extension_rename",
                    directory=self.monitored_directory,
                    target_file=os.path.basename(dest_path),
                    severity=evaluation["severity"],
                    score=evaluation["score"],
                    category=evaluation["category"],
                    event_count=1,
                    action_taken=evaluation["recommended_response"],
                    process_name=proc_info.get("process_name", "unknown"),
                    details=evaluation["explanation"],
                    evidence=evaluation["evidence"]
                )

        # 3. Sliding-window mass rename aggregation
        with self._lock:
            self._prune_windows(now)
            if len(self._rename_window) >= self.max_queue_size:
                self._rename_window.popleft()
            self._rename_window.append((now, src_path, dest_path))

            rename_count = len(self._rename_window)
            if rename_count >= self.threshold_rename:
                cooldown_key = f"mass_rename_{self.monitored_directory}"
                if not self.risk_engine.is_cooling_down(cooldown_key):
                    proc_info = self.process_attributor.attribute_event(dest_path, check_handles=True)
                    correlated = {
                        "renames": rename_count,
                        "writes": len(self._write_window),
                        "entropy_surges": sum(1 for _, _, e in self._write_window if e.get("is_surge"))
                    }
                    evaluation = self.risk_engine.evaluate_signals(
                        event_type="mass_rename",
                        directory=self.monitored_directory,
                        target_file=os.path.basename(dest_path),
                        event_count=rename_count,
                        process_info=proc_info,
                        correlated_events=correlated
                    )
                    decision = DetectionDecision(
                        event_type="mass_rename",
                        directory=self.monitored_directory,
                        target_file=os.path.basename(dest_path),
                        severity=evaluation["severity"],
                        score=evaluation["score"],
                        category=evaluation["category"],
                        event_count=rename_count,
                        action_taken=evaluation["recommended_response"],
                        process_name=proc_info.get("process_name", "unknown"),
                        details=evaluation["explanation"],
                        evidence=evaluation["evidence"]
                    )
                    self._rename_window.clear()
                    return decision

        return None

    def process_file_deleted(self, filepath: str) -> Optional[DetectionDecision]:
        """Handles file deletion event."""
        if not self._is_within_boundary(filepath):
            return None

        now = time.time()
        self._total_events_processed += 1

        # Canary check
        if self.canary_manager.is_canary(filepath):
            cooldown_key = f"canary_del_{filepath}"
            if not self.risk_engine.is_cooling_down(cooldown_key):
                proc_info = self.process_attributor.attribute_event(filepath, check_handles=False)
                evaluation = self.risk_engine.evaluate_signals(
                    event_type="canary_delete",
                    directory=self.monitored_directory,
                    target_file=os.path.basename(filepath),
                    event_count=1,
                    is_canary=True,
                    process_info=proc_info
                )
                return DetectionDecision(
                    event_type="canary_delete",
                    directory=self.monitored_directory,
                    target_file=os.path.basename(filepath),
                    severity=evaluation["severity"],
                    score=evaluation["score"],
                    category=evaluation["category"],
                    event_count=1,
                    action_taken=evaluation["recommended_response"],
                    process_name=proc_info.get("process_name", "unknown"),
                    details=evaluation["explanation"],
                    evidence=evaluation["evidence"]
                )

        with self._lock:
            self._prune_windows(now)
            if len(self._delete_window) >= self.max_queue_size:
                self._delete_window.popleft()
            self._delete_window.append((now, filepath))

            delete_count = len(self._delete_window)
            if delete_count >= self.threshold_delete:
                cooldown_key = f"mass_delete_{self.monitored_directory}"
                if not self.risk_engine.is_cooling_down(cooldown_key):
                    proc_info = self.process_attributor.attribute_event(filepath, check_handles=False)
                    evaluation = self.risk_engine.evaluate_signals(
                        event_type="mass_delete",
                        directory=self.monitored_directory,
                        target_file=os.path.basename(filepath),
                        event_count=delete_count,
                        process_info=proc_info
                    )
                    decision = DetectionDecision(
                        event_type="mass_delete",
                        directory=self.monitored_directory,
                        target_file=os.path.basename(filepath),
                        severity=evaluation["severity"],
                        score=evaluation["score"],
                        category=evaluation["category"],
                        event_count=delete_count,
                        action_taken=evaluation["recommended_response"],
                        process_name=proc_info.get("process_name", "unknown"),
                        details=evaluation["explanation"],
                        evidence=evaluation["evidence"]
                    )
                    self._delete_window.clear()
                    return decision

        return None

    def reset(self):
        """Resets all sliding windows and caches."""
        with self._lock:
            self._rename_window.clear()
            self._write_window.clear()
            self._delete_window.clear()
            self._create_window.clear()
            self.entropy_tracker.clear()
            self.process_attributor.clear()
            self.risk_engine.clear_cooldowns()
            self._total_events_processed = 0
