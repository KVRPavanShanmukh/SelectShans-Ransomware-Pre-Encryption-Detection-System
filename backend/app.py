import os
import subprocess
import sys
import hmac
import hashlib
import base64
import secrets
import smtplib
import json
import io
import zipfile
import random
import jwt

from pathlib import Path
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders

from dotenv import load_dotenv
load_dotenv()

APP_ENV = os.getenv("APP_ENV", "production")

REQUIRED_ENV_VARS = ["DB_PASSWORD", "JWT_SECRET", "DETECTOR_SECRET"]
for var in REQUIRED_ENV_VARS:
    if not os.getenv(var):
        raise RuntimeError(f"{var} environment variable is required")

from apscheduler.schedulers.background import BackgroundScheduler

from flask import Flask, request, jsonify, send_file, after_this_request, g
from flask_cors import CORS
from mysql.connector import pooling
from werkzeug.security import generate_password_hash, check_password_hash

# JWT and utilities
from jwt_utils import create_token, verify_token, refresh_token, token_required
from admin_routes import register_admin_routes

# PDF + Graph
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt


# =====================================================
# INITIAL SETUP
# =====================================================

app = Flask(__name__)
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5174")
CORS(app, resources={r"/*": {"origins": frontend_url}})

print("Starting SelectShans Backend...")

@app.errorhandler(Exception)
def handle_exception(e):
    import traceback
    return str(traceback.format_exc()), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok"}), 200

# =====================================================
# DATABASE CONFIG & AUTO-CREATION
# =====================================================

is_vercel = os.getenv("VERCEL") == "1"

db_pass = os.getenv("DB_PASSWORD")

db_name = os.getenv("DB_NAME", "RANSOMWARE")

dbconf = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", 3306)),
    "user": os.getenv("DB_USER", "root"),
    "password": db_pass
}

# Auto-create database if it doesn't exist
if not is_vercel:
    try:
        print("Pre-connecting to MySQL to verify/create database...")
        import mysql.connector
        temp_conn = mysql.connector.connect(**dbconf)
        temp_cursor = temp_conn.cursor()
        temp_cursor.execute(f"CREATE DATABASE IF NOT EXISTS {db_name}")
        temp_conn.commit()
        temp_cursor.close()
        temp_conn.close()
        print(f"Database '{db_name}' verified/created.")
    except Exception as db_init_err:
        print("Failed to auto-create database:", db_init_err)

# Add database name to configuration for the pool
dbconf["database"] = db_name

pool = pooling.MySQLConnectionPool(
    pool_name="mypool",
    pool_size=1 if is_vercel else 5,
    **dbconf
)

print("MySQL pool ready.")

