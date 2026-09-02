import React, { useState } from 'react';
import { Database, Search } from 'lucide-react';

const SYSMON_TEMPLATES = [
  { id: 11, type: 'FileRename', process: 'unknown.exe', target: 'C:/Users/Docs/finances.locked', alert: 'CRITICAL' },
  { id: 1, type: 'ProcessCreate', process: 'cmd.exe', target: 'N/A', alert: 'medium' },
  { id: 13, type: 'RegistrySet', process: 'svchost.exe', target: 'HKLM/Run/Malware', alert: 'high' },
  { id: 3, type: 'NetworkConn', process: 'powershell.exe', target: '185.220.101.47:443', alert: 'high' },
  { id: 17, type: 'PipeCreated', process: 'unknown.exe', target: '\\pipe\\ransomware', alert: 'CRITICAL' },
  { id: 1, type: 'ProcessCreate', process: 'notepad.exe', target: 'N/A', alert: 'medium' },
];

const generateLog = () => {
  const template = SYSMON_TEMPLATES[Math.floor(Math.random() * SYSMON_TEMPLATES.length)];
  const now = new Date();
  return {
    ...template,
    time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${Math.floor(Math.random() * 999)}`,
    idCounter: Math.random() // unique key
  };
};

const SysmonLogs = () => {
  const [filter, setFilter] = useState('');
  const [logs, setLogs] = useState(() => Array.from({ length: 8 }, generateLog).sort((a, b) => b.time.localeCompare(a.time))); // Initial logs

  // Real-time generator
  React.useEffect(() => {
    const interval = setInterval(() => {
      setLogs(prev => {
        const newLogs = [generateLog(), ...prev];
        if (newLogs.length > 50) newLogs.pop(); // Keep array size manageable
        return newLogs;
      });
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  const filtered = logs.filter(log =>
    filter === '' ||
    String(log.id).includes(filter) ||
    log.process.toLowerCase().includes(filter.toLowerCase()) ||
    log.type.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="dashboard-wrapper">
      <div className="card log-card">
        <div className="header-flex">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.8rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase' }}>
            <Database size={18} color="#007CC3" />
            Sysmon Correlation Engine
          </h3>
          <div className="search-bar">
            <Search size={14} color="#94a3b8" />
            <input
              type="text"
              placeholder="Filter by Event ID, process, or type..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        </div>

        <table className="log-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Event ID</th>
              <th>Type</th>
              <th>Source Process</th>
              <th>Target Path</th>
              <th>Risk Level</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: '#475569', padding: 40, fontSize: '0.8rem', letterSpacing: 1 }}>
                  NO MATCHING LOG ENTRIES
                </td>
              </tr>
            ) : (
              filtered.map((log) => (
                <tr key={log.idCounter} className={log.alert === 'CRITICAL' ? 'danger-row' : ''}>
                  <td className="mono" style={{ color: '#475569' }}>{log.time}</td>
                  <td style={{ fontWeight: 700 }}>{log.id}</td>
                  <td>{log.type}</td>
                  <td style={{ fontWeight: 600 }}>{log.process}</td>
                  <td className="mono">{log.target}</td>
                  <td>
                    <span className={`badge ${log.alert.toLowerCase()}`}>{log.alert}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Contextual Information Section */}
      <div className="card" style={{ marginTop: 24, padding: '24px 32px' }}>
        <h4 style={{ color: 'var(--primary)', fontSize: '0.9rem', marginBottom: 12, letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Database size={16} /> ABOUT SYSMON CORRELATION
        </h4>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
          System Monitor (Sysmon) is a Windows system service that logs system activity to the Windows event log. SelectShans utilizes these logs to perform real-time behavioral analysis.
        </p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          By tracking specific Event IDs — such as <strong>Event ID 11 (FileCreate)</strong> for rapid file modification, or <strong>Event ID 1 (ProcessCreate)</strong> to track abnormal spawn trees — the Machine Learning engine can formulate an Anomaly Score indicating the likelihood of pre-encryption ransomware deployment.
        </p>
      </div>
    </div>
  );
};

export default SysmonLogs;