import mysql.connector
import os
from dotenv import load_dotenv

load_dotenv()

db_host = os.getenv("DB_HOST", "localhost")
db_port = int(os.getenv("DB_PORT", 3306))
db_user = os.getenv("DB_USER")
db_password = os.getenv("DB_PASSWORD")
db_name = os.getenv("DB_NAME")

if not db_user or not db_password or not db_name:
    print("Error: DB_USER, DB_PASSWORD, and DB_NAME environment variables are required.")
    exit(1)

try:
    connection = mysql.connector.connect(
        host=db_host,
        port=db_port,
        user=db_user,
        password=db_password,
        database=db_name
    )
    cursor = connection.cursor()

    # Attempt to add the role column
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN role ENUM('admin', 'user') DEFAULT 'user'")
        print("Successfully added 'role' column.")
    except mysql.connector.Error as err:
        if err.errno == 1060: # Missing column error basically means it exists (Duplicate column name)
            print("'role' column already exists.")
        else:
            print(f"Error adding column: {err}")

    # Set admin to be an admin
    cursor.execute("UPDATE users SET role = 'admin' WHERE username = 'admin'")
    print("Updated 'admin' user to have 'admin' role.")
    
    connection.commit()
    print("Database modification complete.")

except Exception as e:
    print(f"Connection/execution error: {e}")
finally:
    if 'cursor' in locals():
        cursor.close()
    if 'connection' in locals() and connection.is_connected():
        connection.close()
