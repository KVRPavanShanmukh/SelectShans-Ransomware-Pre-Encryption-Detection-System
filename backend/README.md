# 🛡️ SelectShans – Ransomware Pre-Encryption Detection System
## Backend Architecture & Technical Guide (Phase 2)

SelectShans is a full-stack cybersecurity defense system designed to detect and alert on anomalous ransomware-like behavior early before widespread mass encryption occurs. It combines real-time filesystem heuristics (Shannon entropy scoring, rapid write/modification thresholds, mass renames, honeypot baiting), an automated endpoint detector package, and a centralized Security Operations Center (SOC) dashboard.

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
|   (Modular Behavioral Agent)  | HTTP  |   (app.py / admin_routes)   |
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
- **Endpoint Agent:** Modular Python FolderGuard agent (`watchdog`, `psutil`, `requests`).
- **Frontend:** React 19, Vite, Recharts, Lucide Icons.

---

## 📂 Project Structure & Authoritative Agent Decision

### Architectural Decision: Authoritative Detection Engine
The project previously contained three separate, disparate detection concepts:
1. `backend/detector_package/` (Python Watchdog downloadable agent)
2. `backend/endpoint_guard/` (Separate Python service with hardcoded ProgramData permissions)
3. `backend/endpoint_dotnet/` (.NET 8 solution requiring external runtime)

**Decision:** The **Python FolderGuard agent in `backend/detector_package/`** is established as the **sole authoritative production endpoint agent**. It is the exact package downloaded dynamically by users from the dashboard, runs cross-platform without requiring external runtimes, and communicates natively with the Flask backend via verified token authentication. The best modular capabilities from `endpoint_guard` and `endpoint_dotnet` (entropy analysis, sliding-window aggregation, canary decoys, process attribution, risk scoring) were consolidated directly into `detector_package/`.

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
├── tests/                  # Complete automated test suite (57 unit, integration, and perf tests)
└── detector_package/       # Authoritative endpoint agent bundled dynamically into ZIP
    ├── detector.py         # Main orchestrator, Watchdog handler, and clean shutdown
    ├── engine.py           # Behavioral sliding-window aggregation engine
    ├── entropy.py          # Shannon entropy & delta analyzer on bounded byte samples
    ├── extensions.py       # Suspicious ransomware extension and double-extension detector
    ├── canary.py           # Safe, unique decoy canary manager with safe Windows execution
    ├── process.py          # Non-blocking best-effort process attributor with LRU caching
    ├── risk.py             # Explainable 0-100 weighted risk scoring model
    ├── telemetry.py        # Resilient bounded telemetry queue with exponential backoff
    ├── config.json         # Agent configuration template with safe defaults
    ├── requirements.txt    # Agent dependencies (watchdog, requests, psutil)
    └── run.bat             # Windows 1-click startup batch script
```

---

## 🎯 Behavioral Detection Pipeline & Signals

The detection engine evaluates multi-signal combinations rather than relying on simplistic isolated rules:

| Signal | Evaluation Logic | Weight / Severity |
|---|---|:---:|
| **Canary Decoy Breach** | Decoy files (`.selectshans_canary_*`) placed in monitored folders. Modification, rename, or deletion indicates early alphabetical traversal. | **CRITICAL (95/100)** |
| **Ransomware Extensions** | Matches known ransomware extensions (`.locked`, `.crypto`, `.enc`, etc.) or double extension tricks (`.docx.locked`). | **CRITICAL (85/100)** |
| **Shannon Entropy Surge** | Computes Shannon entropy on bounded samples. Measures delta against pre-modification baselines. Flags deltas $\ge 1.8$ reaching $\ge 7.2$ on plain formats while ignoring pre-compressed media (`.zip`, `.jpg`). | **HIGH (+35 pts)** |
| **Mass File Renames** | Tracks sliding window of renames (default: 5 in 10s). Detects rapid rename bursts. | **MEDIUM to HIGH (55-75 pts)** |
| **Rapid File Modifications** | Tracks sliding window of modifications (default: 10 in 10s). | **MEDIUM (50 pts)** |
| **Multi-Signal Correlation** | Concurrent renames + entropy surges escalate risk to immediate quarantine recommendation. | **CRITICAL (80-100 pts)** |

### Explainable Risk Model Output
Every detection produces human-readable justification for SOC analysts:
```
[CRITICAL - 95/100] Canary Decoy File Breach: Decoy canary file '.selectshans_canary_01_backup.docx' was modified.
Reasons:
• Decoy canary file modified during traversal.
• Canary is sequentially named to bait early alphabetical ransomware traversal.
• Process attribution: PID 4512 (evil_sim.exe) [Confidence: confirmed].
Recommended Action: Isolate host machine from network immediately. Review active processes.
```

---

## ⚠️ Critical Technical Honesty: Early Detection vs. Pre-Write Interception

**Important Disclosure:**
This project uses **user-mode filesystem notifications via Python Watchdog**. User-mode watchers receive notifications **after** filesystem operations occur in the operating system cache or disk.

1. **What SelectShans Provides:**
   - **Early Behavioral Anomaly Detection & Warning:** Flags ransomware behavior at the start of an attack (first 3-5 files or canary trap) before widespread encryption of thousands of files occurs.
   - **Multi-Signal Correlation:** Identifies entropy surges, mass renames, and bait file tampering with low false positives.
   - **Real-Time SOC Alerting & Recommended Response:** Dispatches alerts to the web console and email.

2. **What User-Mode Watchdog Cannot Claim:**
   - It **does not** perform kernel-level pre-write I/O blocking. True zero-file pre-write interception requires a certified Windows Minifilter Driver (`FLTMGR.SYS`) executing at kernel altitude.
   - It **does not** implement destructive containment (automatic process termination) in this phase.
   - Attribution is **best-effort user-mode** inspection; missing PIDs are honestly reported as `"unknown"`.

---

## 🚀 Setup & Execution Guide (Windows 10/11)

### Prerequisites
1. **Python 3.10+** (in PATH)
2. **MySQL Server 8.0+** (port 3306)
3. **Node.js 18+ & npm**

### 1. Backend Setup
```powershell
cd backend
pip install -r requirements.txt
python update_db.py
python app.py
```
*(Backend runs on `http://127.0.0.1:5000`)*

### 2. Run Test Suite
```powershell
# Run all 57 tests (Unit, False-Positive, Integration, Performance)
python -m unittest discover -s tests -p "test_*.py"
```

### 3. Frontend Setup
```powershell
cd ..\frontend
npm install
npm run build
npm run dev
```

### 4. Running the Downloadable FolderGuard Agent
```powershell
# Extract SelectShans-FolderGuard.zip (or run directly from backend/detector_package)
cd backend\detector_package
pip install -r requirements.txt
python detector.py
# Enter the folder path you wish to protect when prompted
```
