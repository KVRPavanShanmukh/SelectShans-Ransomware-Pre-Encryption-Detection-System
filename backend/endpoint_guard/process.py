import psutil
from logger import logger

def get_process_for_file(filepath):
    """
    Best-effort user-mode attribution.
    Iterates through processes to see which one has the file open.
    Due to race conditions, the process might have already closed the handle.
    """
    try:
        for proc in psutil.process_iter(['pid', 'name', 'exe']):
            try:
                # Need to run as admin to access other processes' open files
                open_files = proc.open_files()
                for ofile in open_files:
                    if ofile.path == filepath:
                        return {
                            "pid": proc.info['pid'],
                            "name": proc.info['name'],
                            "exe": proc.info['exe']
                        }
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
    except Exception as e:
        logger.error(f"Error enumerating processes: {e}")
        
    return {
        "pid": 0,
        "name": "process_unknown",
        "exe": "unknown"
    }
