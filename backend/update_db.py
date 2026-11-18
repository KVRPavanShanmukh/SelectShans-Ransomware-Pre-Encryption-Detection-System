import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

database_url = os.getenv("DATABASE_URL")
sslmode = os.getenv("DB_SSLMODE", "require")

if not database_url:
    print("Error: DATABASE_URL environment variable is required.")
    exit(1)

def run_migration_stmt(cursor, stmt, success_msg):
    try:
        cursor.execute(stmt)
        print(f"PASS: {success_msg}")
    except Exception as err:
        print(f"INFO/WARN: {err} - {stmt[:50]}...")

try:
    connect_kwargs = {"dsn": database_url}
    if "sslmode=" not in database_url:
        connect_kwargs["sslmode"] = sslmode
    connection = psycopg2.connect(**connect_kwargs)
    connection.autocommit = True
    cursor = connection.cursor()

    # User table migrations
    run_migration_stmt(cursor, "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user'", "Added 'role' to users")
    run_migration_stmt(cursor, "ALTER TABLE users ADD COLUMN IF NOT EXISTS dob VARCHAR(20) DEFAULT '300706'", "Added 'dob' to users")
    run_migration_stmt(cursor, "ALTER TABLE users ADD COLUMN IF NOT EXISTS shikikan_access BOOLEAN DEFAULT FALSE", "Added 'shikikan_access' to users")
    run_migration_stmt(cursor, "ALTER TABLE users ADD COLUMN IF NOT EXISTS shikikan_requested BOOLEAN DEFAULT FALSE", "Added 'shikikan_requested' to users")
    run_migration_stmt(cursor, "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT FALSE", "Added 'is_online' to users")
    run_migration_stmt(cursor, "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active TIMESTAMP", "Added 'last_active' to users")

    # User profiles migrations
    run_migration_stmt(cursor, "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS address VARCHAR(500)", "Added 'address' to user_profiles")

    # Detector activities migrations (Fix schema mismatch)
    run_migration_stmt(cursor, "ALTER TABLE detector_activities ADD COLUMN IF NOT EXISTS directory VARCHAR(500)", "Added 'directory' to detector_activities")
    run_migration_stmt(cursor, "ALTER TABLE detector_activities ADD COLUMN IF NOT EXISTS target_file VARCHAR(255)", "Added 'target_file' to detector_activities")
    run_migration_stmt(cursor, "ALTER TABLE detector_activities ADD COLUMN IF NOT EXISTS severity VARCHAR(20) DEFAULT 'MEDIUM'", "Added 'severity' to detector_activities")
    run_migration_stmt(cursor, "ALTER TABLE detector_activities ADD COLUMN IF NOT EXISTS event_count INT DEFAULT 1", "Added 'event_count' to detector_activities")
    run_migration_stmt(cursor, "ALTER TABLE detector_activities ADD COLUMN IF NOT EXISTS details TEXT", "Added 'details' to detector_activities")

    # Alerts table migrations
    run_migration_stmt(cursor, "ALTER TABLE alerts ADD COLUMN IF NOT EXISTS action_taken VARCHAR(255) DEFAULT 'Marked & Logged'", "Checked alerts.action_taken")

    # Set admin to be an admin
    cursor.execute("UPDATE users SET role = 'admin' WHERE username = 'admin'")
    print("Updated 'admin' user to have 'admin' role.")
    
    print("Database migrations successfully completed.")

except Exception as e:
    print(f"Connection/execution error: {e}")
finally:
    if 'cursor' in locals() and cursor:
        cursor.close()
    if 'connection' in locals() and connection:
        connection.close()
