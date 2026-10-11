"""
Detection Engine for Static File Analysis
SelectShans - Ransomware Pre-Encryption Detection System
"""

import os
import math
import hashlib
from collections import Counter

MAX_ANALYSIS_BYTES = 10 * 1024 * 1024  # 10 MB per file limit
MAX_FOLDER_FILES = 100                 # Max files allowed in batch/folder scan

# Known EICAR standard antivirus test signature
EICAR_STANDARD_SHA256 = "275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f"
EICAR_SUBSTRING = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"

# Known Ransomware & Suspicious Extensions
RANSOMWARE_EXTENSIONS = {
    '.locked', '.crypto', '.enc', '.crypted', '.ransom',
    '.wnry', '.zepto', '.locky', '.cerber', '.crypt',
    '.darkside', '.revil', '.blackcat', '.ryuk'
}

EXECUTABLE_EXTENSIONS = {
    '.exe', '.dll', '.scr', '.bat', '.cmd', '.vbs', '.js',
    '.ps1', '.hta', '.cpl', '.pif', '.wsf', '.com'
}

DOCUMENT_EXTENSIONS = {
    '.txt', '.pdf', '.docx', '.xlsx', '.pptx', '.doc', '.xls',
    '.csv', '.json', '.xml', '.log', '.evtx', '.md', '.rtf'
}

# Magic byte signatures
FILE_SIGNATURES = [
    (b'MZ', '.exe', 'Windows Executable / Dynamic Link Library (MZ header)'),
    (b'%PDF-', '.pdf', 'Adobe Portable Document Format (PDF)'),
    (b'PK\x03\x04', '.zip', 'ZIP Compressed Archive / Office Open XML (DOCX/XLSX)'),
    (b'PK\x05\x06', '.zip', 'Empty / Spanned ZIP Archive'),
    (b'PK\x07\x08', '.zip', 'Spanned ZIP Archive'),
    (b'\x7fELF', '.elf', 'Linux Executable and Linkable Format (ELF)'),
    (b'\x1f\x8b', '.gz', 'GZIP Compressed Archive'),
    (b'BM', '.bmp', 'Bitmap Image (BMP)'),
    (b'\xff\xd8\xff', '.jpg', 'JPEG Image'),
    (b'\x89PNG\r\n\x1a\n', '.png', 'Portable Network Graphics (PNG)'),
    (b'GIF87a', '.gif', 'Graphics Interchange Format (GIF87a)'),
    (b'GIF89a', '.gif', 'Graphics Interchange Format (GIF89a)'),
    (b'Rar!\x1a\x07', '.rar', 'RAR Compressed Archive'),
    (b'7z\xbc\xaf\x27\x1c', '.7z', '7-Zip Compressed Archive'),
    (b'ElfFile\x00', '.evtx', 'Windows Event Log (EVTX Header)'),
]

# Optional Local / Configurable SHA-256 Reputation Database
KNOWN_MALICIOUS_HASHES = {
    EICAR_STANDARD_SHA256: "EICAR Standard Antivirus Test File"
}

KNOWN_CLEAN_HASHES = {
    # Empty file sha256
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855": "Empty File"
}


def calculate_entropy_fast(data: bytes) -> float:
    """
    Calculate Shannon entropy in O(N) using collections.Counter.
    Avoids 256 full data traversals.
    """
    if not data:
        return 0.0
    length = len(data)
    counts = Counter(data)
    entropy = 0.0
    for count in counts.values():
        p_x = count / length
        entropy -= p_x * math.log2(p_x)
    return round(entropy, 2)


def check_magic_mismatch(header: bytes, ext: str):
    """
    Check if file header conflicts with declared extension.
    Returns (mismatch_detected, description).
    """
    if not header:
        return False, None

    ext_lower = ext.lower()
    
    # Check for executable disguised as document/image
    if header.startswith(b'MZ'):
        if ext_lower not in ['.exe', '.dll', '.sys', '.scr', '.cpl', '.ocx']:
            return True, f"Disguised binary: File has Windows PE/MZ header but has declared extension '{ext}'."
            
    if header.startswith(b'%PDF-'):
        if ext_lower != '.pdf':
            return True, f"Type mismatch: File starts with PDF header but declared extension is '{ext}'."

    if header.startswith(b'PK\x03\x04'):
        zip_compatible = {'.zip', '.docx', '.xlsx', '.pptx', '.jar', '.apk', '.kmz'}
        if ext_lower not in zip_compatible and ext_lower in DOCUMENT_EXTENSIONS:
            if ext_lower not in ['.docx', '.xlsx', '.pptx']:
                return True, f"Type anomaly: ZIP/Archive container structure detected on '{ext}' file."

    if ext_lower == '.exe' and not header.startswith(b'MZ'):
        return True, "Invalid executable header: Declared as .exe but lacks valid MZ signature."

    return False, None