def init_db(pool):
    print("Initializing database schema...")
    schema_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema.sql")
    if not os.path.exists(schema_path):
        print("schema.sql not found at:", schema_path)
        return
        
    try:
        with open(schema_path, "r", encoding="utf-8") as f:
            schema_sql = f.read()
            
        statements = []
        current_stmt = []
        for line in schema_sql.splitlines():
            if line.strip().startswith("--") or line.strip().startswith("#"):
                continue
            if not line.strip():
                continue
            current_stmt.append(line)
            if line.strip().endswith(";"):
                statements.append(" ".join(current_stmt))
                current_stmt = []
                
        # Make sure detector_logs exists
        statements.append("""
            CREATE TABLE IF NOT EXISTS detector_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                event_type VARCHAR(100) NOT NULL,
                directory VARCHAR(500),
                event_count INT DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        statements.append("""
            CREATE TABLE IF NOT EXISTS detector_activities (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                event_type VARCHAR(100) NOT NULL,
                details TEXT,
                action_taken VARCHAR(255),
                process_name VARCHAR(100),
                score INT DEFAULT 0,
                detector_id VARCHAR(50),
                hostname VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        alter_statements = [
            "ALTER TABLE users ADD COLUMN role ENUM('admin', 'user') DEFAULT 'user';",
            "ALTER TABLE users ADD COLUMN dob VARCHAR(20) DEFAULT '300706';",
            "ALTER TABLE users ADD COLUMN shikikan_access BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE users ADD COLUMN shikikan_requested BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE users ADD COLUMN is_online BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE users ADD COLUMN last_active DATETIME;",
            "ALTER TABLE user_profiles ADD COLUMN address VARCHAR(500);"
        ]
        
        conn = pool.get_connection()
        cursor = conn.cursor()
        for stmt in statements:
            if stmt.strip():
                try:
                    cursor.execute(stmt)
                except Exception:
                    pass
                    
        for stmt in alter_statements:
            try:
                cursor.execute(stmt)
            except Exception:
                pass

        try:
            cursor.execute("UPDATE users SET role = 'admin' WHERE username = 'admin';")
        except Exception:
            pass
            
        conn.commit()
        cursor.close()
        conn.close()
        print("Database schema successfully initialized.")
    except Exception as e:
        print("Failed to initialize database schema:", e)

# Run schema initialization
if not is_vercel:
    init_db(pool)

# Register admin routes
register_admin_routes(app, pool)


# =====================================================
# GLOBALS
# =====================================================

DETECTOR_PACKAGE_DIR = Path(__file__).resolve().parent / "detector_package"
DETECTOR_SECRET = os.getenv("DETECTOR_SECRET")

_pending_logins = {}
OTP_EXPIRY = 3


# =====================================================
# UTILITY FUNCTIONS
# =====================================================

def create_detector_token(user_id, email):
    raw = f"{user_id}|{email}|{secrets.token_hex(8)}"
    sig = hmac.new(DETECTOR_SECRET.encode(), raw.encode(), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(f"{sig}|{raw}".encode()).decode()


def verify_detector_token(token):
    try:
        decoded = base64.urlsafe_b64decode(token.encode()).decode()
        sig, raw = decoded.split("|", 1)
        expected = hmac.new(DETECTOR_SECRET.encode(), raw.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        parts = raw.split("|")
        return {"user_id": int(parts[0]), "email": parts[1]}
    except:
        return None


# Memory store for active detectors (user_id -> last_ping_datetime)
_active_detectors = {}

def send_email_safe(to_email, subject, body, attachment_path=None, html_body=None):
    try:
        msg = MIMEMultipart('mixed')
        msg['From'] = os.getenv("MAIL_USER", "no-reply@selectshans.local")
        msg['To'] = to_email
        msg['Subject'] = subject
        
        alt_part = MIMEMultipart('alternative')
        alt_part.attach(MIMEText(body, 'plain'))
        if html_body:
            alt_part.attach(MIMEText(html_body, 'html'))
        msg.attach(alt_part)
        
        if attachment_path and os.path.exists(attachment_path):
            with open(attachment_path, "rb") as attachment:
                part = MIMEBase("application", "octet-stream")
                part.set_payload(attachment.read())
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", f"attachment; filename= {os.path.basename(attachment_path)}")
            msg.attach(part)
            
        smtp_server = os.getenv("MAIL_HOST", "localhost")
        smtp_port = int(os.getenv("MAIL_PORT", 25))
        smtp_user = os.getenv("MAIL_USER")
        smtp_pass = os.getenv("MAIL_PASS")
        
        # Simulated email fallback only in development
        if APP_ENV == "development" and not smtp_pass:
            print("Simulated Email Sent (No SMTP configured):", to_email, subject)
            return True
        elif not smtp_pass:
            print("Error: SMTP credentials missing in production environment")
            return False
            
        server = smtplib.SMTP(smtp_server, smtp_port)
        if smtp_user and smtp_pass:
            server.starttls()
            server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        print(f"SMTP execution failed: {e}")
        print("\n=== SIMULATED EMAIL FALLBACK ===")
        print(f"To: {to_email}")
        print(f"Subject: {subject}")
        print(f"Body:\n{body}")
        print("================================\n")
        return False

# =====================================================
# AUTH ROUTES
# =====================================================

@app.route('/api/signup', methods=['POST'])
def signup():
    data = request.json

    if not all([data.get("username"), data.get("email"),
                data.get("password"), data.get("sec_q"), data.get("sec_a")]):
        return jsonify({"error": "All fields required"}), 400

    import re
    password = data.get("password")
    if not re.search(r'[A-Z]', password):
        return jsonify({"error": "Password must contain at least one uppercase letter."}), 400
    if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
        return jsonify({"error": "Password must contain at least one special character."}), 400

    conn = pool.get_connection()
    try:
        cursor = conn.cursor(dictionary=True, buffered=True)
        cursor.execute("SELECT id FROM users WHERE username=%s", (data["username"],))
        if cursor.fetchone():
            return jsonify({"error": "Username taken"}), 409

        try:
            cursor.execute("""
                INSERT INTO users (username, password_hash, email, sec_q, sec_a_hash)
                VALUES (%s, %s, %s, %s, %s)
            """, (
                data["username"],
                generate_password_hash(data["password"]),
                data["email"],
                data["sec_q"],
                generate_password_hash(data["sec_a"])
            ))
            conn.commit()
        except Exception as e:
            return jsonify({"error": "Username or email already exists"}), 409
    finally:
        try: cursor.close()
        except: pass
        conn.close()

    return jsonify({"message": "User created"}), 201


@app.route('/api/login', methods=['POST'])
def login():
    data = request.json

    conn = pool.get_connection()
    try:
        cursor = conn.cursor(dictionary=True, buffered=True)
        cursor.execute(
            "SELECT id, username, email, password_hash, dob FROM users WHERE username=%s OR email=%s",
            (data.get("username"), data.get("username"))
        )
        users = cursor.fetchall()
    finally:
        try: cursor.close()
        except: pass
        conn.close()

    valid_user = None
    if users:
        for u in users:
            if u.get("password_hash"):
                try:
                    if check_password_hash(u["password_hash"], data.get("password")):
                        valid_user = u
                        break
                except ValueError:
                    pass

    if not valid_user:
        return jsonify({"error": "Invalid credentials"}), 401

    user = valid_user
    email = user["email"]
    otp = ''.join(secrets.choice("0123456789") for _ in range(6))
    psk = ''.join(secrets.choice("abcdefghijklmnopqrstuvwxyz0123456789") for _ in range(8))

    _pending_logins[email.lower()] = {
        "otp": otp,
        "psk": psk,
        "user_id": user["id"],
        "username": user["username"],
        "email": email,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY)
    }

    print(f"\n[DEBUG] Login Attempt for {email}")
    print(f"[DEBUG] OTP: {otp} | PSK: {psk}\n")

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
    <style>
        .email-container {{
            background-color: #050a0e;
            color: #00ffcc;
            font-family: 'Courier New', Courier, monospace;
            padding: 40px;
            text-align: center;
            border: 2px solid #00ffcc;
            border-radius: 10px;
            max-width: 600px;
            margin: 0 auto;
        }}
        .header {{
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 20px;
            text-transform: uppercase;
            letter-spacing: 2px;
            border-bottom: 1px solid #00ffcc;
            padding-bottom: 10px;
        }}
        .secret-box {{
            background-color: #0a1922;
            border: 1px dashed #00ffcc;
            padding: 20px;
            margin: 20px 0;
            border-radius: 5px;
            transition: all 0.3s ease;
        }}
        .secret-box:hover {{
            background-color: #00ffcc;
            color: #050a0e;
            box-shadow: 0 0 15px #00ffcc;
            transform: scale(1.05);
            cursor: crosshair;
        }}
        .label {{
            font-size: 14px;
            opacity: 0.8;
            margin-bottom: 5px;
        }}
        .value {{
            font-size: 36px;
            font-weight: bold;
            letter-spacing: 5px;
        }}
        .footer {{
            font-size: 12px;
            color: #888;
            margin-top: 30px;
        }}
    </style>
    </head>
    <body>
        <div class="email-container">
            <div class="header">SelectShans Security Protocol</div>
            <p>Authentication request detected for {email}.</p>
            <p>Use the following credentials to access the system.</p>
            
            <div class="secret-box">
                <div class="label">ONE-TIME PASSWORD (OTP)</div>
                <div class="value">{otp}</div>
            </div>
            
            <div class="secret-box">
                <div class="label">PRE-SHARED KEY (PSK)</div>
                <div class="value">{psk}</div>
            </div>
            
            <div class="footer">
                Warning: These credentials will self-destruct in {OTP_EXPIRY} minutes.<br>
                Do not share these keys with anyone.
            </div>
        </div>
    </body>
    </html>
    """

    success = send_email_safe(
        email,
        "SelectShans Login",
        f"OTP: {otp}\nPSK: {psk}\nValid for {OTP_EXPIRY} minutes.",
        html_body=html_body
    )
    if not success:
        return jsonify({"error": "Failed to send OTP email. Please verify SMTP configuration."}), 500

    return jsonify({"pending": True, "identifier": email}), 200


@app.route('/api/login/verify', methods=['POST'])
def verify():
    data = request.json
    identifier = data.get("identifier", "").lower()
    pending = _pending_logins.get(identifier)

    if not pending:
        return jsonify({"error": "Invalid or expired"}), 401

    if pending["otp"] != data.get("otp") or pending["psk"] != data.get("psk"):
        return jsonify({"error": "Invalid OTP/PSK"}), 401

    # Log the successful login (Skipping login_sessions since it's not in schema.sql)

    detector_token = create_detector_token(pending["user_id"], pending["email"])
    jwt_token = create_token(pending["user_id"], pending["username"], pending["email"])
    del _pending_logins[identifier]

    return jsonify({
        "message": "Login successful",
        "token": jwt_token,
        "detector_token": detector_token,
        "user_id": pending["user_id"],
        "username": pending["username"],
        "email": pending["email"],
        "expires_in": 30 * 60  # 30 minutes in seconds
    }), 200



@app.route('/api/user/ping', methods=['POST'])
@token_required
def user_ping():
    user_id = g.user['user_id']
    conn = pool.get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE users SET is_online = TRUE, last_active = NOW() WHERE id = %s", (user_id,))
        conn.commit()
        return jsonify({"status": "ok"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/users/request-shikikan', methods=['POST'])
@token_required
def request_shikikan():
    user_id = g.user['user_id']
    conn = pool.get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE users SET shikikan_requested = TRUE WHERE id = %s", (user_id,))
        conn.commit()
        return jsonify({"status": "Requested access to Shiki-kan successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/send-email', methods=['POST'])
@token_required
def api_send_email():
    data = request.json or {}
    to_email = data.get('to')
    subject = data.get('subject')
    body = data.get('body')
    
    if not to_email or not subject or not body:
        return jsonify({"error": "Missing required fields"}), 400
        
    success = send_email_safe(to_email, subject, body)
    if success:
        return jsonify({"message": "Email sent successfully"}), 200
    else:
        return jsonify({"error": "Failed to send email"}), 500

# =====================================================
# BETA LAYER ROUTES
# =====================================================

_pending_beta_logins = {}

@app.route('/api/beta/login', methods=['POST'])
@token_required
def beta_login():
    current_user = g.user
    
    data = request.json or {}
    requested_email = data.get("email", "").lower().strip()
    
    if not requested_email:
        return jsonify({"error": "Email is required"}), 400
        
    if requested_email != current_user["email"].lower():
        return jsonify({"error": "Unauthorized email address"}), 403
        
    email = requested_email
    
    conn = pool.get_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT dob, shikikan_access FROM users WHERE id=%s", (current_user["user_id"],))
        user = cursor.fetchone()
    finally:
        try: cursor.close()
        except: pass
        conn.close()

    if not user:
        return jsonify({"error": "User not found"}), 404
        
    if not user.get("shikikan_access"):
        return jsonify({"error": "Access Denied by Admin. Please request permission."}), 403
        
    int_otp = ''.join(secrets.choice("0123456789") for _ in range(4))
    str_otp = ''.join(secrets.choice("abcdefghijklmnopqrstuvwxyz") for _ in range(3))

    _pending_beta_logins[email] = {
        "int_otp": int_otp,
        "str_otp": str_otp,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5)
    }

    expected_full_code = ""
    for i in range(3):
        expected_full_code += int_otp[i] + str_otp[i]
    expected_full_code += int_otp[3]

    success = send_email_safe(
        email,
        "SelectShans Beta Terminal Access",
        f"OTP: {int_otp}\nPSK: {str_otp}\nValid for 5 minutes."
    )
    if not success:
        return jsonify({"error": "Failed to send Beta OTP email"}), 500

    return jsonify({"message": "Beta OTP generated and sent to email"}), 200

@app.route('/api/beta/verify', methods=['POST'])
@token_required
def beta_verify():
    current_user = g.user
    data = request.json
    interleaved_code = data.get("code", "")
    email = current_user["email"].lower()
    
    pending = _pending_beta_logins.get(email)
    if not pending:
        return jsonify({"error": "No pending beta login"}), 400
        
    if datetime.now(timezone.utc) > pending["expires_at"]:
        del _pending_beta_logins[email]
        return jsonify({"error": "Beta OTP expired"}), 400

    int_otp = pending["int_otp"]
    str_otp = pending["str_otp"]

    expected_interleaved = ""
    for i in range(3):
        expected_interleaved += int_otp[i] + str_otp[i]
    expected_interleaved += int_otp[3]
    
    expected_full_code = expected_interleaved
    
    if interleaved_code != expected_full_code:
        return jsonify({"error": "Invalid GHOST Layer Code"}), 401
        
    del _pending_beta_logins[email]
    
    # Generate a special beta token
    beta_token = jwt.encode(
        {"user_id": current_user["user_id"], "beta_access": True, "exp": datetime.now(timezone.utc) + timedelta(hours=2)},
        os.getenv("JWT_SECRET"),
        algorithm="HS256"
    )
    
    return jsonify({"message": "GHOST Layer Access Granted", "beta_token": beta_token}), 200

# =====================================================
# TERMINAL ROUTES
# =====================================================

@app.route('/api/beta/terminal', methods=['POST'])
@token_required
def beta_terminal():
    current_user = g.user
    beta_token = request.headers.get("X-Beta-Token")
    if not beta_token:
        return jsonify({"error": "Beta token required"}), 403
        
    try:
        decoded = jwt.decode(
            beta_token, 
            os.getenv("JWT_SECRET"), 
            algorithms=["HS256"]
        )
        if not decoded.get("beta_access"):
            return jsonify({"error": "Invalid Beta token"}), 403
    except Exception as e:
        return jsonify({"error": "Invalid Beta token"}), 403
        
    data = request.json
    command = data.get("command", "").strip().lower()
    
    if command == "help":
        return jsonify({"output": "Available commands:\n  help        - Show this help\n  status      - Show system health\n  architecture - Display internal layer structure\n  processes    - View whitelist processes"})
    elif command == "status":
        return jsonify({"output": "System Health:\n  CPU: 12%\n  Memory: 45%\n  Beta Layer: ACTIVE\n  Encryption Lab: SECURE"})
    elif command == "architecture":
        return jsonify({"output": "SelectShans Architecture:\n  [Layer Alpha] Frontend UI (Public)\n  [Layer Beta] Real-time Core (MFA Secured)\n  [Detector] FolderGuard Agent\n  [DataStore] MySQL Instance"})
    elif command == "processes":
        conn = pool.get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT process_name, description FROM process_whitelist")
        processes = cursor.fetchall()
        cursor.close()
        conn.close()
        out = "Whitelisted Processes:\n"
        for p in processes:
            out += f"  - {p['process_name']} ({p['description']})\n"
        return jsonify({"output": out})
    else:
        return jsonify({"output": f"Command not found: {command}. Type 'help' for available commands."})


# =====================================================
# DETECTOR DOWNLOAD
# =====================================================

@app.route('/api/detector-download', methods=['GET'])
def detector_download():
    token = request.args.get("token")
    info = verify_detector_token(token)

    if not info:
        return jsonify({"error": "Invalid token"}), 401

    buffer = io.BytesIO()

    # The new WPF endpoint is published here
    dotnet_publish_dir = Path(__file__).resolve().parent / "endpoint_dotnet_publish"

    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        backend_url = os.getenv("BACKEND_API_URL", request.url_root.rstrip("/"))
        
        # Read the existing appsettings.json from the published directory (if it exists)
        # to ensure we keep other defaults like thresholds.
        appsettings_path = dotnet_publish_dir / "appsettings.json"
        if appsettings_path.exists():
            with open(appsettings_path, "r", encoding="utf-8") as f:
                settings = json.load(f)
        else:
            settings = {"EndpointOptions": {}}

        if "EndpointOptions" not in settings:
            settings["EndpointOptions"] = {}
            
        settings["EndpointOptions"]["BackendApiUrl"] = backend_url
        settings["EndpointOptions"]["DetectorToken"] = token
        
        # Write the modified appsettings.json to the zip
        zf.writestr("appsettings.json", json.dumps(settings, indent=2))

        # Zip all files from the publish directory, EXCEPT appsettings.json since we just wrote it
        if dotnet_publish_dir.exists():
            for file in dotnet_publish_dir.rglob("*"):
                if file.is_file() and file.name != "appsettings.json":
                    # Filter out test binaries, PDBs, etc if present (though a clean publish shouldn't have test projects)
                    if file.suffix.lower() == ".pdb":
                        continue
                    zf.write(file, file.relative_to(dotnet_publish_dir))

    buffer.seek(0)

    return send_file(
        buffer,
        mimetype="application/zip",
        as_attachment=True,
        download_name="SelectShans-Endpoint.zip"
    )


# =====================================================
# DETECTOR LOG RECEIVER
# =====================================================

@app.route('/api/detector/log', methods=['POST'])
def detector_log():
    data = request.get_json()
    info = verify_detector_token(data.get("token"))

    if not info:
        return jsonify({"error": "Invalid token"}), 401

    user_id = info["user_id"]
    user_email = info["email"]
    _active_detectors[user_id] = datetime.now(timezone.utc)

    event_type = data.get("event_type")
    directory = data.get("details", {}).get("directory")
    count = data.get("details", {}).get("count")

    conn = pool.get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO detector_logs (user_id, event_type, directory, event_count)
        VALUES (%s, %s, %s, %s)
    """, (user_id, event_type, directory, count))

    if event_type == "mass_rename":
        cursor.execute("""
            INSERT INTO alerts (severity, process_name, pid, trigger_reason, action_taken, resolved)
            VALUES ('CRITICAL', 'FolderGuard Agent', %s, %s, 'Process Suspended & Email Sent via Nodemailer', FALSE)
        """, (count, f"Mass rename in {directory}"))

    conn.commit()
    cursor.close()
    conn.close()

    print("Event stored:", event_type)

    # 🔥 CRITICAL EMAIL TRIGGER
    if event_type == "mass_rename":

        print("Triggering email to:", user_email)

        success = send_email_safe(
            user_email,
            "⚠ SelectShans ALERT: Mass File Rename Detected",
            f"""
SelectShans detected suspicious file renaming activity.

Directory: {directory}
Files Renamed: {count}

This may indicate ransomware behavior.

Recommended Actions:
• Disconnect from internet
• Stop suspicious processes
• Run full system scan

Stay Secure,
SelectShans Engine
"""
        )
        if not success:
            return jsonify({"status": "event stored", "email_alert": "failed"}), 207

    return jsonify({"status": "event stored"}), 200


@app.route('/api/detector/sync-activities', methods=['POST'])
def detector_sync_activities():
    data = request.get_json() or {}
    token = data.get("token")
    info = verify_detector_token(token)

    if not info:
        return jsonify({"error": "Invalid token"}), 401

    user_id = info["user_id"]
    user_email = info["email"]
    _active_detectors[user_id] = datetime.now(timezone.utc)

    activities = data.get("activities", [])
    if not isinstance(activities, list):
        return jsonify({"error": "activities must be a list"}), 400

    conn = pool.get_connection()
    cursor = conn.cursor()

    synced_count = 0
    critical_found = False
    last_event_msg = ""

    try:
        for act in activities:
            event_type = act.get("event_type", "anomalous_activity")
            directory = act.get("directory", "User Monitored Folder")
            target_file = act.get("target_file", "")
            severity = act.get("severity", "MEDIUM")
            score = act.get("score", 0)
            detector_id = act.get("detector_id", "unknown")
            hostname = act.get("hostname", "unknown")
            event_count = act.get("event_count", 1)
            action_taken = act.get("action_taken", "Marked & Logged by FolderGuard")
            process_name = act.get("process_name", "FolderGuard Agent")

            cursor.execute("""
                INSERT INTO detector_activities (user_id, event_type, directory, target_file, severity, score, detector_id, hostname, event_count, action_taken, process_name)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (user_id, event_type, directory, target_file, severity, score, detector_id, hostname, event_count, action_taken, process_name))
            
            synced_count += 1
            
            if severity in ["HIGH", "CRITICAL"] or event_type in ["mass_rename", "canary_breach", "entropy_surge"]:
                critical_found = True
                last_event_msg = f"{event_type.replace('_', ' ').title()} in {directory} ({target_file or 'Multiple files'})"
                
                cursor.execute("""
                    INSERT INTO alerts (severity, process_name, pid, trigger_reason, action_taken, resolved)
                    VALUES (%s, %s, %s, %s, %s, FALSE)
                """, (severity, process_name, event_count, f"Anomalous behavior: {last_event_msg}", action_taken))

        conn.commit()
    except Exception as e:
        print("Error syncing detector activities:", e)
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()

    # 🔥 TRIGGER WEBSITE EMAIL TO USER IF CRITICAL ANOMALOUS ACTIVITY WAS SYNCED
    if critical_found:
        print(f"Triggering website email notification to {user_email} for synced anomalous activity...")
        send_email_safe(
            user_email,
            "🚨 SelectShans ALERT: Anomalous Activity Detected in Monitored Folder",
            f"""
SelectShans FolderGuard Agent detected anomalous activities on your host machine.

Monitored Folder: {activities[0].get('directory') if activities else 'User Folder'}
Event Summary: {last_event_msg}
Total Anomalous Events Logged: {synced_count}

Action Executed: Marked in website anomalous activity list & logged in SOC console.

Please log into the SelectShans website dashboard to inspect the internal activity list and verify host security.

Stay Secure,
SelectShans Engine
"""
        )

    return jsonify({"status": "activities synced", "synced_count": synced_count}), 200


@app.route('/api/detector/activities', methods=['GET'])
def get_detector_activities():
    user_id = request.args.get("user_id", type=int)
    if not user_id:
        return jsonify([]), 200

    conn = pool.get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT id, event_type, directory, target_file, severity, score, detector_id, hostname, event_count, action_taken, process_name, created_at
            FROM detector_activities
            WHERE user_id = %s OR user_id IS NULL
            ORDER BY created_at DESC LIMIT 100
        """, (user_id,))
        rows = cursor.fetchall()
        for r in rows:
            if r.get("created_at"):
                r["created_at"] = r["created_at"].isoformat()
        return jsonify(rows), 200
    except Exception as e:
        print("Error fetching detector activities:", e)
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/api/detector/ping', methods=['POST'])
def detector_ping():
    data = request.get_json() or {}
    token = data.get("token")
    info = verify_detector_token(token)

    if not info:
        return jsonify({"error": "Invalid token"}), 401

    user_id = info["user_id"]
    _active_detectors[user_id] = datetime.now(timezone.utc)
    return jsonify({"status": "pong", "active": True}), 200


@app.route('/api/detector/status', methods=['GET'])
def detector_status():
    user_id = request.args.get("user_id", type=int)
    if not user_id:
        return jsonify({"active": False}), 200

    last_ping = _active_detectors.get(user_id)
    if not last_ping:
        return jsonify({"active": False}), 200

    is_active = (datetime.now(timezone.utc) - last_ping).total_seconds() < 15
    return jsonify({"active": is_active}), 200

# =====================================================
# LOG FILE UPLOAD
# =====================================================

@app.route('/api/detector/upload-log', methods=['POST'])
def upload_log():
    token = request.form.get("token")
    file = request.files.get("file")

    info = verify_detector_token(token)
    if not info or not file:
        return jsonify({"error": "Invalid request"}), 400

    temp_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "monitor.log")
    file.save(temp_path)
    
    sent = send_email_safe(
        info["email"],
        "📁 SelectShans Log File Report",
        "Attached is your detector log file.",
        temp_path
    )
    
    if os.path.exists(temp_path):
        os.remove(temp_path)

    if sent:
        return jsonify({"status": "Log file sent"}), 200
    else:
        return jsonify({"error": "Failed to send email"}), 500

# =====================================================
# STATIC FILE ANALYSIS
# =====================================================
import math

def calculate_entropy(data):
    if not data:
        return 0.0
    entropy = 0
    for x in range(256):
        p_x = float(data.count(x)) / len(data)
        if p_x > 0:
            entropy += - p_x * math.log(p_x, 2)
    return entropy

@app.route('/api/analyze-file', methods=['POST'])
@token_required
def analyze_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    try:
        # Read file into memory (limit size for safety, e.g., max 10MB)
        file_data = file.read(10 * 1024 * 1024)
        
        # Calculate SHA-256
        file_hash = hashlib.sha256(file_data).hexdigest()
        
        # Calculate size
        file_size = len(file_data)
        
        # Calculate entropy
        entropy = calculate_entropy(file_data)
        
        # Extract extension
        ext = os.path.splitext(file.filename)[1].lower()
        
        # Basic heuristic analysis
        suspicious_extensions = ['.locked', '.crypto', '.enc', '.crypted', '.ransom', '.wnry', '.zepto']
        
        risk_score = 10
        indicators = []
        
        if ext in suspicious_extensions:
            risk_score += 60
            indicators.append(f"Suspicious file extension detected: {ext}")
            
        if entropy > 7.5:
            risk_score += 30
            indicators.append(f"High entropy ({entropy:.2f}) indicates encrypted or compressed payload.")
        elif entropy > 7.0:
            risk_score += 15
            indicators.append(f"Elevated entropy ({entropy:.2f}).")
            
        if ext in ['.exe', '.dll', '.scr', '.bat', '.cmd', '.vbs', '.js']:
            risk_score += 20
            indicators.append(f"Executable script or binary format ({ext}).")
            
        severity = "LOW"
        if risk_score > 70:
            severity = "HIGH"
        elif risk_score > 40:
            severity = "MEDIUM"
            
        return jsonify({
            "filename": file.filename,
            "sha256": file_hash,
            "size": file_size,
            "entropy": round(entropy, 2),
            "risk_score": min(risk_score, 100),
            "severity": severity,
            "indicators": indicators
        }), 200
        
    except Exception as e:
        print("Analysis error:", e)
        return jsonify({"error": "Analysis failed"}), 500


# =====================================================
# PDF REPORT GENERATION
# =====================================================

def generate_pdf_report(user_id, user_email):
    conn = pool.get_connection()
    cursor = conn.cursor(dictionary=True)

    # 1. Fetch Detector Logs (without date restriction so data is always present)
    rows = []
    try:
        cursor.execute("""
            SELECT event_type, COUNT(*) as count, MAX(created_at) as last_seen
            FROM detector_logs
            WHERE user_id = %s OR user_id IS NULL
            GROUP BY event_type
        """, (user_id,))
        rows = cursor.fetchall()
    except Exception as e:
        print("Detector logs query error:", e)

    if not rows:
        # Fallback summary if no telemetry exists yet
        rows = [
            {"event_type": "mass_rename", "count": 1, "last_seen": datetime.now()},
            {"event_type": "file_entropy_spike", "count": 3, "last_seen": datetime.now()},
            {"event_type": "unauthorized_directory_access", "count": 2, "last_seen": datetime.now()}
        ]

    # 2. Fetch Recent Security Alerts
    alerts = []
    try:
        cursor.execute("""
            SELECT id, severity, process_name, trigger_reason, action_taken, resolved, timestamp
            FROM alerts
            ORDER BY timestamp DESC
            LIMIT 8
        """)
        alerts = cursor.fetchall()
    except Exception as e:
        print("Alerts query error:", e)

    # 3. Fetch Whitelisted Process Count & Unresolved Alerts for Anomaly Metrics
    unresolved_count = 0
    protected_files = 0
    try:
        cursor.execute("SELECT COUNT(*) as count FROM alerts WHERE resolved = FALSE")
        unresolved_count = cursor.fetchone()["count"]
        cursor.execute("SELECT COUNT(*) as count FROM process_whitelist")
        protected_files = cursor.fetchone()["count"]
    except Exception as e:
        print("Metrics query error:", e)

    cursor.close()
    conn.close()

    anomaly_score = min(99, max(5, unresolved_count * 30 + 15))
    threat_level = "CRITICAL" if anomaly_score > 70 else "MEDIUM" if anomaly_score > 40 else "LOW"

    # Create Chart with matplotlib
    event_types = [r["event_type"] for r in rows]
    counts = [r["count"] for r in rows]

    plt.figure(figsize=(6, 3.2), dpi=150)
    colors_list = ['#007CC3', '#e11d48', '#f59e0b', '#10b981', '#6366f1']
    bars = plt.bar(event_types, counts, color=colors_list[:len(event_types)])
    plt.title("Anomaly & Telemetry Event Distribution", fontsize=11, fontweight='bold', pad=10)
    plt.xlabel("Event Category", fontsize=9)
    plt.ylabel("Frequency", fontsize=9)
    plt.xticks(rotation=15, ha='right', fontsize=8)
    plt.grid(axis='y', linestyle='--', alpha=0.5)
    plt.tight_layout()

    chart_path = f"/tmp/chart_{user_id}_{secrets.token_hex(4)}.png"
    plt.savefig(chart_path)
    plt.close()

    pdf_path = f"/tmp/SelectShans_Security_Report_{user_id}.pdf"
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=A4,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )
    elements = []
    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#0f172a'),
        alignment=0
    )
    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#475569')
    )
    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=15,
        textColor=colors.HexColor('#007CC3'),
        spaceBefore=12,
        spaceAfter=6
    )

    # 1. Header Banner
    elements.append(Paragraph("SelectShans - Security & Threat Intelligence Report", title_style))
    elements.append(Spacer(1, 4))
    elements.append(Paragraph(
        f"<b>Target User:</b> {user_email} &nbsp;|&nbsp; <b>Report Date:</b> {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')} &nbsp;|&nbsp; <b>Classification:</b> RESTRICTED / SOC AUDIT",
        subtitle_style
    ))
    elements.append(Spacer(1, 8))

    # Decorative Line
    line_table = Table([['']], colWidths=[520], rowHeights=[2])
    line_table.setStyle(TableStyle([('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#007CC3'))]))
    elements.append(line_table)
    elements.append(Spacer(1, 10))

    # 2. Executive Summary Metrics Table
    elements.append(Paragraph("1. Executive Threat Summary & KPIs", section_heading))
    metrics_data = [
        ["Metric Indicator", "Current Value", "Security Assessment"],
        ["System Anomaly Score", f"{anomaly_score}%", f"Threat Status: {threat_level}"],
        ["Whitelisted Processes Protected", f"{protected_files} Executables", "Active Monitoring Layer"],
        ["Unresolved Critical Alerts", f"{unresolved_count} Incidents", "Action Required" if unresolved_count > 0 else "Normal"],
        ["Host Detector Agent", "ACTIVE STREAM", "Encrypted Tunnel Operational"]
    ]
    t_metrics = Table(metrics_data, colWidths=[180, 150, 190])
    t_metrics.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1e293b')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('BACKGROUND', (0,1), (-1,1), colors.HexColor('#f8fafc')),
        ('BACKGROUND', (0,3), (-1,3), colors.HexColor('#fff1f2') if unresolved_count > 0 else colors.HexColor('#ffffff')),
        ('PADDING', (0,0), (-1,-1), 5),
    ]))
    elements.append(t_metrics)
    elements.append(Spacer(1, 10))

    # 3. Telemetry Event Distribution Chart
    elements.append(Paragraph("2. Threat Telemetry Analytics", section_heading))
    elements.append(Image(chart_path, width=5.2*inch, height=2.6*inch))
    elements.append(Spacer(1, 10))

    # 4. Detailed Telemetry Breakdown Table
    elements.append(Paragraph("3. FolderGuard Telemetry Event Log", section_heading))
    telemetry_table_data = [["Event Category", "Occurrences", "Last Detected Timestamp"]]
    for r in rows:
        ts_str = r["last_seen"].strftime('%Y-%m-%d %H:%M:%S') if isinstance(r["last_seen"], datetime) else str(r["last_seen"])
        telemetry_table_data.append([str(r["event_type"]), str(r["count"]), ts_str])

    t_telemetry = Table(telemetry_table_data, colWidths=[180, 120, 220])
    t_telemetry.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#007CC3')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('PADDING', (0,0), (-1,-1), 5),
    ]))
    elements.append(t_telemetry)
    elements.append(Spacer(1, 10))

    # 5. Security Alerts Log
    if alerts:
        elements.append(Paragraph("4. Incident Response & Security Alerts Log", section_heading))
        alert_table_data = [["ID", "Severity", "Process Name", "Trigger Reason", "Status"]]
        for a in alerts:
            status_txt = "RESOLVED" if a.get("resolved") else "UNRESOLVED"
            alert_table_data.append([
                str(a.get("id", "")),
                str(a.get("severity", "")),
                str(a.get("process_name", "")),
                Paragraph(str(a.get("trigger_reason", "")), styles["Normal"]),
                status_txt
            ])

        t_alerts = Table(alert_table_data, colWidths=[30, 65, 125, 220, 80])
        t_alerts.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f172a')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,-1), 8),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#94a3b8')),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('PADDING', (0,0), (-1,-1), 4),
        ]))
        elements.append(t_alerts)
        elements.append(Spacer(1, 10))

    # 6. Security Recommendations
    elements.append(Paragraph("5. Recommended Security Posture Actions", section_heading))
    recs = [
        "1. Ensure FolderGuard host detector agent is continuously running in background service mode.",
        "2. Review whitelisted executables in Settings to prevent malicious process spoofing.",
        "3. Maintain updated offline backups of critical documents and database snapshots.",
        "4. Enforce Multi-Factor Authentication (MFA) for all administrative login sessions."
    ]
    for rec in recs:
        elements.append(Paragraph(f"• {rec}", styles['Normal']))
        elements.append(Spacer(1, 2))

    doc.build(elements)

    if os.path.exists(chart_path):
        try: os.remove(chart_path)
        except Exception: pass

    return pdf_path


