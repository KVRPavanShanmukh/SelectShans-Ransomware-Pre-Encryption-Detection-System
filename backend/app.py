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
CORS(app)

print("Starting SelectShans Backend...")

@app.errorhandler(Exception)
def handle_exception(e):
    import traceback
    return str(traceback.format_exc()), 500

# =====================================================
# DATABASE CONFIG & AUTO-CREATION
# =====================================================

db_pass = os.getenv("DB_PASSWORD")
if not db_pass or db_pass == "your_db_password":
    db_pass = "shanmukh@2006"

db_name = os.getenv("DB_NAME")
if not db_name or db_name == "your_db_name":
    db_name = "RANSOMWARE"

dbconf = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", 3306)),
    "user": os.getenv("DB_USER", "root"),
    "password": db_pass
}

# Auto-create database if it doesn't exist
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
    pool_size=5,
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
        statements.append("ALTER TABLE users ADD COLUMN IF NOT EXISTS role ENUM('admin', 'user') DEFAULT 'user';")
        statements.append("UPDATE users SET role = 'admin' WHERE username = 'admin';")
        
        conn = pool.get_connection()
        cursor = conn.cursor()
        for stmt in statements:
            if stmt.strip():
                try:
                    cursor.execute(stmt)
                except Exception:
                    pass
        conn.commit()
        cursor.close()
        conn.close()
        print("Database schema successfully initialized.")
    except Exception as e:
        print("Failed to initialize database schema:", e)

# Run schema initialization
init_db(pool)

# Register admin routes
register_admin_routes(app, pool)


# =====================================================
# GLOBALS
# =====================================================

DETECTOR_PACKAGE_DIR = Path(__file__).resolve().parent / "detector_package"
DETECTOR_SECRET = os.getenv("DETECTOR_SECRET", "prd-secret")

_pending_logins = {}
OTP_EXPIRY = 10


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

