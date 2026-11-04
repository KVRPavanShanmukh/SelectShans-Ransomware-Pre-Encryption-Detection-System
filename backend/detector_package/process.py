"""
Process Attribution Module for SelectShans FolderGuard
Provides non-blocking, best-effort process attribution with LRU caching.
"""
import time
import os
import psutil
from collections import OrderedDict
from typing import Dict, Optional

MAX_PROCESS_CACHE = 500
CACHE_TTL_SECONDS = 30


class ProcessAttributor:
    """
    Identifies the process responsible for file operations without blocking event loops
    or iterating through every system process on every filesystem callback.
    """
    def __init__(self, cache_size: int = MAX_PROCESS_CACHE, ttl: int = CACHE_TTL_SECONDS):
        self.cache_size = cache_size
        self.ttl = ttl
        self._cache: OrderedDict[str, Dict[str, any]] = OrderedDict()
        self._last_attribution_attempt = 0.0

    def get_cached_process(self, filepath: str) -> Optional[Dict[str, any]]:
        norm = os.path.normcase(os.path.abspath(filepath))
        entry = self._cache.get(norm)
        if entry:
            if time.time() - entry["timestamp"] <= self.ttl:
                return entry["info"]
            else:
                self._cache.pop(norm, None)
        return None

    def attribute_event(self, filepath: str, check_handles: bool = False) -> Dict[str, any]:
        """
        Attempts best-effort attribution.
        If check_handles is False (default for high-throughput events), returns fast cached/active info.
        If check_handles is True (for confirmed threshold bursts), performs targeted handle inspection with timeout.
        """
        if not filepath:
            return self._unknown_process()

        norm = os.path.normcase(os.path.abspath(filepath))
        cached = self.get_cached_process(norm)
        if cached:
            return cached

        # Rate-limit handle enumeration to at most once per 2 seconds
        now = time.time()
        if not check_handles or (now - self._last_attribution_attempt < 2.0):
            return self._unknown_process()

        self._last_attribution_attempt = now

        # Perform bounded handle search across non-system processes
        try:
            target_norm = os.path.normcase(filepath)
            for proc in psutil.process_iter(['pid', 'name', 'exe', 'ppid', 'create_time']):
                try:
                    # Skip critical system processes to save time & avoid AccessDenied storms
                    pname = proc.info.get('name') or ''
                    if pname.lower() in ('system', 'registry', 'smss.exe', 'csrss.exe', 'wininit.exe', 'services.exe', 'lsass.exe'):
                        continue

                    open_files = proc.open_files()
                    for ofile in open_files:
                        if os.path.normcase(ofile.path) == target_norm:
                            proc_info = {
                                "pid": proc.info.get('pid', 0),
                                "process_name": pname or "unknown",
                                "exe": proc.info.get('exe', "unknown"),
                                "ppid": proc.info.get('ppid', 0),
                                "create_time": proc.info.get('create_time', 0.0),
                                "attribution_confidence": "confirmed"
                            }
                            # Cache the match
                            if len(self._cache) >= self.cache_size:
                                self._cache.popitem(last=False)
                            self._cache[norm] = {"timestamp": now, "info": proc_info}
                            return proc_info
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                    continue
        except Exception:
            pass

        # Return honest unknown fallback
        unknown_info = self._unknown_process()
        if len(self._cache) >= self.cache_size:
            self._cache.popitem(last=False)
        self._cache[norm] = {"timestamp": now, "info": unknown_info}
        return unknown_info

    def _unknown_process(self) -> Dict[str, any]:
        return {
            "pid": 0,
            "process_name": "unknown",
            "exe": "unknown",
            "ppid": 0,
            "create_time": 0.0,
            "attribution_confidence": "unknown"
        }

    def clear(self):
        self._cache.clear()
