-- SentinelStream Database Schema
-- Run this in your MySQL client to set up the DB
-- Database Name: RANSOMWARE

CREATE DATABASE IF NOT EXISTS RANSOMWARE;
USE RANSOMWARE;

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) NOT NULL,
    dob VARCHAR(10) DEFAULT '300706',
    sec_q VARCHAR(255),
    sec_a_hash VARCHAR(255),
    role ENUM('admin', 'user') DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Active Sessions (to track logins/lockouts)
CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(100) PRIMARY KEY,
    user_id INT,
    token_hash VARCHAR(255) NOT NULL,
    ip_address VARCHAR(50),
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Process Whitelist (Don't kill these)
CREATE TABLE IF NOT EXISTS process_whitelist (
    id INT AUTO_INCREMENT PRIMARY KEY,
    process_name VARCHAR(100) UNIQUE NOT NULL,
    description VARCHAR(255),
    added_by VARCHAR(50) DEFAULT 'system'
);

-- Insert Default Whitelist
INSERT IGNORE INTO process_whitelist (process_name, description) VALUES
('explorer.exe', 'Windows Explorer'),
('chrome.exe', 'Google Chrome Browser'),
('winword.exe', 'Microsoft Word'),
('svchost.exe', 'Service Host Process'),
('MsMpEng.exe', 'Windows Defender'),
('OneDrive.exe', 'Microsoft OneDrive'),
('SearchIndexer.exe', 'Windows Search');

-- Event Logs (Simulated Windows Events)
CREATE TABLE IF NOT EXISTS event_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL, -- 4663, 4656, 4660, 4688
    process_name VARCHAR(100) NOT NULL,
    pid INT,
    target_path VARCHAR(500),
    access_type VARCHAR(50), -- Read, Write, Delete
    entropy DECIMAL(5,2),    -- e.g. 7.95
    timestamp DATETIME NOT NULL
);

-- Tamper-proof Log Hashes (SHA-256 of each log entry)
CREATE TABLE IF NOT EXISTS log_hashes (
    log_id INT PRIMARY KEY,
    hash_value VARCHAR(64) NOT NULL, -- SHA-256 is 64 hex chars
    FOREIGN KEY (log_id) REFERENCES event_logs(id) ON DELETE CASCADE
);

-- Ransomware Alerts
CREATE TABLE IF NOT EXISTS alerts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    severity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL,
    process_name VARCHAR(100) NOT NULL,
    pid INT,
    trigger_reason VARCHAR(255) NOT NULL,
    action_taken VARCHAR(100) NOT NULL,
    resolved BOOLEAN DEFAULT FALSE,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Admin Settings (Log retention, etc)
CREATE TABLE IF NOT EXISTS admin_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    log_retention_days INT DEFAULT 30,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Audit Log (Track system events)
CREATE TABLE IF NOT EXISTS audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(100),
    description TEXT,
    ip_address VARCHAR(50),
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- User Profiles
CREATE TABLE IF NOT EXISTS user_profiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    full_name VARCHAR(255),
    phone VARCHAR(20),
    organization VARCHAR(255),
    notification_email VARCHAR(100),
    profile_data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- System Health Snapshots
CREATE TABLE IF NOT EXISTS system_health_snapshots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    cpu_usage DECIMAL(5,2),
    memory_usage DECIMAL(5,2),
    disk_usage DECIMAL(5,2),
    active_processes INT,
    active_alerts INT,
    threat_level VARCHAR(20),
    health_score INT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Insert Default Admin (Password: password123, Answer to SQ1 "11": 11)
-- Only run if table is empty
INSERT IGNORE INTO users (username, password_hash, email, sec_q, sec_a_hash, role)
VALUES (
    'admin',
    'scrypt:32768:8:1$rn95kIq9aE2NbVYS$5c6e29209543965c94b4bb18d7102bc72b88d675b00a74f66ba0c21f7fef9551adec4069eee46e8cc854d1791bf9b16c448dcea09416fffa4abd91d1acd07777', -- password123
    'admin@sentinelstream.local',
    'What is the Event ID for FileCreate in Sysmon?',
    'scrypt:32768:8:1$0ojtnWWc3ZW50wFJ$9a89ebf942268dd75ee79b4dbfda8d53ee81968345a0d39c970cc5991e495e2c5c746101e4e249a59e8c489b6f52601259925ebec0d70aed93cc369861c765a8', -- 11
    'admin'
);