def analyze_file_data(filename: str, file_data: bytes, is_truncated: bool = False, original_size: int = 0) -> dict:
    """
    Core static heuristic analysis engine.
    Produces consistent verdicts: CLEAN, SUSPICIOUS, MALICIOUS, UNKNOWN, ERROR.
    """
    clean_name = os.path.basename(filename)
    ext = os.path.splitext(clean_name)[1].lower()
    data_size = len(file_data)
    actual_size = original_size if original_size > 0 else data_size

    # Handle oversized files
    if is_truncated:
        return {
            "filename": clean_name,
            "size": actual_size,
            "sha256": None,
            "entropy": None,
            "risk_score": None,
            "severity": "INFO",
            "verdict": "ERROR",
            "indicators": [f"File exceeds maximum analysis limit ({MAX_ANALYSIS_BYTES // (1024*1024)} MB). Scanning aborted for safety."],
            "status": "FAILED",
            "error": "File size exceeds analysis limit"
        }

    # Handle empty files
    if actual_size == 0:
        return {
            "filename": clean_name,
            "size": 0,
            "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            "entropy": 0.0,
            "risk_score": 0,
            "severity": "LOW",
            "verdict": "UNKNOWN",
            "indicators": ["Empty file (0 bytes): Insufficient data for behavioral analysis."],
            "status": "COMPLETED",
            "error": None
        }

    # Calculate SHA-256
    file_hash = hashlib.sha256(file_data).hexdigest()

    # Calculate Shannon Entropy
    entropy = calculate_entropy_fast(file_data)

    # 1. Reputation Check
    if file_hash in KNOWN_MALICIOUS_HASHES:
        return {
            "filename": clean_name,
            "size": actual_size,
            "sha256": file_hash,
            "entropy": entropy,
            "risk_score": 100,
            "severity": "CRITICAL",
            "verdict": "MALICIOUS",
            "indicators": [f"Known malicious signature matched in threat reputation database: {KNOWN_MALICIOUS_HASHES[file_hash]}"],
            "status": "COMPLETED",
            "error": None
        }

    # EICAR pattern check
    if EICAR_SUBSTRING in file_data:
        return {
            "filename": clean_name,
            "size": actual_size,
            "sha256": file_hash,
            "entropy": entropy,
            "risk_score": 100,
            "severity": "CRITICAL",
            "verdict": "MALICIOUS",
            "indicators": ["EICAR standard antivirus test file signature detected."],
            "status": "COMPLETED",
            "error": None
        }

    indicators = []
    risk_score = 0

    # 2. Extension heuristics
    if ext in RANSOMWARE_EXTENSIONS:
        risk_score += 65
        indicators.append(f"Known ransomware encryption extension detected: '{ext}'")
    elif ext in EXECUTABLE_EXTENSIONS:
        risk_score += 25
        indicators.append(f"Executable binary or scripting format: '{ext}'")

    # 3. File header magic byte inspection
    header_sample = file_data[:16]
    mismatch_detected, mismatch_reason = check_magic_mismatch(header_sample, ext)
    if mismatch_detected:
        risk_score += 45
        indicators.append(f"Header mismatch: {mismatch_reason}")

    # 4. Entropy analysis
    # Note: Compressed archives (.zip, .gz, .png) normally have high entropy, so evaluate context
    is_normal_compressed = ext in ['.zip', '.gz', '.7z', '.rar', '.png', '.jpg', '.jpeg', '.mp4']
    if entropy >= 7.85:
        if is_normal_compressed:
            risk_score += 10
            indicators.append(f"High entropy ({entropy:.2f}) observed, consistent with compressed media or archive payload.")
        else:
            risk_score += 35
            indicators.append(f"Very high entropy ({entropy:.2f}/8.00) indicates packed, encrypted, or obfuscated payload in a non-archive file.")
    elif entropy >= 7.2:
        if not is_normal_compressed:
            risk_score += 15
            indicators.append(f"Elevated entropy ({entropy:.2f}/8.00) indicates dense or partially encrypted data.")

    # 5. Suspicious string patterns
    suspicious_patterns = [
        (b"vssadmin delete shadows", "Shadow copy deletion command string found (vssadmin delete shadows)"),
        (b"wbadmin delete catalog", "Backup catalog deletion command found (wbadmin)"),
        (b"bcdedit /set {default} bootstatuspolicy ignoreallfailures", "Boot recovery suppression command found"),
        (b"bcdedit /set {default} recoveryenabled no", "System recovery disabling command found"),
        (b"Your personal files are encrypted", "Ransom note ransom text pattern detected"),
        (b"README_TO_DECRYPT", "Ransom note filename reference detected"),
        (b"CryptEncrypt", "Direct Windows CryptoAPI CryptEncrypt call reference detected"),
        (b"BitLocker", "Drive encryption command reference detected"),
    ]

    for pat, desc in suspicious_patterns:
        if pat.lower() in file_data.lower():
            risk_score += 35
            indicators.append(f"Suspicious payload pattern: {desc}")

    # Cap score
    risk_score = min(risk_score, 100)

    # 6. Assign Verdict and Severity
    # VERDICTS: CLEAN, SUSPICIOUS, MALICIOUS, UNKNOWN, ERROR
    if risk_score >= 75:
        verdict = "MALICIOUS"
        severity = "CRITICAL" if risk_score >= 90 else "HIGH"
    elif risk_score >= 30:
        verdict = "SUSPICIOUS"
        severity = "MEDIUM" if risk_score < 60 else "HIGH"
    else:
        # If low risk and normal known format or zero indicators
        if len(indicators) == 0:
            verdict = "CLEAN"
            severity = "LOW"
            indicators.append("All heuristic checks completed. No pre-encryption or malicious signatures found.")
        else:
            verdict = "CLEAN"
            severity = "LOW"

    return {
        "filename": clean_name,
        "size": actual_size,
        "sha256": file_hash,
        "entropy": entropy,
        "risk_score": risk_score,
        "severity": severity,
        "verdict": verdict,
        "indicators": indicators,
        "status": "COMPLETED",
        "error": None
    }
