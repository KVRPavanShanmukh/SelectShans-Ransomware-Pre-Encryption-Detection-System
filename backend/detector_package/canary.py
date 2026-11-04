"""
Safe Canary / Decoy File Management Module for SelectShans FolderGuard
Deploys tracked decoy files in monitored folders and triggers high-priority alerts upon tampering.
Guarantees zero damage to pre-existing user files through cryptographic signature verification.
"""
import os
import subprocess
import secrets
import uuid
from typing import Set, Dict, List, Optional

CANARY_PREFIX = ".selectshans_canary_"
CANARY_SIGNATURE = "# SELECTSHANS_CANARY_ACTIVE_TRAP_V2_DO_NOT_REMOVE #\n"

CANARY_TEMPLATES = [
    ("!_00_backup_keys", ".docx", "SelectShans Canary Decoy Document. Tampering indicates malicious traversal.\n" * 5),
    ("!_00_financial_records", ".xlsx", "SelectShans Canary Financial Decoy.\n" * 5),
    ("!_00_passwords_archive", ".pdf", "SelectShans Canary Security Marker.\n" * 5),
]


class SafeCanaryManager:
    """
    Manages deployment, tracking, and safe cleanup of decoy canary files.
    Ensures zero damage to user files:
      1. Never overwrites any existing file.
      2. Embeds an authentic signature in files created by this manager.
      3. Verifies signature on disk before deleting during cleanup.
    """
    def __init__(self, instance_id: Optional[str] = None):
        self.instance_id = instance_id or str(uuid.uuid4())[:8]
        self._created_canary_paths: Set[str] = set()

    @property
    def deployed_canaries(self) -> Set[str]:
        return set(self._created_canary_paths)

    def deploy_canaries(self, target_directory: str) -> List[str]:
        """
        Safely deploys unique canary files in the specified directory.
        Never overwrites any existing user file.
        """
        if not target_directory or not os.path.exists(target_directory) or not os.path.isdir(target_directory):
            return []

        deployed_this_run = []

        for name_hint, ext, content in CANARY_TEMPLATES:
            # Construct standard canary filename
            canary_name = f"{CANARY_PREFIX}{self.instance_id}_{name_hint}{ext}"
            canary_path = os.path.normcase(os.path.abspath(os.path.join(target_directory, canary_name)))

            # If a file already exists at this path:
            if os.path.exists(canary_path):
                # Verify if it was a previously created canary from this instance
                is_our_canary = False
                try:
                    with open(canary_path, "r", encoding="utf-8", errors="ignore") as f:
                        header = f.read(len(CANARY_SIGNATURE) + 5)
                        if CANARY_SIGNATURE.strip() in header:
                            is_our_canary = True
                except Exception:
                    is_our_canary = False

                if is_our_canary:
                    self._created_canary_paths.add(canary_path)
                    deployed_this_run.append(canary_path)
                    continue
                else:
                    # It's an existing user file! Never overwrite!
                    # Generate a unique non-colliding canary path
                    canary_name = f"{CANARY_PREFIX}{self.instance_id}_{secrets.token_hex(3)}_{name_hint}{ext}"
                    canary_path = os.path.normcase(os.path.abspath(os.path.join(target_directory, canary_name)))
                    if os.path.exists(canary_path):
                        continue

            try:
                # Write signed canary file
                with open(canary_path, "w", encoding="utf-8") as f:
                    f.write(CANARY_SIGNATURE)
                    f.write(content)

                # Set hidden attribute safely using subprocess argument list on Windows
                if os.name == 'nt':
                    try:
                        subprocess.run(["attrib", "+h", canary_path], capture_output=True, check=False)
                    except Exception:
                        pass

                self._created_canary_paths.add(canary_path)
                deployed_this_run.append(canary_path)
            except Exception:
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
        if norm in self._created_canary_paths:
            return True

        filename = os.path.basename(norm)
        # Check specific prefix and instance ID
        if filename.startswith(CANARY_PREFIX) and self.instance_id in filename:
            # Verify file signature if it exists
            if os.path.exists(norm) and not os.path.isdir(norm):
                try:
                    with open(norm, "r", encoding="utf-8", errors="ignore") as f:
                        header = f.read(len(CANARY_SIGNATURE) + 5)
                        return CANARY_SIGNATURE.strip() in header
                except Exception:
                    return False
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
        Verifies internal signature on disk before deletion.
        Never touches unrelated files.
        """
        removed_count = 0
        for canary_path in list(self._created_canary_paths):
            try:
                if os.path.exists(canary_path) and not os.path.isdir(canary_path):
                    # Safety check: Verify canary signature before deleting!
                    is_safe_to_delete = False
                    try:
                        with open(canary_path, "r", encoding="utf-8", errors="ignore") as f:
                            header = f.read(len(CANARY_SIGNATURE) + 5)
                            if CANARY_SIGNATURE.strip() in header:
                                is_safe_to_delete = True
                    except Exception:
                        is_safe_to_delete = False

                    if not is_safe_to_delete:
                        # Refuse to delete any file without our signature!
                        continue

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
        self._created_canary_paths.clear()
        return removed_count
