import os
import shutil
from logger import logger
from config import config_manager

CANARY_FILENAMES = [
    "~WRL0001.tmp",
    "backup_important_do_not_delete.docx",
    "passwords_archive.zip"
]

class CanaryManager:
    def __init__(self):
        self.canary_locations = config_manager.get("canary_locations", [])
        self.deployed_canaries = set()

    def deploy_canaries(self):
        for location in self.canary_locations:
            if not os.path.exists(location):
                logger.warning(f"Canary location does not exist: {location}")
                continue
                
            for filename in CANARY_FILENAMES:
                filepath = os.path.join(location, filename)
                try:
                    # Write some dummy text
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write("This is a system generated file. Do not modify.\n" * 10)
                    
                    # Hide the file using windows attrib
                    os.system(f'attrib +h "{filepath}"')
                    self.deployed_canaries.add(filepath)
                    logger.debug(f"Deployed canary: {filepath}")
                except Exception as e:
                    logger.error(f"Failed to deploy canary at {filepath}: {e}")
                    
        logger.info(f"Deployed {len(self.deployed_canaries)} canary files.")

    def is_canary(self, filepath):
        return filepath in self.deployed_canaries or any(filepath.endswith(name) for name in CANARY_FILENAMES)

    def cleanup(self):
        for filepath in self.deployed_canaries:
            try:
                if os.path.exists(filepath):
                    os.system(f'attrib -h "{filepath}"')
                    os.remove(filepath)
            except Exception as e:
                logger.error(f"Failed to clean up canary {filepath}: {e}")
        self.deployed_canaries.clear()

canary_manager = CanaryManager()
