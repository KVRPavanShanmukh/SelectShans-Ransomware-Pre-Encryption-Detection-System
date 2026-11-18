-- SelectShans Database Schema (Supabase PostgreSQL)
-- Run this in your Supabase SQL Editor to set up the DB

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) NOT NULL,
    dob VARCHAR(20) DEFAULT '300706',
    sec_q VARCHAR(255),
    sec_a_hash VARCHAR(255),
    role VARCHAR(20) DEFAULT 'user',
    shikikan_access BOOLEAN DEFAULT FALSE,
    shikikan_requested BOOLEAN DEFAULT FALSE,
    is_online BOOLEAN DEFAULT FALSE,
    last_active TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Active Sessions (to track logins/lockouts)
CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(100) PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    ip_address VARCHAR(50),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pending Multi-Factor Authentication Challenges (Self-cleaning PostgreSQL storage for multi-worker HA)
CREATE TABLE IF NOT EXISTS pending_auth_challenges (
    id SERIAL PRIMARY KEY,
    identifier VARCHAR(255) NOT NULL,
    challenge_type VARCHAR(32) NOT NULL,
    otp_hash VARCHAR(128) NOT NULL,
    psk_hash VARCHAR(128) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pending_auth_ident_type ON pending_auth_challenges (identifier, challenge_type);
CREATE INDEX IF NOT EXISTS idx_pending_auth_expires_at ON pending_auth_challenges (expires_at);


-- Process Whitelist (Don't kill these)
CREATE TABLE IF NOT EXISTS process_whitelist (
    id SERIAL PRIMARY KEY,
    process_name VARCHAR(100) UNIQUE NOT NULL,
    description VARCHAR(255),
    added_by VARCHAR(50) DEFAULT 'system'
);

-- Insert Default Whitelist
INSERT INTO process_whitelist (process_name, description) VALUES
('explorer.exe', 'Windows Explorer'),
('chrome.exe', 'Google Chrome Browser'),
('winword.exe', 'Microsoft Word'),
('svchost.exe', 'Service Host Process'),
('MsMpEng.exe', 'Windows Defender'),
('OneDrive.exe', 'Microsoft OneDrive'),
('SearchIndexer.exe', 'Windows Search')
ON CONFLICT (process_name) DO NOTHING;

-- Event Logs (Simulated Windows Events)
CREATE TABLE IF NOT EXISTS event_logs (
    id SERIAL PRIMARY KEY,
    event_id INT NOT NULL, -- 4663, 4656, 4660, 4688
    process_name VARCHAR(100) NOT NULL,
    pid INT,
    target_path VARCHAR(500),
    access_type VARCHAR(50), -- Read, Write, Delete
    entropy DECIMAL(5,2),    -- e.g. 7.95
    timestamp TIMESTAMP NOT NULL
);

-- Tamper-proof Log Hashes (SHA-256 of each log entry)
CREATE TABLE IF NOT EXISTS log_hashes (
    log_id INT PRIMARY KEY REFERENCES event_logs(id) ON DELETE CASCADE,
    hash_value VARCHAR(64) NOT NULL
);

-- Ransomware Alerts
CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    severity VARCHAR(20) NOT NULL,
    process_name VARCHAR(100) NOT NULL,
    pid INT,
    trigger_reason VARCHAR(255) NOT NULL,
    action_taken VARCHAR(255) NOT NULL,
    resolved BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON alerts (resolved, timestamp);

-- Admin Settings (Log retention, etc)
CREATE TABLE IF NOT EXISTS admin_settings (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    log_retention_days INT DEFAULT 30,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit Log (Track system events)
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(100),
    description TEXT,
    ip_address VARCHAR(50),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Profiles
CREATE TABLE IF NOT EXISTS user_profiles (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255),
    phone VARCHAR(20),
    organization VARCHAR(255),
    address VARCHAR(500),
    notification_email VARCHAR(100),
    profile_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Detector Logs Table
CREATE TABLE IF NOT EXISTS detector_logs (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    directory VARCHAR(500),
    event_count INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_det_logs_user ON detector_logs (user_id, created_at);

-- Detector Activities Table (Matches sync-activities schema)
CREATE TABLE IF NOT EXISTS detector_activities (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    directory VARCHAR(500),
    target_file VARCHAR(255),
    severity VARCHAR(20) DEFAULT 'MEDIUM',
    score INT DEFAULT 0,
    detector_id VARCHAR(50),
    hostname VARCHAR(100),
    event_count INT DEFAULT 1,
    action_taken VARCHAR(255),
    process_name VARCHAR(100),
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- INDEX idx_det_activities_user (user_id, created_at)
CREATE INDEX IF NOT EXISTS idx_det_activities_user ON detector_activities (user_id, created_at);

-- System Health Snapshots
CREATE TABLE IF NOT EXISTS system_health_snapshots (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    cpu_usage DECIMAL(5,2),
    memory_usage DECIMAL(5,2),
    disk_usage DECIMAL(5,2),
    active_processes INT,
    active_alerts INT,
    threat_level VARCHAR(20),
    health_score INT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
