import os
import json
import uuid
import socket
from logger import logger

CONFIG_DIR = os.path.join(os.environ.get('PROGRAMDATA', 'C:\\ProgramData'), 'SelectShans')
CONFIG_FILE = os.path.join(CONFIG_DIR, 'config.json')
IDENTITY_FILE = os.path.join(CONFIG_DIR, 'identity.json')

DEFAULT_CONFIG = {
    "api_base": "http://127.0.0.1:5000",
    "token": "",
    "email": "",
    "protected_directories": [
        os.path.join(os.environ.get('USERPROFILE', 'C:\\Users\\Default'), 'Documents')
    ],
    "canary_locations": [
        os.path.join(os.environ.get('USERPROFILE', 'C:\\Users\\Default'), 'Documents')
    ],
    "threshold_write": 20,
    "threshold_rename": 10,
    "time_window_seconds": 15,
    "batching_interval_seconds": 5,
    "heartbeat_interval_seconds": 60,
    "service_version": "1.0.0"
}

class ConfigManager:
    def __init__(self):
        self.config = DEFAULT_CONFIG.copy()
        self.endpoint_id = None
        self.hostname = socket.gethostname()
        self._load_or_create_config()
        self._load_or_create_identity()

    def _load_or_create_config(self):
        os.makedirs(CONFIG_DIR, exist_ok=True)
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                    user_config = json.load(f)
                    self.config.update(user_config)
                logger.info(f"Loaded config from {CONFIG_FILE}")
            except Exception as e:
                logger.error(f"Failed to load config: {e}. Using defaults.")
        else:
            try:
                with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
                    json.dump(self.config, f, indent=4)
                logger.info(f"Created default config at {CONFIG_FILE}")
            except Exception as e:
                logger.error(f"Failed to write default config: {e}")

    def _load_or_create_identity(self):
        os.makedirs(CONFIG_DIR, exist_ok=True)
        if os.path.exists(IDENTITY_FILE):
            try:
                with open(IDENTITY_FILE, 'r', encoding='utf-8') as f:
                    identity = json.load(f)
                    self.endpoint_id = identity.get('endpoint_id')
                logger.info(f"Loaded existing identity: {self.endpoint_id}")
            except Exception as e:
                logger.error(f"Failed to load identity: {e}")
        
        if not self.endpoint_id:
            self.endpoint_id = str(uuid.uuid4())
            try:
                with open(IDENTITY_FILE, 'w', encoding='utf-8') as f:
                    json.dump({"endpoint_id": self.endpoint_id}, f, indent=4)
                logger.info(f"Generated and saved new identity: {self.endpoint_id}")
            except Exception as e:
                logger.error(f"Failed to save identity: {e}")

    def get(self, key, default=None):
        return self.config.get(key, default)

config_manager = ConfigManager()
