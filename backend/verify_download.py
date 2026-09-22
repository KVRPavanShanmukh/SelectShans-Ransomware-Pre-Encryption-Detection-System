import sqlite3
import urllib.request
import json
import zipfile
import io
import os

db_path = 'd:\\HACK-LEARNATHONS\\LEARNATHON SLOT 3\\FINAL\\PRO\\PRO\\backend\\instance\\selectshans.db'

# Just check what's inside the database
try:
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute("SELECT token FROM users LIMIT 1")
    row = c.fetchone()
    conn.close()

    if row:
        token = row[0]
        print(f"Found token: {token}")
        
        # Now download the zip
        url = f"http://127.0.0.1:5000/api/detector-download?token={token}"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as response:
            data = response.read()
            
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                print(f"Downloaded ZIP contains {len(z.namelist())} files.")
                
                # Check for old python files
                forbidden = ["detector.py", "requirements.txt", "run.bat"]
                found_forbidden = [f for f in forbidden if f in z.namelist()]
                if found_forbidden:
                    print(f"FAIL: Found forbidden files: {found_forbidden}")
                else:
                    print("PASS: No old Python files found.")
                
                # Check for .NET GUI files
                if "SelectShans.GUI.exe" in z.namelist():
                    print("PASS: Found SelectShans.GUI.exe")
                else:
                    print("FAIL: Missing SelectShans.GUI.exe")
                    
                # Read appsettings.json
                if "appsettings.json" in z.namelist():
                    appsettings_data = z.read("appsettings.json")
                    settings = json.loads(appsettings_data)
                    print("appsettings.json:", json.dumps(settings, indent=2))
                else:
                    print("FAIL: Missing appsettings.json")
                    
    else:
        print("No users found.")
except Exception as e:
    print(f"Error: {e}")
