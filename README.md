# 🛡 PRD-SYS: Ransomware Pre-Encryption Detection System

A proactive ransomware detection system that identifies suspicious file behavior **before large-scale encryption occurs**, using anomaly monitoring and threshold-based analysis.

---

## 🚀 Project Overview

Ransomware attacks often encrypt files rapidly, causing irreversible damage before detection.  
This project shifts the detection model from **reactive to proactive** by monitoring file system behavior and detecting anomalies such as:

- Rapid file renaming
- Mass file modifications within a short time window
- Suspicious file activity patterns

Once detected, the system:
- Logs the event securely
- Sends real-time email alerts
- Stores forensic data in a database
- Generates daily security summary reports (PDF)

---

## 🧠 Key Features

- 🔍 Real-time file system monitoring (Watchdog)
- ⚡ Threshold-based anomaly detection
- 🔐 Secure token-based authentication
- 📩 Instant email alerts for critical events
- 🗄 MySQL event logging
- 📊 Daily automated PDF security reports
- 📁 Log file upload support
- 🌐 Flask-based backend API
- 💻 React frontend dashboard

---

## 🏗 System Architecture


User Directory → FolderGuard (Detector)
↓
Backend API (Flask)
↓
MySQL Database
↓
Email Alerts + PDF Reports


---

## 🛠 Tech Stack

### Backend
- Python (Flask)
- MySQL
- APScheduler
- ReportLab (PDF generation)
- SMTP (Email Alerts)

### Detector
- Python
- Watchdog (Real-time file monitoring)
- Requests (API communication)

### Frontend
- React (Vite)
- Recharts (Visualization)

---

## 🔎 How Detection Works

1. The detector monitors a user-specified directory.
2. If file renaming exceeds a defined threshold within a time window:
   - It flags as **mass rename anomaly**
3. The event is sent securely to backend.
4. Backend:
   - Validates token
   - Logs event in database
   - Sends immediate email alert
5. Daily summary reports are automatically generated.

---

## 📂 Project Structure


backend/
│
├── app.py
├── detector_package/
│ └── detector.py
│
frontend/
│
└── README.md


---
**Note:
A ---> Our Git Project
B ---> Your Own Encryption Project(File renames are must --> demo version for our A)
Before trying A directly on files, ensure that you have a small Java based or Python based program of B. Then you can use this A in that particular file directory of B, to check how A is working.
Clear!!!! Now try it.**


## ⚙️ Installation & Setup

### 1️⃣ Backend Setup

```bash
cd backend
pip install -r requirements.txt

Create .env file:

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=yourpassword
DB_NAME=yourdbname

MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=yourgmail@gmail.com
MAIL_PASS=your_app_password
DETECTOR_SECRET=your_secret_key

Run backend:

python app.py
2️⃣ Detector Setup

Download detector from dashboard

Extract ZIP

Run:

python detector.py

Enter directory to monitor

3️⃣ Frontend Setup
cd frontend
npm install
npm run dev
📧 Email Alerts

The system sends immediate alerts when:

Mass file renaming threshold is exceeded

Daily summary reports are sent automatically at scheduled time.

📊 Future Enhancements

Risk scoring system (Low/Medium/High)

Automatic process termination

ML-based anomaly detection

SIEM integration

Real-time dashboard risk analytics

🎯 Project Goal

To detect ransomware behavior during its early operational stage
and prevent large-scale file encryption damage.

👨‍💻 Author : Kakarla Sai Pavan Shanmukh

📌 Disclaimer

**This project is developed for educational and research purposes only.**


---
If you want, I can now:
- Add GitHub badges
- Make it look more enterprise-level  
- Add contribution guidelines  

Tell me how professional you want it to look 😄
