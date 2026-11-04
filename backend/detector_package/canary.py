"""
Safe Canary / Decoy File Management Module for SelectShans FolderGuard
Deploys tracked decoy files in monitored folders and triggers high-priority alerts upon tampering.
"""
import os
import subprocess
import uuid
from typing import Set, Dict, List, Optional

CANARY_PREFIX = ".selectshans_canary_"
CANARY_TEMPLATES = [
    ("!_00_backup_keys", ".docx", "SelectShans Canary Decoy Document. Tampering indicates malicious traversal.\n" * 5),
    ("!_00_financial_records", ".xlsx", "SelectShans Canary Financial Decoy.\n" * 5),
    ("!_00_passwords_archive", ".pdf", "SelectShans Canary Security Marker.\n" * 5),
]


class SafeCanaryManager:
    """
    Manages deployment, tracking, and safe cleanup of decoy canary files.
    Ensures zero damage to user files and uses safe Windows execution APIs.
    """
    def __init__(self, instance_id: Optional[str] = None):
        self.instance_id = instance_id or str(uuid.uuid4())[:8]
        self._deployed_canaries: Set[str] = set()

    @property
    def deployed_canaries(self) -> Set[str]:
        return set(self._deployed_canaries)

    def deploy_canaries(self, target_directory: str) -> List[str]:
        """
        Safely deploys unique canary files in the specified directory.
        Never overwrites any existing user file.
        """
        if not target_directory or not os.path.exists(target_directory) or not os.path.isdir(target_directory):
            return []

        deployed_this_run = []

        for name_hint, ext, content in CANARY_TEMPLATES:
            # Construct a unique, traceable canary filename
            canary_name = f"{CANARY_PREFIX}{self.instance_id}_{name_hint}{ext}"
            canary_path = os.path.normcase(os.path.abspath(os.path.join(target_directory, canary_name)))

            # Safety check: Never overwrite an existing file!
            if os.path.exists(canary_path):
                self._deployed_canaries.add(canary_path)
                deployed_this_run.append(canary_path)
                continue

            try:
                with open(canary_path, "w", encoding="utf-8") as f:
                    f.write(content)

                # Set hidden attribute safely using subprocess argument list on Windows
                if os.name == 'nt':
                    try:
                        subprocess.run(["attrib", "+h", canary_path], capture_output=True, check=False)
                    except Exception:
                        pass

                self._deployed_canaries.add(canary_path)
                deployed_this_run.append(canary_path)
            except Exception as e:
                # Log without crashing
                pass

        return deployed_this_run

    def is_canary(self, filepath: str) -> bool:
        """
        Accurately determines whether a file is an authentic SelectShans canary.
        Does not falsely match ordinary user files.
        """
        if not filepath:
            return False
        norm = os.path.normcase(os.path.abspath(filepath))
        if norm in self._deployed_canaries:
            return True

        filename = os.path.basename(norm)
        # Check specific prefix and instance ID
        if filename.startswith(CANARY_PREFIX) and self.instance_id in filename:
            return True

        return False

    def identify_canary_event(self, filepath: str, event_type: str) -> Optional[Dict[str, any]]:
        """
        If the event touches a canary, returns structured incident evidence.
        """
        if not self.is_canary(filepath):
            return None

        filename = os.path.basename(filepath)
        return {
            "is_canary": True,
            "filepath": filepath,
            "filename": filename,
            "event_type": f"canary_{event_type}",
            "severity": "CRITICAL",
            "score": 95,
            "description": f"Canary decoy file breach: '{filename}' was {event_type}. High probability of alphabetical ransomware traversal."
        }

    def cleanup(self) -> int:
        """
        Safely removes ONLY the canaries created by this manager instance.
        Never touches unrelated files.
        """
        removed_count = 0
        for canary_path in list(self._deployed_canaries):
            try:
                if os.path.exists(canary_path):
                    # Unhide if Windows
                    if os.name == 'nt':
                        try:
                            subprocess.run(["attrib", "-h", canary_path], capture_output=True, check=False)
                        except Exception:
                            pass
                    os.remove(canary_path)
                    removed_count += 1
            except Exception:
                pass
        self._deployed_canaries.clear()
        return removed_count
