from logger import logger
from telemetry import telemetry_manager
from config import config_manager
import time

class RiskEngine:
    def __init__(self):
        pass

    def evaluate(self, signals):
        """
        Signals could be:
        - {"type": "mass_rename", "count": 15, "directory": "...", "files": [...]}
        - {"type": "canary_tamper", "filepath": "..."}
        - {"type": "mass_write", "count": 25, "directory": "...", "files": [...]}
        """
        score = 0
        severity = "LOW"
        event_type = signals.get("type", "unknown")
        
        if event_type == "canary_tamper":
            score = 100
            severity = "CRITICAL"
            logger.critical(f"RISK: Canary file tampered: {signals.get('filepath')}")
        
        elif event_type == "mass_rename":
            count = signals.get("count", 0)
            score = min(count * 5, 100)
            if score >= 80:
                severity = "CRITICAL"
            elif score >= 50:
                severity = "HIGH"
            else:
                severity = "MEDIUM"
            logger.warning(f"RISK: Mass rename detected ({count} files)")
            
        elif event_type == "mass_write":
            count = signals.get("count", 0)
            score = min(count * 3, 100)
            if score >= 80:
                severity = "HIGH"
            elif score >= 40:
                severity = "MEDIUM"
            else:
                severity = "LOW"
            logger.warning(f"RISK: Mass write detected ({count} files)")

        if severity in ["HIGH", "CRITICAL"]:
            # Create a telemetry payload
            payload = [{
                "event_type": event_type,
                "directory": signals.get("directory", "Unknown"),
                "target_file": signals.get("filepath", ""),
                "severity": severity,
                "score": score,
                "detector_id": config_manager.endpoint_id,
                "hostname": config_manager.hostname,
                "event_count": signals.get("count", 1),
                "action_taken": "Logged by Endpoint Guard",
                "process_name": signals.get("process_name", "unknown")
            }]
            telemetry_manager.queue_event("sync_activities", payload, priority=10)

risk_engine = RiskEngine()