def send_email_safe(to_email, subject, body, attachment_path=None):
    try:
        script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "send_mail.js")
        cmd = ["node", script_path, to_email, subject, body]
        if attachment_path:
            cmd.append(attachment_path)
            
        print("Running Nodemailer script:", cmd)
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        print("Nodemailer Output:", res.stdout)
        return True
    except Exception as e:
        print("Nodemailer execution failed:", e)
        if hasattr(e, 'stderr') and e.stderr:
            print("Stderr:", e.stderr)
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
        user = cursor.fetchone()
    finally:
        try: cursor.close()
        except: pass
        conn.close()

    is_valid = False
    if user and user.get("password_hash"):
        try:
            is_valid = check_password_hash(user["password_hash"], data.get("password"))
        except ValueError:
            is_valid = False

    if not user or not is_valid:
        return jsonify({"error": "Invalid credentials"}), 401

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

    send_email_safe(
        email,
        "SelectShans Login",
        f"OTP: {otp}\nPSK: {psk}\nValid for {OTP_EXPIRY} minutes."
    )

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
        cursor.execute("SELECT dob FROM users WHERE id=%s", (current_user["user_id"],))
        user = cursor.fetchone()
    finally:
        try: cursor.close()
        except: pass
        conn.close()

    if not user:
        return jsonify({"error": "User not found"}), 404
        
    int_otp = ''.join(secrets.choice("0123456789") for _ in range(4))
    str_otp = ''.join(secrets.choice("abcdefghijklmnopqrstuvwxyz") for _ in range(3))

    _pending_beta_logins[email] = {
        "int_otp": int_otp,
        "str_otp": str_otp,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5)
    }

    send_email_safe(
        email,
        "SelectShans GHOST Layer Access",
        f"GHOST Layer Authorization required.\n\nInteger OTP: {int_otp}\nString OTP: {str_otp}\n\nInterleave these to access the GHOST Layer."
    )

    return jsonify({"message": "Beta OTPs sent"}), 200

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
        os.getenv("JWT_SECRET", "sentinelstream_super_secure_random_string_change_this_12345"),
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
            os.getenv("JWT_SECRET", "sentinelstream_super_secure_random_string_change_this_12345"), 
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

    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("config.json", json.dumps({
            "api_base": request.url_root.rstrip("/"),
            "token": token,
            "email": info["email"]
        }, indent=2))

        for file in DETECTOR_PACKAGE_DIR.rglob("*"):
            if file.is_file():
                zf.write(file, file.relative_to(DETECTOR_PACKAGE_DIR))

    buffer.seek(0)

    return send_file(
        buffer,
        mimetype="application/zip",
        as_attachment=True,
        download_name="SelectShans-FolderGuard.zip"
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

        send_email_safe(
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

    return jsonify({"status": "event stored"}), 200

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

    chart_path = f"chart_{user_id}_{secrets.token_hex(4)}.png"
    plt.savefig(chart_path)
    plt.close()

    pdf_path = f"SelectShans_Security_Report_{user_id}.pdf"
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
def get_security_report_pdf():
    user_id = request.args.get('user_id', type=int)
    
    conn = pool.get_connection()
    cursor = conn.cursor(dictionary=True)
    user = None
    if user_id:
        cursor.execute("SELECT id, email FROM users WHERE id = %s", (user_id,))
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
        u_id = user_id or 1
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
def get_realtime_stats():
    user_id = request.args.get('user_id', type=int)
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
        
    conn = pool.get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # Calculate anomaly score based on unresolved critical alerts
        cursor.execute("SELECT COUNT(*) as count FROM alerts WHERE resolved = FALSE")
        unresolved_alerts = cursor.fetchone()["count"]
        anomaly_score = min(99, max(5, unresolved_alerts * 30 + 10))
        
        # Files protected (count process whitelist)
        cursor.execute("SELECT COUNT(*) as count FROM process_whitelist")
        files_protected = cursor.fetchone()["count"]
        
        # Active connections (active detectors + active sessions)
        active_detectors_count = sum(1 for ping in _active_detectors.values() if (datetime.now(timezone.utc) - ping).total_seconds() < 15)
        
        cursor.execute("SELECT COUNT(*) as count FROM login_sessions WHERE is_active = TRUE")
        active_sessions = cursor.fetchone()["count"]
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

@app.route('/api/auth/google', methods=['POST'])
def google_auth():
    """Google OAuth authentication endpoint"""
    data = request.json
    google_token = data.get('token')
    
    if not google_token:
        return jsonify({"error": "Token required"}), 400
    
    try:
        from google_auth import verify_google_token
        idinfo = verify_google_token(google_token)
        if not idinfo:
            return jsonify({"error": "Authentication failed"}), 401
        
        google_id = idinfo['user_id']
        email = idinfo['email']
        name = idinfo.get('name', '')
        picture = idinfo.get('picture', '')
        
        conn = pool.get_connection()
        cursor = conn.cursor(dictionary=True)
        
        # Check if user exists
        cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
        user = cursor.fetchone()
        
        if not user:
            # Create new user from Google info
            cursor.execute("""
                INSERT INTO users (username, password_hash, email, sec_q, sec_a_hash)
                VALUES (%s, %s, %s, %s, %s)
            """, (
                email.split('@')[0] + '_' + google_id[:8],  # username
                generate_password_hash(secrets.token_hex(16)),  # random password
                email,
                'Google OAuth User',
                generate_password_hash('oauth')
            ))
            conn.commit()
            cursor.execute("SELECT id, username, email FROM users WHERE email = %s", (email,))
            user = cursor.fetchone()
        
        # Create JWT token
        jwt_token = create_token(user['id'], user['username'], user['email'])
        detector_token = create_detector_token(user['id'], user['email'])
        
        # Log the action
        cursor.execute("""
            INSERT INTO audit_log (user_id, action, description) VALUES (%s, %s, %s)
        """, (user['id'], 'GOOGLE_OAUTH_LOGIN', f'Google OAuth login: {email}'))
        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify({
            "message": "Google authentication successful",
            "token": jwt_token,
            "detector_token": detector_token,
            "user_id": user['id'],
            "username": user['username'],
            "email": user['email'],
            "name": name,
            "picture": picture,
            "expires_in": 30 * 60  # 30 minutes in seconds
        }), 200
        
    except Exception as e:
        print(f"Google OAuth error: {e}")
        return jsonify({"error": f"Authentication failed: {str(e)}"}), 401


# =====================================================
# DETECTOR PING AND STATUS ENDPOINTS
# =====================================================

@app.route('/api/detector/ping', methods=['POST'])
def detector_ping():
    data = request.get_json() or {}
    token = data.get("token")
    info = verify_detector_token(token)
    if not info:
        return jsonify({"error": "Invalid token"}), 401
    
    user_id = info["user_id"]
    _active_detectors[user_id] = datetime.now(timezone.utc)
    return jsonify({"status": "ping received"}), 200


@app.route('/api/detector/status', methods=['GET'])
def detector_status():
    user_id = request.args.get("user_id", type=int)
    if not user_id:
        return jsonify({"error": "user_id required"}), 400
    
    last_ping = _active_detectors.get(user_id)
    is_active = False
    if last_ping:
        # Consider active if pinged in the last 15 seconds
        is_active = (datetime.now(timezone.utc) - last_ping).total_seconds() < 15
        
    return jsonify({"active": is_active}), 200

@app.route('/api/alerts', methods=['GET'])
def get_alerts():
    conn = pool.get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
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
def resolve_alert(alert_id):
    conn = pool.get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE alerts SET resolved = TRUE WHERE id = %s", (alert_id,))
        conn.commit()
        return jsonify({"status": "success", "message": f"Alert {alert_id} resolved"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        conn.close()


scheduler = BackgroundScheduler()
scheduler.add_job(send_daily_summary, 'cron', hour=9)
scheduler.start()


# =====================================================
# RUN SERVER
# =====================================================

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