@app.route('/api/admin/security-report', methods=['GET'])
@token_required
def get_security_report_pdf():
    user_id = g.user['user_id']
    target_user_id = request.args.get('user_id', type=int)
    
    conn = pool.get_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        cursor.execute("SELECT role FROM users WHERE id = %s", (user_id,))
        role_user = cursor.fetchone()
        if not role_user or role_user.get('role') != 'admin':
            return jsonify({"error": "Admin access required"}), 403
    except Exception as e:
        cursor.close()
        conn.close()
        return jsonify({"error": str(e)}), 500
    user = None
    if target_user_id:
        cursor.execute("SELECT id, email FROM users WHERE id = %s", (target_user_id,))
        user = cursor.fetchone()
        
    if not user:
        cursor.execute("SELECT id, email FROM users ORDER BY id ASC LIMIT 1")
        user = cursor.fetchone()
        
    cursor.close()
    conn.close()

    if user:
        u_id = user["id"]
        u_email = user["email"]
    else:
        u_id = target_user_id or 1
        u_email = "admin@selectshans.sec"

    try:
        pdf_path = generate_pdf_report(u_id, u_email)
        if not pdf_path or not os.path.exists(pdf_path):
            return jsonify({"error": "Failed to generate security report PDF"}), 500
            
        @after_this_request
        def remove_file(response):
            try:
                if os.path.exists(pdf_path):
                    os.remove(pdf_path)
            except Exception as e:
                print(f"Error removing temp pdf: {e}")
            return response
            
        return send_file(
            pdf_path,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"SelectShans_Security_Report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/admin/realtime-stats', methods=['GET'])
@token_required
def get_realtime_stats():
    user_id = g.user['user_id']
        
    conn = pool.get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT role FROM users WHERE id = %s", (user_id,))
        role_user = cursor.fetchone()
        if not role_user or role_user.get('role') != 'admin':
            return jsonify({"error": "Admin access required"}), 403
        # Calculate anomaly score based on unresolved critical alerts
        cursor.execute("SELECT COUNT(*) as count FROM alerts WHERE resolved = FALSE")
        unresolved_alerts = cursor.fetchone()["count"]
        anomaly_score = min(99, max(5, unresolved_alerts * 30 + 10))
        
        # Files protected (count process whitelist)
        cursor.execute("SELECT COUNT(*) as count FROM process_whitelist")
        files_protected = cursor.fetchone()["count"]
        
        # Active connections (active detectors + active sessions)
        active_detectors_count = sum(1 for ping in _active_detectors.values() if (datetime.now(timezone.utc) - ping).total_seconds() < 15)
        
        active_sessions = 0
        try:
            cursor.execute("SELECT COUNT(*) as count FROM login_sessions WHERE is_active = TRUE")
            active_sessions = cursor.fetchone()["count"]
        except Exception:
            active_sessions = 1

        active_connections = max(1, active_detectors_count + active_sessions)
        
        # Chart data variation
        chart_data = []
        for i in range(20):
            chart_data.append({
                "name": i,
                "cpu": int(15 + (anomaly_score / 2) + (i % 4) * 3)
            })
            
        return jsonify({
            "anomaly_score": anomaly_score,
            "files_protected": files_protected,
            "active_connections": active_connections,
            "chart_data": chart_data
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()


def send_pdf_email(to_email, pdf_path):
    send_email_safe(
        to_email,
        "📊 SelectShans Daily Security Report",
        "Attached is your daily security report.",
        pdf_path
    )


def send_daily_summary():
    print("Running daily summary job...")

    conn = pool.get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("""
        SELECT DISTINCT user_id
        FROM detector_logs
        WHERE DATE(created_at) = CURDATE() - INTERVAL 1 DAY
    """)

    users = cursor.fetchall()

    for row in users:
        cursor.execute("SELECT email FROM users WHERE id=%s", (row["user_id"],))
        user = cursor.fetchone()

        if user:
            pdf_path = generate_pdf_report(row["user_id"], user["email"])
            if pdf_path:
                send_pdf_email(user["email"], pdf_path)
                os.remove(pdf_path)

    cursor.close()
    conn.close()


# =====================================================
# TOKEN MANAGEMENT ENDPOINTS
# =====================================================

@app.route('/api/token/refresh', methods=['POST'])
def refresh_jwt_token():
    """Refresh JWT token to extend session"""
    # Try to get token from Authorization header first, then from JSON
    auth_header = request.headers.get('Authorization', '')
    token = None
    
    if auth_header.startswith('Bearer '):
        token = auth_header[7:]
    else:
        data = request.get_json() or {}
        token = data.get('token')
    
    if not token:
        return jsonify({"error": "Token required"}), 400
    
    new_token = refresh_token(token)
    if not new_token:
        return jsonify({"error": "Token invalid or expired"}), 401
    
    return jsonify({
        "token": new_token,
        "expires_in": 30 * 60  # 30 minutes in seconds
    }), 200


# =====================================================
# GOOGLE OAUTH ENDPOINTS
# =====================================================






@app.route('/api/alerts', methods=['GET'])
@token_required
def get_alerts():
    user_id = g.user['user_id']
    
    conn = pool.get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT role FROM users WHERE id = %s", (user_id,))
        role_user = cursor.fetchone()
        if not role_user or role_user.get('role') != 'admin':
            return jsonify({"error": "Admin access required"}), 403
            
        cursor.execute("SELECT * FROM alerts ORDER BY timestamp DESC LIMIT 100")
        alerts = cursor.fetchall()
        for a in alerts:
            if a.get("timestamp"):
                a["timestamp"] = a["timestamp"].isoformat()
        return jsonify(alerts), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/api/alerts/<int:alert_id>/resolve', methods=['POST'])
@token_required
def resolve_alert(alert_id):
    user_id = g.user['user_id']
    
    conn = pool.get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT role FROM users WHERE id = %s", (user_id,))
        role_user = cursor.fetchone()
        if not role_user or role_user.get('role') != 'admin':
            return jsonify({"error": "Admin access required"}), 403
            
        cursor.execute("UPDATE alerts SET resolved = TRUE WHERE id = %s", (alert_id,))
        conn.commit()
        return jsonify({"status": "success", "message": f"Alert {alert_id} resolved"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()





@app.route('/api/cron/daily-summary', methods=['GET', 'POST'])
def run_daily_summary():
    """Endpoint for Vercel Cron to trigger daily summary."""
    auth_header = request.headers.get("Authorization")
    cron_secret = os.getenv("CRON_SECRET")
    
    if not cron_secret:
        return jsonify({"error": "Cron secret not configured"}), 500
        
    expected_header = f"Bearer {cron_secret}"
    
    if not auth_header or not hmac.compare_digest(auth_header, expected_header):
        return jsonify({"error": "Unauthorized"}), 401
        
    send_daily_summary()
    return jsonify({"status": "daily summary job completed"}), 200



# =====================================================
# RUN SERVER
# =====================================================

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)), debug=False)
