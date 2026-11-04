"""
Risk Scoring Engine for SelectShans FolderGuard
Calculates transparent, explainable 0-100 risk scores with agreeing severity levels,
contributing reasons, and actionable response recommendations.
"""
import time
from typing import Dict, List, Optional, Any

# Severity threshold boundaries
THRESHOLD_CRITICAL = 80
THRESHOLD_HIGH = 60
THRESHOLD_MEDIUM = 35


class RiskEngine:
    def __init__(self, alert_cooldown_seconds: float = 15.0):
        self.cooldown_seconds = alert_cooldown_seconds
        self._cooldown_cache: Dict[str, float] = {}

    def score_to_severity(self, score: int) -> str:
        """Guarantees score and severity always agree."""
        if score >= THRESHOLD_CRITICAL:
            return "CRITICAL"
        elif score >= THRESHOLD_HIGH:
            return "HIGH"
        elif score >= THRESHOLD_MEDIUM:
            return "MEDIUM"
        return "LOW"

    def is_cooling_down(self, alert_key: str) -> bool:
        """Prevents duplicate alert flooding within the configured cooldown window."""
        now = time.time()
        last_time = self._cooldown_cache.get(alert_key, 0.0)
        if now - last_time < self.cooldown_seconds:
            return True
        self._cooldown_cache[alert_key] = now
        return False

    def evaluate_signals(
        self,
        event_type: str,
        directory: str,
        target_file: Optional[str] = None,
        event_count: int = 1,
        entropy_info: Optional[Dict[str, Any]] = None,
        extension_info: Optional[Dict[str, Any]] = None,
        process_info: Optional[Dict[str, Any]] = None,
        is_canary: bool = False,
        correlated_events: Optional[Dict[str, int]] = None
    ) -> Dict[str, Any]:
        """
        Calculates explainable risk score from contributing signals.
        Returns detailed evaluation dictionary with score, severity, category, reasons, and recommended response.
        """
        score = 0
        reasons: List[str] = []
        category = "Suspicious Activity"
        recommended_response = "Monitor directory for further abnormal behavior."

        # 1. Canary Signal (Highest confidence user-mode signal)
        if is_canary or event_type.startswith("canary_"):
            score += 95
            category = "Canary Decoy File Breach"
            reasons.append(f"Decoy canary file '{target_file or 'marker'}' was modified, renamed, or deleted.")
            reasons.append("Canaries are sequentially named to bait early alphabetical ransomware traversal.")
            recommended_response = (
                "Isolate host machine from network immediately. Review active processes and inspect folder for unencrypted copies."
            )

        # 2. Ransomware Extension Signal
        if extension_info and extension_info.get("is_suspicious"):
            ext = extension_info.get("ransom_ext")
            orig = extension_info.get("original_ext")
            if event_count <= 1:
                # Isolated suspicious extension rename: High alert, but not premature CRITICAL panic
                score += 65
                category = "Suspicious Extension Rename (Isolated)"
                if extension_info.get("is_double_ext"):
                    reasons.append(f"Isolated double extension pattern: '{orig}' format renamed with ransomware extension '{ext}'.")
                else:
                    reasons.append(f"Isolated file renamed with known ransomware extension '{ext}'.")
                recommended_response = (
                    "Inspect recent file activity and monitor directory for subsequent renames. Verify user intent."
                )
            else:
                # Multiple suspicious renames: Escalates to CRITICAL
                score += 85 + min((event_count - 2) * 5, 15)
                category = "Ransomware Extension Renaming Campaign"
                reasons.append(f"Multiple suspicious extension renames ({event_count} files) matching ransomware pattern '{ext}'.")
                recommended_response = (
                    "High probability ransomware activity. Terminate suspicious processes, check VSS/Volume Shadow Copies, and verify backup state."
                )

        # 3. Entropy Signal
        if entropy_info and entropy_info.get("is_surge"):
            cur_ent = entropy_info.get("current_entropy", 0.0)
            delta = entropy_info.get("delta", 0.0)
            if delta > 0:
                score += 35
                reasons.append(f"High entropy surge observed: +{delta:.2f} delta reaching {cur_ent:.2f} on non-compressed data.")
            else:
                score += 25
                reasons.append(f"Elevated Shannon entropy ({cur_ent:.2f}/8.0) detected in modified payload.")

        # 4. Behavioral Frequency & Burst Signals
        if event_type == "mass_rename":
            rename_score = 35 + min(event_count * 5, 45)
            score += rename_score
            reasons.append(f"Rapid mass rename burst: {event_count} files renamed in short time window.")
            if not category or category == "Suspicious Activity":
                category = "Mass File Renaming Burst"

        elif event_type == "mass_write":
            write_score = 25 + min(event_count * 3, 45)
            score += write_score
            reasons.append(f"High-frequency file writes: {event_count} modifications detected within sliding window.")
            if not category or category == "Suspicious Activity":
                category = "Rapid File Modification Burst"

        elif event_type == "mass_delete":
            delete_score = 30 + min(event_count * 5, 45)
            score += delete_score
            reasons.append(f"Mass file deletion: {event_count} files deleted in rapid succession.")
            if not category or category == "Suspicious Activity":
                category = "Mass File Deletion Surge"

        # 5. Multi-Signal Correlation Bonus
        # When renames occur concurrently with high entropy writes, risk escalates dramatically
        if correlated_events:
            renames = correlated_events.get("renames", 0)
            writes = correlated_events.get("writes", 0)
            entropy_surges = correlated_events.get("entropy_surges", 0)

            if renames >= 3 and entropy_surges >= 1:
                score += 25
                reasons.append(f"Multi-signal correlation: Concurrent mass rename ({renames}) and encryption entropy surge ({entropy_surges}).")
                category = "Pre-Encryption Ransomware Pattern"
                recommended_response = "Immediate host quarantine recommended. Check processes accessing target directory."

            elif renames >= 3 and writes >= 5:
                score += 15
                reasons.append(f"Correlated burst: {renames} renames paired with {writes} rapid writes in same window.")

        # Cap score at 100
        final_score = min(max(score, 5), 100)
        severity = self.score_to_severity(final_score)

        # Attribution context
        pname = "unknown"
        pid = 0
        if process_info:
            pname = process_info.get("process_name", "unknown")
            pid = process_info.get("pid", 0)
            if pname != "unknown":
                reasons.append(f"Process attribution: PID {pid} ({pname}) [Confidence: {process_info.get('attribution_confidence', 'best_effort')}].")

        # Fallback reason if none captured
        if not reasons:
            reasons.append(f"Heuristic activity detected: {event_type} on {target_file or directory}.")

        evidence = {
            "event_type": event_type,
            "directory": directory,
            "target_file": target_file or "",
            "event_count": event_count,
            "entropy": entropy_info.get("current_entropy", 0.0) if entropy_info else 0.0,
            "entropy_delta": entropy_info.get("delta", 0.0) if entropy_info else 0.0,
            "process_name": pname,
            "pid": pid,
            "reasons": reasons,
            "timestamp": time.time()
        }

        human_explanation = " | ".join(reasons)

        return {
            "score": final_score,
            "severity": severity,
            "category": category,
            "reasons": reasons,
            "explanation": human_explanation,
            "recommended_response": recommended_response,
            "evidence": evidence
        }

    def clear_cooldowns(self):
        self._cooldown_cache.clear()
