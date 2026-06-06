const http = require('http');

console.log('🛡️ [SentinelStream] Starting Windows Event Log Simulator Service...');

const processes = [
    'explorer.exe', 'chrome.exe', 'winword.exe', 'svchost.exe', // Whitelisted
    'unknown.exe', 'python.exe', 'cmd.exe', 'Ransom_Payload.exe', 'dropper.vbs'
];

const eventIds = [4663, 4656, 4660, 4688, 11];
const targetPaths = [
    'C:\\Users\\Public\\Documents\\tax_2024.pdf',
    'C:\\Windows\\System32\\config\\SAM',
    'C:\\Users\\Admin\\Pictures\\family.jpg',
    'C:\\Program Files\\ImportantApp\\config.json',
    'D:\\Backup\\database.bak'
];

const generateRandomLog = () => {
    const isMalicious = Math.random() > 0.85; // 15% chance of malicious event

    const processName = isMalicious ? 'unknown.exe' : processes[Math.floor(Math.random() * processes.length)];
    const eventId = isMalicious ? 11 : eventIds[Math.floor(Math.random() * eventIds.length)]; // 11=FileRename/Write
    const accessType = isMalicious ? 'Write' : (Math.random() > 0.5 ? 'Read' : 'Write');
    const entropy = isMalicious ? (7.8 + Math.random() * 0.2).toFixed(2) : (4.0 + Math.random() * 3.0).toFixed(2); // High entropy if malicious
    const pid = isMalicious ? 9999 : Math.floor(Math.random() * 5000);

    return {
        event_id: eventId,
        process_name: processName,
        pid,
        target_path: targetPaths[Math.floor(Math.random() * targetPaths.length)],
        access_type: accessType,
        entropy: parseFloat(entropy)
    };
};

// Send log to backend API via HTTP POST
const sendLogToBackend = (log) => {
    const data = JSON.stringify(log);

    const options = {
        hostname: '127.0.0.1',
        port: process.env.PORT || 5000,
        path: '/api/logs',
        method: 'POST',
        family: 4, // Explicitly use IPv4
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const req = http.request(options, (res) => {
        // Silently ignore successful responses to keep terminal clean
        if (res.statusCode !== 201) {
            console.log(`[MONITOR] Server returned ${res.statusCode} for simulated log`);
        }
    });

    req.on('error', (error) => {
        console.error('[MONITOR-ERR] Failed to send log to backend (Is server.js running?):', error.message);
    });

    req.write(data);
    req.end();
};

// Simulate rapid ransomware burst (multiple writes in <2s window!)
const triggerSimulatedRansomware = () => {
    console.log('\n[SIMULATOR] Triggering rapid ransomware file-write sequence (PID: 666)...');

    for (let i = 0; i < 3; i++) {
        const maliciousLog = {
            event_id: 4663,
            process_name: 'encryptor.vbs',
            pid: 666,
            target_path: `C:\\Users\\Desktop\\Encrypted_${i}.locked`,
            access_type: 'Write',
            entropy: 7.99
        };
        sendLogToBackend(maliciousLog);
    }
};

// Main Loop: Generate random normal logs every 3 seconds
setInterval(() => {
    const log = generateRandomLog();
    sendLogToBackend(log);
}, 3000);

// Injection Loop: Randomly inject a ransomware burst every ~25-40 seconds
const scheduleAttack = () => {
    const delay = Math.floor(25000 + Math.random() * 15000);
    setTimeout(() => {
        triggerSimulatedRansomware();
        scheduleAttack(); // Reschedule next
    }, delay);
};

scheduleAttack();
console.log('🛡️ [SentinelStream] Simulator Active. Sending random events via HTTP to 127.0.0.1:5000/api/logs');
