import React, { useState, useEffect } from 'react';
import { ShieldAlert, Play, CheckCircle, AlertOctagon, RefreshCw, Send, Radio } from 'lucide-react';

const SOAR = ({ userId, apiBase = 'http://127.0.0.1:5000' }) => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIncident, setActiveIncident] = useState(null);
  const [message, setMessage] = useState('');

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/alerts`);
      if (res.ok) {
        const data = await res.json();
        setAlerts(data);
        
        // Find any active critical alerts (unresolved)
        const critical = data.find(a => a.severity === 'CRITICAL' && !a.resolved);
        if (critical) {
          setActiveIncident(critical);
        } else {
          setActiveIncident(null);
        }
      }
    } catch (err) {
      console.error("Failed to fetch alerts in SOAR:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, []);

  const handleResolve = async (alertId) => {
    try {
      const res = await fetch(`${apiBase}/api/alerts/${alertId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        setMessage('Incident marked as resolved. Security status: CLEAN');
        fetchAlerts();
        setTimeout(() => setMessage(''), 4000);
      } else {
        const errData = await res.json();
        setMessage(`Error: ${errData.error || 'Failed to resolve incident'}`);
      }
    } catch {
      setMessage('Failed to reach backend server');
    }
  };

  return (
    <div style={{ padding: 30, display: 'flex', flexDirection: 'column', gap: 25 }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ color: 'var(--primary-bright)', fontSize: '1.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', textShadow: '0 0 10px rgba(0, 255, 65, 0.3)' }}>
            SOAR Control Panel
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Security Orchestration, Automation, and Response Engine
          </p>
        </div>
        <button 
          onClick={fetchAlerts}
          disabled={loading}
          style={{
            background: 'rgba(0, 255, 65, 0.05)',
            border: '1px solid var(--primary-bright)',
            color: 'var(--primary-bright)',
            padding: '8px 16px',
            borderRadius: 4,
            cursor: 'pointer',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <RefreshCw size={14} className={loading ? 'spin-anim' : ''} />
          {loading ? 'Refreshing...' : 'Refresh Status'}
        </button>
      </div>

      {message && (
        <div style={{
          background: 'rgba(0, 255, 65, 0.1)',
          border: '1px solid var(--success)',
          color: 'var(--success)',
          padding: '12px 18px',
          borderRadius: 4,
          fontSize: '0.85rem'
        }}>
          {message}
        </div>
      )}

      {/* ACTIVE INCIDENT AUTOMATION TRIGGER BANNER */}
      {activeIncident ? (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '2px solid var(--danger)',
          borderRadius: 8,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 15,
          boxShadow: '0 0 20px rgba(255, 51, 102, 0.25)',
          animation: 'glow-danger 3s infinite'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <AlertOctagon color="var(--danger)" size={32} />
            <div>
              <h3 style={{ color: 'var(--danger)', margin: 0, textTransform: 'uppercase', fontWeight: 800, letterSpacing: 1 }}>
                🚨 Critical Threat Incident Auto-Triggered
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#fca5a5' }}>
                The SentinelStream FolderGuard agent running on the host system detected an anomaly.
              </p>
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 15, background: 'rgba(0,0,0,0.3)', padding: 15, borderRadius: 6, fontSize: '0.85rem', fontFamily: 'JetBrains Mono, monospace' }}>
            <div><strong>Threat Source:</strong> {activeIncident.process_name}</div>
            <div><strong>Description:</strong> {activeIncident.trigger_reason}</div>
            <div><strong>Automated Action:</strong> {activeIncident.action_taken}</div>
            <div><strong>Timestamp:</strong> {new Date(activeIncident.timestamp).toLocaleString()}</div>
          </div>

          <div style={{ display: 'flex', gap: 15, marginTop: 5 }}>
            <button
              onClick={() => handleResolve(activeIncident.id)}
              style={{
                background: 'var(--danger)',
                border: 'none',
                color: '#fff',
                padding: '10px 20px',
                borderRadius: 4,
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '0.8rem',
                textTransform: 'uppercase',
                letterSpacing: 1
              }}
            >
              Resolve & Clear Incident
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--warning)', fontWeight: 600 }}>
              <Radio size={16} className="blink-anim" /> Live Mitigation Active
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          background: 'rgba(0, 255, 65, 0.03)',
          border: '1px dashed var(--card-border)',
          borderRadius: 8,
          padding: 24,
          textAlign: 'center',
          color: 'var(--text-secondary)'
        }}>
          <CheckCircle size={36} color="var(--primary-bright)" style={{ margin: '0 auto 10px auto' }} />
          <h3 style={{ color: 'var(--text-primary)', margin: '0 0 5px 0' }}>All Systems Operating Normally</h3>
          <p style={{ margin: 0, fontSize: '0.82rem' }}>No active security triggers. The local FolderGuard agent is listening for host activities.</p>
        </div>
      )}

      {/* SOAR PLAYBOOK ACTIONS CONTAINER */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        
        {/* PLAYBOOK PANEL */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
          <div className="section-label">Incident Playbooks</div>
          <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Ransomware Prevention Playbook (PR-01)</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
            Automated steps executed when the downloadable agent signals abnormal activity:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ background: 'var(--primary-bright)', color: '#000', width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContext: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold', flexShrink: 0 }}>1</div>
              <div>
                <strong style={{ fontSize: '0.85rem' }}>Entropy Analyzer Check</strong>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Monitor directories for file rename surges or file entropy jumps.</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ background: activeIncident ? 'var(--danger)' : 'var(--primary-bright)', color: '#000', width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold', flexShrink: 0 }}>2</div>
              <div>
                <strong style={{ fontSize: '0.85rem' }}>Auto-Isolate Suspicious Process</strong>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Suspend or terminate PIDs causing surges immediately.</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ background: activeIncident ? 'var(--danger)' : 'var(--primary-bright)', color: '#000', width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold', flexShrink: 0 }}>3</div>
              <div>
                <strong style={{ fontSize: '0.85rem' }}>Nodemailer Dispatch</strong>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Send a custom designed security report to user's mail via Node Mailer.</p>
              </div>
            </div>
          </div>
        </div>

        {/* RECENT ORCHESTRATION EVENTS */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
          <div className="section-label">Orchestration Audit Feed</div>
          <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Execution Log</h3>

          <div style={{ flex: 1, overflowY: 'auto', maxHeight: 200, display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem' }}>
            {alerts.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>No execution audits recorded yet.</div>
            ) : (
              alerts.map((alert) => (
                <div key={alert.id} style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderLeft: `2px solid ${alert.severity === 'CRITICAL' ? 'var(--danger)' : 'var(--primary-bright)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ color: alert.severity === 'CRITICAL' ? 'var(--danger)' : 'var(--primary-light)', fontWeight: 'bold' }}>[{alert.severity}]</span>{' '}
                    <span>{alert.trigger_reason}</span>
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    {alert.resolved ? 'RESOLVED' : 'ACTIVE'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
      
      <style>{`
        .spin-anim {
          animation: spin 1.5s linear infinite;
        }
        .blink-anim {
          animation: matrix-flicker 1.5s infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default SOAR;
