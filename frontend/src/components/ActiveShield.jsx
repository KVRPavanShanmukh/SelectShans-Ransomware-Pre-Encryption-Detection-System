import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, Zap, Lock, Eye } from 'lucide-react';

const HONEYPOTS = [
  { path: '/Documents/Decoy_Finance.xlsx', status: 'UNTOUCHED', secure: true },
  { path: '/System32/config/user_db.bak', status: 'ACCESS ATTEMPTED', secure: false },
  { path: '/Users/Public/tax_2024.pdf', status: 'UNTOUCHED', secure: true },
  { path: '/ProgramData/backup_keys.dat', status: 'READ ATTEMPTED', secure: false },
];

const ActiveShield = () => {
  const [autoIsolate, setAutoIsolate] = useState(true);
  const [killEntropy, setKillEntropy] = useState(true);
  const [lockdownActive, setLockdownActive] = useState(false);
  const [blocked, setBlocked] = useState(2);

  const handleLockdown = () => {
    if (window.confirm('⚠ ACTIVATE FULL SYSTEM LOCKDOWN?\n\nThis will isolate all hosts and terminate high-entropy processes.')) {
      setLockdownActive(true);
      setBlocked(b => b + 1);
    }
  };

  return (
    <div className="dashboard-wrapper">
      {/* Lockdown Banner */}
      {lockdownActive && (
        <div style={{
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid #ef4444',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          animation: 'fadeIn 0.3s ease',
          letterSpacing: '2px',
          fontSize: '0.78rem',
          fontWeight: 700,
          color: '#ef4444',
          textTransform: 'uppercase',
        }}>
          <ShieldAlert size={20} />
          LOCKDOWN ACTIVE — ALL HOSTS ISOLATED — PROCESSES TERMINATED
          <button
            style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '6px 14px', cursor: 'pointer', fontSize: '0.7rem', letterSpacing: 2, fontWeight: 700 }}
            onClick={() => setLockdownActive(false)}
          >
            DEACTIVATE
          </button>
        </div>
      )}

      <div className="active-shield-grid">
        {/* Main Status */}
        <div className="card shield-main">
          <div className="shield-header">
            {lockdownActive
              ? <ShieldAlert size={40} color="#ef4444" />
              : <ShieldCheck size={40} color="#10b981" />
            }
            <div>
              <h2 style={{ color: lockdownActive ? '#ef4444' : '#10b981', display: 'flex', alignItems: 'center', gap: 10 }}>
                {lockdownActive ? 'LOCKDOWN ACTIVE' : 'Active Shield: SECURE'}
                <span style={{fontSize: '0.65rem', color: '#f59e0b', background: '#f59e0b20', padding: '2px 6px', borderRadius: 4, letterSpacing: '2px'}}>SIMULATION</span>
              </h2>
              <p className="subtext">Monitoring pre-encryption signatures in real-time</p>
            </div>
          </div>

          <div className="shield-stats">
            <div className="stat-box">
              <Eye size={18} color="#007CC3" />
              <span>Honeypots Active</span>
              <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#38bdf8' }}>15</span>
            </div>
            <div className="stat-box">
              <Lock size={18} color="#ef4444" />
              <span>Processes Blocked</span>
              <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ef4444' }}>{blocked}</span>
            </div>
          </div>
        </div>

        {/* Honeypot Feed */}
        <div className="card glass-effect">
          <p className="section-label"><Eye size={12} /> Honeypot Status</p>
          <p className="subtext">Decoy files placed in sensitive dirs to detect early access.</p>
          <div className="honeypot-list">
            {HONEYPOTS.map((h, i) => (
              <div key={i} className={`honey-item ${h.secure ? 'secure' : 'alert'}`}>
                <span>📁 {h.path}</span>
                <span className="status" style={{ fontSize: '0.65rem', letterSpacing: 1 }}>{h.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* SOAR Automation */}
        <div className="card glass-effect">
          <p className="section-label"><Zap size={12} /> SOAR Automation</p>
          <div className="toggle-group" style={{ marginTop: 16 }}>
            <div className="toggle-item">
              <span>Auto-Isolate Host on Anomaly</span>
              <input
                type="checkbox"
                checked={autoIsolate}
                onChange={() => setAutoIsolate(v => !v)}
              />
            </div>
            <div className="toggle-item">
              <span>Kill High-Entropy Processes</span>
              <input
                type="checkbox"
                checked={killEntropy}
                onChange={() => setKillEntropy(v => !v)}
              />
            </div>
          </div>
          <button className="btn-danger-large" onClick={handleLockdown}>
            <span>Manual System Lockdown</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActiveShield;
