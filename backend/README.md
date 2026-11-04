# 🛡️ SelectShans – Ransomware Pre-Encryption Detection System
## Backend Architecture & Technical Guide

SelectShans is a full-stack cybersecurity defense system designed to detect and intercept ransomware attacks before catastrophic mass-encryption occurs. It combines real-time filesystem heuristics (Shannon entropy scoring, rapid write/modification thresholds, honeypot baiting), an automated endpoint detector package, and a centralized Security Operations Center (SOC) dashboard.

---

## 📌 Architecture Overview

```
                                +-----------------------------+
                                |  React 19 + Vite Dashboard  |
                                |  (Threat Console & SOC UI)  |
                                +--------------+--------------+
                                               |
                                     REST APIs / JWT Bearer
                                               |
                                               v
+-------------------------------+       +-----------------------------+
|    SelectShans FolderGuard    | ----> |     Flask Backend Server    |
|  (Endpoint Python Watchdog)   | HTTP  |   (app.py / admin_routes)   |
+-------------------------------+ Logs  +--------------+--------------+
                                                       |
                                               MySQL Connector
                                                       v
                                        +-----------------------------+
                                        |    MySQL 8.0+ Database      |
                                        |  (users, alerts, events)    |
                                        +-----------------------------+
```

### 1. Technology Stack
- **Backend Framework:** Python 3.10+ / Flask 3.0+
- **Authentication:** PyJWT (HS256) with role-based access control (`admin`, `user`) and two-step OTP verification.
- **Reporting Engine:** ReportLab 4.0+ for high-fidelity PDF security audit generation.
- **Telemetry Visualizations:** Matplotlib with headless Agg rendering.
- **Database:** MySQL 8.0+ via `mysql-connector-python` with connection pooling.
- **Endpoint Agent:** Python Watchdog filesystem monitor with Shannon entropy calculation (`math.log2`).
- **Frontend:** React 19, Vite, Recharts, Lucide Icons.

---

## 📂 Backend File Structure

```
backend/
├── app.py                  # Core Flask server, routing, database pool, and PDF generator
├── admin_routes.py         # Admin management, audit logging, and profile endpoints
├── jwt_utils.py            # Token generation, decoding, expiry handling, and @token_required decorator
├── schema.sql              # Clean MySQL schema with tables, indices, and foreign keys
├── update_db.py            # Backward-compatible idempotent migration script
├── fix_env.py              # Environment configuration repair utility
├── requirements.txt        # Verified Python dependencies (Flask, PyJWT, ReportLab, psutil, etc.)
├── .env.example            # Environment configuration template
└── detector_package/       # Distributable endpoint agent bundled dynamically into ZIP
    ├── detector.py         # Watchdog agent with entropy analysis and telemetry sync
    ├── config.json         # Agent configuration template
    ├── requirements.txt    # Agent dependencies (watchdog, requests, psutil)
    └── run.bat             # Windows 1-click startup batch script
```

---

## 🚀 Setup & Execution Guide (Windows 10/11)

### Prerequisites
1. **Python 3.10+** (Ensure `python` and `pip` are in your PATH)
2. **MySQL Server 8.0+** (Running locally on port 3306 or remote)
3. **Node.js 18+ & npm** (For the React frontend)

### 1. Configure Database
In MySQL Workbench or the MySQL command line client:
```sql
CREATE DATABASE IF NOT EXISTS selectshans_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Run schema initialization:
```powershell
# Navigate to backend directory
cd backend

# Execute schema on MySQL
mysql -u root -p selectshans_db < schema.sql
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```powershell
Copy-Item .env.example .env
```
Ensure DB credentials and secrets are configured:
```ini
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=selectshans_db
PORT=5000
JWT_SECRET_KEY=change-to-a-secure-random-secret-key-in-production
FLASK_ENV=development
```

### 3. Install Python Dependencies
```powershell
pip install -r requirements.txt
```

### 4. Run Idempotent Schema Migrations (Optional)
```powershell
python update_db.py
```

### 5. Launch the Backend Server
```powershell
python app.py
```
The server will start on `http://127.0.0.1:5000`.

---

## 🔑 Key API Endpoints

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| `GET` | `/api/health` | No | System health check and database connectivity verification |
| `POST` | `/api/login` | No | Step 1 authentication (Username/password verification, OTP dispatch) |
| `POST` | `/api/login/verify` | No | Step 2 OTP verification (Issues JWT token with role) |
| `POST` | `/api/signup` | No | New user registration |
| `GET` | `/api/admin/realtime-stats` | Yes (Bearer) | Real-time security telemetry, CPU charts, anomaly metrics |
| `GET` | `/api/admin/security-report` | Yes (Bearer) | Generates and downloads real-time PDF security report |
| `GET` | `/api/alerts` | Yes (Bearer) | Retrieves SOAR incident alerts |
| `POST` | `/api/alerts/<id>/resolve` | Yes (Bearer) | Marks a threat incident as resolved |
| `GET` | `/api/detector-download` | Token Query | Packages and downloads the `SelectShans-FolderGuard.zip` agent |
| `POST` | `/api/detector/sync-activities`| PSK Header | Endpoint agent telemetry and threat ingestion |
| `GET` | `/api/detector/activities` | No / Bearer | Live activity feed for monitored host directory |
| `GET` | `/api/admin/audit-log` | Yes (Admin) | Exports SOC audit log in PDF, TXT, or JSON format |
| `POST` | `/api/admin/clear-data` | Yes (Admin) | Purges event logs and alert history |
| `POST` | `/api/token/refresh` | Yes (Bearer) | Refreshes JWT token before expiry |

---

## 🛡️ Endpoint FolderGuard Agent

When an authenticated user clicks **"Download Detector"** on the dashboard:
1. Backend generates a customized ZIP containing `detector.py`, `run.bat`, `requirements.txt`, and a dynamic `config.json` with the user's ID, detector token, and backend URL.
2. The user extracts the ZIP on their Windows machine and double-clicks `run.bat`.
3. The agent monitors the chosen folder, calculates file entropy in real-time before encryption finishes, and automatically transmits telemetry and alert signals back to the SOC backend.
