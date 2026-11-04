import os
import tempfile
import logging
from logging.handlers import RotatingFileHandler

def get_logger(name="EndpointGuard"):
    logger = logging.getLogger(name)
    
    # Only configure if no handlers exist
    if not logger.handlers:
        logger.setLevel(logging.INFO)
        
        # Try ProgramData, fallback to tempfile if permission denied
        log_dir = os.path.join(os.environ.get('PROGRAMDATA', 'C:\\ProgramData'), 'SelectShans', 'logs')
        try:
            os.makedirs(log_dir, exist_ok=True)
            log_file = os.path.join(log_dir, 'endpoint_guard.log')
            file_handler = RotatingFileHandler(log_file, maxBytes=10*1024*1024, backupCount=5, encoding='utf-8')
        except Exception:
            fallback_dir = os.path.join(tempfile.gettempdir(), 'SelectShans', 'logs')
            os.makedirs(fallback_dir, exist_ok=True)
            log_file = os.path.join(fallback_dir, 'endpoint_guard.log')
            file_handler = RotatingFileHandler(log_file, maxBytes=10*1024*1024, backupCount=5, encoding='utf-8')
        
        class SanitizedFormatter(logging.Formatter):
            def format(self, record):
                msg = super().format(record)
                for secret in ['jwt', 'token', 'secret', 'password']:
                    if f"{secret}=" in msg.lower():
                        import re
                        msg = re.sub(rf"(?i)({secret}=)[^\s]+", r"\1***HIDDEN***", msg)
                return msg

        formatter = SanitizedFormatter('%(asctime)s - %(name)s - [%(levelname)s] - %(message)s')
        file_handler.setFormatter(formatter)
        
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        
        logger.addHandler(file_handler)
        logger.addHandler(console_handler)
        
    return logger

logger = get_logger()
