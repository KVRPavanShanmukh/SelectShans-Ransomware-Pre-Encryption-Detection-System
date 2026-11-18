"""
SelectShans SOC - Admin & Password Management Utility
Allows secure setting/resetting of user passwords and elevation to 'admin' role.
Passwords are cryptographically hashed using PBKDF2 (werkzeug.security.generate_password_hash).
"""
import os
import sys
import getpass
import argparse
import psycopg2
from psycopg2.extras import RealDictCursor
from werkzeug.security import generate_password_hash
from dotenv import load_dotenv

# Load environment configuration
backend_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(backend_dir, ".env"))

DATABASE_URL = os.getenv("DATABASE_URL")
SSL_MODE = os.getenv("DB_SSLMODE", "require")


def get_db_connection():
    if not DATABASE_URL:
        print("[ERROR] DATABASE_URL environment variable is missing. Check backend/.env.")
        sys.exit(1)
    
    kwargs = {"dsn": DATABASE_URL}
    if "sslmode=" not in DATABASE_URL:
        kwargs["sslmode"] = SSL_MODE
    return psycopg2.connect(**kwargs)


def list_users(cursor):
    cursor.execute("SELECT id, username, email, role, shikikan_access, is_online FROM users ORDER BY id ASC")
    return cursor.fetchall()


def reset_password_and_promote(identifier, new_password, elevate_admin=True, grant_shikikan=True):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT id, username, email, role FROM users WHERE LOWER(username) = %s OR LOWER(email) = %s",
                (identifier.strip().lower(), identifier.strip().lower())
            )
            user = cur.fetchone()
            
            if not user:
                print(f"[ERROR] User matching '{identifier}' not found in database.")
                return False

            hashed_pw = generate_password_hash(new_password)
            new_role = "admin" if elevate_admin else user["role"]
            
            cur.execute(
                """
                UPDATE users 
                SET password_hash = %s,
                    role = %s::user_role,
                    shikikan_access = %s
                WHERE id = %s
                """,
                (hashed_pw, new_role, grant_shikikan, user["id"])
            )
            conn.commit()
            
            print("\n" + "=" * 55)
            print("[SUCCESS] Account Credentials Successfully Updated!")
            print(f"  User ID:         {user['id']}")
            print(f"  Username:        {user['username']}")
            print(f"  Email:           {user['email']}")
            print(f"  Assigned Role:   {new_role}")
            print(f"  Shikikan Access: {grant_shikikan}")
            print("  Password:        [SECURELY HASHED with PBKDF2]")
            print("=" * 55 + "\n")
            return True
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="SelectShans SOC Admin & Password Management Utility")
    parser.add_argument("--list", action="store_true", help="List registered users and their current roles")
    parser.add_argument("--user", help="Username or Email of the user to update (e.g. pavan)")
    parser.add_argument("--password", help="New password to set (if omitted, will prompt securely via getpass)")
    parser.add_argument("--role", choices=["admin", "user"], default="admin", help="Role to assign (default: admin)")
    parser.add_argument("--shikikan", action="store_true", default=True, help="Enable Shikikan SOC access (default: True)")

    args = parser.parse_args()

    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            users = list_users(cur)
    finally:
        conn.close()

    if args.list:
        print("\nRegistered Users in PostgreSQL:")
        for u in users:
            print(f" - ID: {u['id']} | Username: {u['username']} | Email: {u['email']} | Role: {u['role']} | Shikikan: {u['shikikan_access']}")
        print()
        return

    # Non-interactive mode if --user and --password are provided
    if args.user and args.password:
        reset_password_and_promote(
            args.user, 
            args.password, 
            elevate_admin=(args.role == "admin"), 
            grant_shikikan=args.shikikan
        )
        return

    # Interactive CLI Mode
    print("=" * 55)
    print("  SelectShans SOC - Admin & Password Management")
    print("=" * 55)

    if not users:
        print("[WARN] No users currently registered in the database.")
        return

    print("\nCurrent Registered Users in PostgreSQL:")
    for u in users:
        print(f" - ID: {u['id']} | Username: {u['username']} | Email: {u['email']} | Role: {u['role']} | Shikikan: {u['shikikan_access']}")
    print("-" * 55)

    target = args.user or input("\nEnter Username or Email to update (default: pavan): ").strip()
    if not target:
        target = "pavan"

    while True:
        pw1 = getpass.getpass("Enter New Password: ")
        if len(pw1) < 6:
            print("[WARN] Password should be at least 6 characters long. Try again.")
            continue
        pw2 = getpass.getpass("Confirm New Password: ")
        if pw1 != pw2:
            print("[WARN] Passwords do not match. Try again.")
            continue
        break

    elevate_input = input("Assign 'admin' role? (Y/n, default: Y): ").strip().lower()
    elevate = False if elevate_input == 'n' else True

    shikikan_input = input("Grant Shikikan Access? (Y/n, default: Y): ").strip().lower()
    shikikan = False if shikikan_input == 'n' else True

    reset_password_and_promote(target, pw1, elevate_admin=elevate, grant_shikikan=shikikan)


if __name__ == "__main__":
    main()
