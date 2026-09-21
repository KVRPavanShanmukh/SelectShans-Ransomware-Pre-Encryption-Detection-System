import os
import logging
from logging.handlers import RotatingFileHandler

def get_logger(name="EndpointGuard"):
    logger = logging.getLogger(name)
    
    # Only configure if no handlers exist
    if not logger.handlers:
        logger.setLevel(logging.INFO)
        
        # Use common app data for logs
        log_dir = os.path.join(os.environ.get('PROGRAMDATA', 'C:\\ProgramData'), 'SelectShans', 'logs')
        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(log_dir, 'endpoint_guard.log')
        
        # 10 MB per file, max 5 files
        file_handler = RotatingFileHandler(log_file, maxBytes=10*1024*1024, backupCount=5, encoding='utf-8')
        
        class SanitizedFormatter(logging.Formatter):
            def format(self, record):
                # Mask potential secrets
                msg = super().format(record)
                for secret in ['jwt', 'token', 'secret', 'password']:
                    # Very crude basic sanitization for logs
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
