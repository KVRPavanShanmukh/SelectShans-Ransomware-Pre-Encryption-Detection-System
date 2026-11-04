import mysql.connector
import os
from dotenv import load_dotenv

load_dotenv()

db_host = os.getenv("DB_HOST", "localhost")
db_port = int(os.getenv("DB_PORT", 3306))
db_user = os.getenv("DB_USER")
db_password = os.getenv("DB_PASSWORD")
db_name = os.getenv("DB_NAME", "RANSOMWARE")

if not db_user or not db_password or not db_name:
    print("Error: DB_USER, DB_PASSWORD, and DB_NAME environment variables are required.")
    exit(1)

def run_migration_stmt(cursor, stmt, success_msg):
    try:
        cursor.execute(stmt)
        print(f"PASS: {success_msg}")
    except mysql.connector.Error as err:
        if err.errno in (1060, 1061): # Duplicate column or key name
            print(f"INFO: Already exists - {stmt[:50]}...")
        else:
            print(f"WARN: {err}")

try:
    connection = mysql.connector.connect(
        host=db_host,
        port=db_port,
        user=db_user,
        password=db_password,
        database=db_name
    )
    cursor = connection.cursor()

    # User table migrations
    run_migration_stmt(cursor, "ALTER TABLE users ADD COLUMN role ENUM('admin', 'user') DEFAULT 'user'", "Added 'role' to users")
    run_migration_stmt(cursor, "ALTER TABLE users ADD COLUMN dob VARCHAR(20) DEFAULT '300706'", "Added 'dob' to users")
    run_migration_stmt(cursor, "ALTER TABLE users ADD COLUMN shikikan_access BOOLEAN DEFAULT FALSE", "Added 'shikikan_access' to users")
    run_migration_stmt(cursor, "ALTER TABLE users ADD COLUMN shikikan_requested BOOLEAN DEFAULT FALSE", "Added 'shikikan_requested' to users")
    run_migration_stmt(cursor, "ALTER TABLE users ADD COLUMN is_online BOOLEAN DEFAULT FALSE", "Added 'is_online' to users")
    run_migration_stmt(cursor, "ALTER TABLE users ADD COLUMN last_active DATETIME", "Added 'last_active' to users")

    # User profiles migrations
    run_migration_stmt(cursor, "ALTER TABLE user_profiles ADD COLUMN address VARCHAR(500)", "Added 'address' to user_profiles")

    # Detector activities migrations (Fix schema mismatch)
    run_migration_stmt(cursor, "ALTER TABLE detector_activities ADD COLUMN directory VARCHAR(500)", "Added 'directory' to detector_activities")
    run_migration_stmt(cursor, "ALTER TABLE detector_activities ADD COLUMN target_file VARCHAR(255)", "Added 'target_file' to detector_activities")
    run_migration_stmt(cursor, "ALTER TABLE detector_activities ADD COLUMN severity VARCHAR(20) DEFAULT 'MEDIUM'", "Added 'severity' to detector_activities")
    run_migration_stmt(cursor, "ALTER TABLE detector_activities ADD COLUMN event_count INT DEFAULT 1", "Added 'event_count' to detector_activities")
    run_migration_stmt(cursor, "ALTER TABLE detector_activities ADD COLUMN details TEXT", "Added 'details' to detector_activities")

    # Alerts table migrations
    run_migration_stmt(cursor, "ALTER TABLE alerts MODIFY COLUMN action_taken VARCHAR(255) NOT NULL", "Expanded alerts.action_taken to VARCHAR(255)")

    # Set admin to be an admin
    cursor.execute("UPDATE users SET role = 'admin' WHERE username = 'admin'")
    print("Updated 'admin' user to have 'admin' role.")
    
    connection.commit()
    print("Database migrations successfully completed.")

except Exception as e:
    print(f"Connection/execution error: {e}")
finally:
    if 'cursor' in locals():
        cursor.close()
    if 'connection' in locals() and connection.is_connected():
        connection.close()
