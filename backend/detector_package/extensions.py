"""
Suspicious Ransomware Extension Detection Module for SelectShans FolderGuard
Identifies known ransomware file extensions, double extensions, and suspicious rename trends.
"""
import os
from typing import Dict, List, Optional, Set

# Standard catalog of known ransomware extensions
DEFAULT_RANSOMWARE_EXTENSIONS: Set[str] = {
    '.locked', '.crypto', '.enc', '.crypted', '.ransom',
    '.wnry', '.zepto', '.locky', '.cerber', '.wannacry',
    '.darkside', '.revil', '.conti', '.blackcat', '.alphv',
    '.lockbit', '.mallox', '.phobos', '.ryuk', '.hive',
    '.clop', '.stop', '.djvu', '.makop', '.avaddon',
    '.sodinokibi', '.babuk', '.blackbasta', '.royal', '.akira',
    '.medusa', '.play', '.rhysida', '.qilin', '.cactus',
    '.enc1', '.crinf', '.vault', '.mole', '.thor'
}

# Standard document extensions frequently targeted by ransomware
LEGITIMATE_TARGET_EXTENSIONS: Set[str] = {
    '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt',
    '.pdf', '.txt', '.rtf', '.csv', '.json', '.xml',
    '.jpg', '.jpeg', '.png', '.bmp', '.sql', '.db',
    '.zip', '.7z', '.tar', '.gz', '.psd', '.ai'
}


class SuspiciousExtensionDetector:
    def __init__(self, custom_extensions: Optional[List[str]] = None):
        self.ransomware_extensions = set(DEFAULT_RANSOMWARE_EXTENSIONS)
        if custom_extensions:
            for ext in custom_extensions:
                cleaned = ext.strip().lower()
                if cleaned:
                    if not cleaned.startswith('.'):
                        cleaned = '.' + cleaned
                    self.ransomware_extensions.add(cleaned)

    def is_suspicious_extension(self, filepath: str) -> bool:
        """Checks if the file extension matches a known ransomware extension."""
        if not filepath:
            return False
        base, ext = os.path.splitext(filepath)
        return ext.lower() in self.ransomware_extensions

    def analyze_path(self, filepath: str) -> Dict[str, any]:
        """
        Inspects filename for single or double extensions and known ransomware markers.
        Example: 'financial_report.xlsx.locked' -> detected double extension with target .xlsx and ransom .locked
        """
        if not filepath:
            return {
                "is_suspicious": False,
                "ransom_ext": None,
                "original_ext": None,
                "is_double_ext": False,
                "explanation": "No filepath provided."
            }

        filename = os.path.basename(filepath)
        base, ext1 = os.path.splitext(filename)
        ext1 = ext1.lower()

        base2, ext2 = os.path.splitext(base)
        ext2 = ext2.lower()

        is_suspicious = ext1 in self.ransomware_extensions
        is_double_ext = False
        original_ext = None

        if is_suspicious:
            if ext2 in LEGITIMATE_TARGET_EXTENSIONS or ext2 != "":
                is_double_ext = True
                original_ext = ext2

            explanation = (
                f"Suspicious ransomware extension detected ({ext1}) appended to "
                f"{'known document format ' + original_ext if is_double_ext else 'file'}."
            )
        else:
            explanation = f"Clean file extension ({ext1 or 'none'})."

        return {
            "is_suspicious": is_suspicious,
            "ransom_ext": ext1 if is_suspicious else None,
            "original_ext": original_ext,
            "is_double_ext": is_double_ext,
            "explanation": explanation
        }

    def analyze_rename(self, src_path: str, dest_path: str) -> Dict[str, any]:
        """
        Analyzes a rename operation (e.g. data.docx -> data.docx.locked)
        to identify typical pre-encryption or encryption rename behavior.
        """
        src_ext = os.path.splitext(src_path)[1].lower()
        dest_analysis = self.analyze_path(dest_path)

        is_ransom_rename = False
        if dest_analysis["is_suspicious"]:
            is_ransom_rename = True
            dest_analysis["explanation"] = (
                f"File renamed from legitimate format ({src_ext or 'plain'}) "
                f"to suspicious ransomware extension ({dest_analysis['ransom_ext']})."
            )

        return {
            "is_ransom_rename": is_ransom_rename,
            "src_ext": src_ext,
            "dest_analysis": dest_analysis
        }
