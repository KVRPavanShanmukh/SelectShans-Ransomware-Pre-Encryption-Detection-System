"""
Verify Detector Download Integrity
SelectShans - Ransomware Pre-Encryption Detection System
"""
import zipfile
import io
import json
import os
import sys

# Ensure backend directory is in path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app import app, create_detector_token

def verify_detector_zip():
    print("Testing detector download endpoint...")
    client = app.test_client()
    
    test_user_id = 1
    test_email = "admin@selectshans.local"
    token = create_detector_token(test_user_id, test_email)
    
    response = client.get(f'/api/detector-download?token={token}')
    if response.status_code != 200:
        print(f"FAIL: Endpoint returned HTTP {response.status_code}")
        return False
        
    try:
        zf = zipfile.ZipFile(io.BytesIO(response.data))
        namelist = zf.namelist()
        print(f"Downloaded ZIP contains {len(namelist)} items: {namelist}")
        
        required_files = ["config.json", "detector.py", "requirements.txt", "run.bat"]
        missing = [f for f in required_files if f not in namelist]
        
        if missing:
            print(f"FAIL: Missing required detector package files: {missing}")
            return False
            
        # Verify config.json content
        config_data = json.loads(zf.read("config.json"))
        print(f"PASS: config.json parsed successfully: token={config_data.get('token')[:15]}... email={config_data.get('email')}")
        
        # Verify detector.py content
        detector_code = zf.read("detector.py").decode('utf-8')
        if "FolderMonitor" in detector_code and "FileSystemEventHandler" in detector_code:
            print("PASS: detector.py contains valid file monitoring logic.")
        else:
            print("FAIL: detector.py appears corrupted or incomplete.")
            return False
            
        print("ALL DETECTOR DOWNLOAD CHECKS PASSED.")
        return True
    except Exception as e:
        print(f"FAIL: Error inspecting downloaded ZIP: {e}")
        return False

if __name__ == "__main__":
    success = verify_detector_zip()
    sys.exit(0 if success else 1)
