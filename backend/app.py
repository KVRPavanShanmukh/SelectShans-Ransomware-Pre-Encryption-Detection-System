import os
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
from apscheduler.schedulers.background import BackgroundScheduler

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from mysql.connector import pooling
from werkzeug.security import generate_password_hash, check_password_hash

# JWT and utilities
from jwt_utils import create_token, verify_token, refresh_token, token_required
from admin_routes import register_admin_routes

# PDF + Graph
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
import matplotlib.pyplot as plt


# =====================================================
# INITIAL SETUP
# =====================================================

load_dotenv()

app = Flask(__name__)
CORS(app)

print("Starting SentinelStream Backend...")


# =====================================================
# DATABASE CONFIG
# =====================================================

dbconf = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", 3306)),
    "user": os.getenv("DB_USER", "root"),
    "password": "shanmukh@2006",
    "database": "RANSOMWARE"
}

pool = pooling.MySQLConnectionPool(
    pool_name="mypool",
    pool_size=5,
    **dbconf
)

print("MySQL pool ready.")

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


def send_email_safe(to_email, subject, body):
    try:
        # 🔥 Gmail SMTP Configuration
        host = "smtp.gmail.com"
        port = 587
        user = "YOUR MAIL TO SEND MAILS"
        password = "YOUR APP PASSWORD"

        msg = MIMEMultipart()
        msg["From"] = user
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        print("Connecting to SMTP...")
        server = smtplib.SMTP(host, port)
        server.starttls()
        server.login(user, password)

        print("Sending email to:", to_email)
        server.sendmail(user, to_email, msg.as_string())
        server.quit()

        print("Email sent successfully!")
        return True

    except Exception as e:
        print("EMAIL ERROR:", str(e))
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
    cursor = conn.cursor(dictionary=True, buffered=True)

    cursor.execute("SELECT id FROM users WHERE username=%s", (data["username"],))
    if cursor.fetchone():
        return jsonify({"error": "Username taken"}), 409

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
    cursor.close()
    conn.close()

    return jsonify({"message": "User created"}), 201


@app.route('/api/login', methods=['POST'])
def login():
    data = request.json

    conn = pool.get_connection()
    cursor = conn.cursor(dictionary=True, buffered=True)

    cursor.execute(
        "SELECT * FROM users WHERE username=%s OR email=%s",
        (data.get("username"), data.get("username"))
    )

    user = cursor.fetchone()
    cursor.close()
    conn.close()

    if not user or not check_password_hash(user["password_hash"], data.get("password")):
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
        "SentinelStream Login",
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

    conn = pool.get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO login_sessions (user_id, login_time, is_active)
        VALUES (%s, NOW(), TRUE)
    """, (pending["user_id"],))
    conn.commit()
    cursor.close()
    conn.close()

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
        download_name="SentinelStream-FolderGuard.zip"
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

    conn.commit()
    cursor.close()
    conn.close()

    print("Event stored:", event_type)

    # 🔥 CRITICAL EMAIL TRIGGER
    if event_type == "mass_rename":

        print("Triggering email to:", user_email)

        send_email_safe(
            user_email,
            "⚠ SentinelStream ALERT: Mass File Rename Detected",
            f"""
SentinelStream detected suspicious file renaming activity.

Directory: {directory}
Files Renamed: {count}

This may indicate ransomware behavior.

Recommended Actions:
• Disconnect from internet
• Stop suspicious processes
• Run full system scan

Stay Secure,
SentinelStream Engine
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

    msg = MIMEMultipart()
    msg["From"] = os.getenv("MAIL_USER")
    msg["To"] = info["email"]
    msg["Subject"] = "📁 SentinelStream Log File Report"

    msg.attach(MIMEText("Attached is your detector log file.", "plain"))

    part = MIMEBase("application", "octet-stream")
    part.set_payload(file.read())
    encoders.encode_base64(part)
    part.add_header("Content-Disposition", "attachment; filename=monitor.log")
    msg.attach(part)

    server = smtplib.SMTP("smtp.gmail.com", 587)
    server.starttls()
    server.login("yourgmail@gmail.com", "your_app_password_here")
    
    server.sendmail(os.getenv("MAIL_USER"), info["email"], msg.as_string())
    server.quit()

    return jsonify({"status": "Log file sent"}), 200


# =====================================================
# PDF REPORT GENERATION
# =====================================================

def generate_pdf_report(user_id, user_email):
    conn = pool.get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("""
        SELECT event_type, COUNT(*) as count
        FROM detector_logs
        WHERE user_id = %s
        AND DATE(created_at) = CURDATE() - INTERVAL 1 DAY
        GROUP BY event_type
    """, (user_id,))

    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    if not rows:
        return None

    event_types = [r["event_type"] for r in rows]
    counts = [r["count"] for r in rows]

    plt.figure()
    plt.bar(event_types, counts)
    plt.title("Event Distribution")
    plt.xlabel("Event Type")
    plt.ylabel("Count")

    chart_path = f"chart_{user_id}.png"
    plt.savefig(chart_path)
    plt.close()

    pdf_path = f"Security_Report_{user_id}.pdf"
    doc = SimpleDocTemplate(pdf_path, pagesize=A4)
    elements = []
    styles = getSampleStyleSheet()

    elements.append(Paragraph("SentinelStream Daily Security Report", styles["Heading1"]))
    elements.append(Spacer(1, 12))
    elements.append(Paragraph(f"User: {user_email}", styles["Normal"]))
    elements.append(Spacer(1, 12))

    table_data = [["Event Type", "Count"]]
    for r in rows:
        table_data.append([r["event_type"], r["count"]])

    table = Table(table_data)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.grey),
        ("GRID", (0,0), (-1,-1), 1, colors.black)
    ]))

    elements.append(table)
    elements.append(Spacer(1, 20))
    elements.append(Image(chart_path, width=4*inch, height=3*inch))

    doc.build(elements)

    os.remove(chart_path)
    return pdf_path


def send_pdf_email(to_email, pdf_path):
    msg = MIMEMultipart()
    msg["From"] = os.getenv("MAIL_USER")
    msg["To"] = to_email
    msg["Subject"] = "📊 SentinelStream Daily Security Report"

    msg.attach(MIMEText("Attached is your daily security report.", "plain"))

    with open(pdf_path, "rb") as f:
        part = MIMEBase("application", "octet-stream")
        part.set_payload(f.read())

    encoders.encode_base64(part)
    part.add_header("Content-Disposition",
                    f"attachment; filename={os.path.basename(pdf_path)}")

    msg.attach(part)

    server = smtplib.SMTP("smtp.gmail.com", 587)
    server.starttls()
    server.login("yourgmail@gmail.com", "your_app_password_here")

    server.sendmail(os.getenv("MAIL_USER"), to_email, msg.as_string())
    server.quit()


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
        from google.auth.transport import requests
        from google.oauth2 import id_token
        
        GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID', '')
        if not GOOGLE_CLIENT_ID:
            return jsonify({"error": "Google OAuth not configured"}), 500
        
        idinfo = id_token.verify_oauth2_token(google_token, requests.Request(), GOOGLE_CLIENT_ID)
        
        if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
            raise ValueError('Wrong issuer.')
        
        google_id = idinfo['sub']
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
# SCHEDULER
# =====================================================

scheduler = BackgroundScheduler()
scheduler.add_job(send_daily_summary, 'cron', hour=9)
scheduler.start()


# =====================================================
# RUN SERVER
# =====================================================

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
