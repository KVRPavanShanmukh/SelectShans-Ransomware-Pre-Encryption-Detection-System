"""
Entropy Analysis Module for SelectShans FolderGuard
Calculates Shannon entropy on bounded byte samples and tracks entropy shifts.
"""
import math
import os
from collections import OrderedDict
from typing import Tuple, Dict, Optional

# File extensions that naturally exhibit high entropy due to compression or encoding
NATURALLY_HIGH_ENTROPY_EXTENSIONS = {
    '.zip', '.gz', '.gzip', '.tar', '.tgz', '.bz2', '.xz', '.7z', '.rar',
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.ico', '.tiff',
    '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm',
    '.mp3', '.wav', '.flac', '.aac', '.ogg',
    '.pdf', '.docx', '.xlsx', '.pptx', '.odt', '.ods',
    '.iso', '.dmg', '.vmdk'
}

DEFAULT_SAMPLE_SIZE = 65536  # 64 KB sample is sufficient and fast for entropy analysis
MAX_CACHE_SIZE = 2000        # Bounded LRU cache size


def calculate_bytes_entropy(data: bytes) -> float:
    """Calculates Shannon entropy of raw bytes. Returns float in range [0.0, 8.0]."""
    if not data:
        return 0.0
    length = len(data)
    counts = [0] * 256
    for b in data:
        counts[b] += 1
    entropy = 0.0
    for count in counts:
        if count > 0:
            p_x = count / length
            entropy -= p_x * math.log2(p_x)
    return round(entropy, 4)


def calculate_file_entropy(filepath: str, sample_size: int = DEFAULT_SAMPLE_SIZE) -> float:
    """
    Safely calculates Shannon entropy of a file on a bounded byte sample.
    Handles inaccessible or nonexistent files gracefully without crashing.
    """
    if not filepath or not os.path.exists(filepath):
        return 0.0
    try:
        if os.path.isdir(filepath):
            return 0.0
        file_size = os.path.getsize(filepath)
        if file_size == 0:
            return 0.0

        with open(filepath, 'rb') as f:
            sample = f.read(min(sample_size, 1048576))  # Max 1MB bound
            return calculate_bytes_entropy(sample)
    except (PermissionError, FileNotFoundError, OSError):
        return 0.0
    except Exception:
        return 0.0


class EntropyTracker:
    """
    Maintains a bounded LRU cache of baseline file entropies to measure
    entropy deltas during file write or modification operations.
    """
    def __init__(self, max_cache_size: int = MAX_CACHE_SIZE):
        self.max_cache_size = max_cache_size
        self._cache: OrderedDict[str, float] = OrderedDict()

    def record_baseline(self, filepath: str, entropy: Optional[float] = None) -> float:
        """Records initial baseline entropy before modifications."""
        norm_path = os.path.normcase(os.path.abspath(filepath))
        if entropy is None:
            entropy = calculate_file_entropy(filepath)
        if len(self._cache) >= self.max_cache_size:
            self._cache.popitem(last=False)
        self._cache[norm_path] = entropy
        return entropy

    def get_baseline(self, filepath: str) -> Optional[float]:
        norm_path = os.path.normcase(os.path.abspath(filepath))
        return self._cache.get(norm_path)

    def analyze_modification(
        self,
        filepath: str,
        sample_size: int = DEFAULT_SAMPLE_SIZE,
        entropy_threshold: float = 7.2,
        delta_threshold: float = 1.8
    ) -> Dict[str, any]:
        """
        Analyzes modified file entropy against baseline.
        Distinguishes pre-compressed media formats from genuine encryption surges.
        Uses caller-configured entropy_threshold and delta_threshold.
        """
        norm_path = os.path.normcase(os.path.abspath(filepath))
        current_entropy = calculate_file_entropy(filepath, sample_size=sample_size)
        baseline = self._cache.get(norm_path)
        ext = os.path.splitext(filepath)[1].lower()
        is_natural_compressed = ext in NATURALLY_HIGH_ENTROPY_EXTENSIONS

        delta = 0.0
        if baseline is not None:
            delta = round(current_entropy - baseline, 4)

        # Update cache with current value
        if len(self._cache) >= self.max_cache_size and norm_path not in self._cache:
            self._cache.popitem(last=False)
        self._cache[norm_path] = current_entropy

        # Detection logic:
        # A significant surge in entropy on a non-compressed format indicates encryption
        is_surge = False
        explanation = ""

        if is_natural_compressed:
            explanation = f"File is standard pre-compressed format ({ext}) with baseline high entropy ({current_entropy:.2f})."
        elif baseline is not None and delta >= delta_threshold and current_entropy >= entropy_threshold:
            is_surge = True
            explanation = f"High entropy surge detected: {baseline:.2f} -> {current_entropy:.2f} (+{delta:.2f} delta) on format {ext or 'none'}."
        elif baseline is None and current_entropy >= max(entropy_threshold, 7.5):
            is_surge = True
            explanation = f"Elevated entropy ({current_entropy:.2f}) observed on non-compressed format {ext or 'none'}."
        else:
            explanation = f"Normal entropy ({current_entropy:.2f}) for format {ext or 'plain'}."

        return {
            "current_entropy": current_entropy,
            "baseline_entropy": baseline,
            "delta": delta,
            "is_surge": is_surge,
            "is_natural_compressed": is_natural_compressed,
            "explanation": explanation
        }

    def clear(self):
        self._cache.clear()
