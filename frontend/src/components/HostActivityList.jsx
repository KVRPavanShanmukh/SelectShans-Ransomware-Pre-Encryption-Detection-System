import React, { useState, useEffect } from 'react';
import { ShieldAlert, RefreshCw, Mail, Activity, Folder, CheckCircle, AlertTriangle, Cpu } from 'lucide-react';

const HostActivityList = ({ userId, apiBase = 'http://127.0.0.1:5000' }) => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detectorActive, setDetectorActive] = useState(false);

  const fetchActivities = async () => {
    try {
      const storedUserId = localStorage.getItem('userId') || userId || '';
      const response = await fetch(`${apiBase}/api/detector/activities?user_id=${storedUserId}`);
      if (response.ok) {
        const data = await response.json();
        setActivities(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Error fetching detector activities:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async () => {
    try {
      const storedUserId = localStorage.getItem('userId') || userId || '';
      const res = await fetch(`${apiBase}/api/detector/status?user_id=${storedUserId}`);
      if (res.ok) {
        const data = await res.json();
        setDetectorActive(data.active);
      }
    } catch (err) {
      console.error('Error checking detector status:', err);
    }
  };

  useEffect(() => {
    fetchActivities();
    checkStatus();

    const interval = setInterval(() => {
      fetchActivities();
      checkStatus();
    }, 3000);

    return () => clearInterval(interval);
  }, [userId, apiBase]);

  const getSeverityBadge = (sev) => {
    const s = (sev || 'MEDIUM').toUpperCase();
    if (s === 'CRITICAL') {
      return <span style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#ef4444', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: '0.7rem' }}>CRITICAL 🔴</span>;
    } else if (s === 'HIGH') {
      return <span style={{ background: 'rgba(245, 158, 11, 0.2)', border: '1px solid #f59e0b', color: '#f59e0b', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: '0.7rem' }}>HIGH 🟧</span>;
    } else if (s === 'MEDIUM') {
      return <span style={{ background: 'rgba(59, 130, 246, 0.2)', border: '1px solid #3b82f6', color: '#60a5fa', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: '0.7rem' }}>MEDIUM 🟦</span>;
    }
    return <span style={{ background: 'rgba(16, 185, 129, 0.2)', border: '1px solid #10b981', color: '#10b981', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: '0.7rem' }}>LOW 🟩</span>;
  };

  const formatEventName = (str) => {
    if (!str) return 'Anomalous Event';
    return str.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const formatTime = (ts) => {
    if (!ts) return 'N/A';
    try {
      const d = new Date(ts);
      return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 8)}`;
    } catch {
      return String(ts);
    }
  };

  return (
    <div className="card" style={{ background: 'rgba(5, 10, 14, 0.95)', border: '1px solid rgba(0, 124, 195, 0.3)', marginTop: 24 }}>
      
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Activity size={20} style={{ color: '#007CC3' }} />
          <h3 style={{ margin: 0, fontSize: '1rem', color: '#f8fafc', fontFamily: 'JetBrains Mono, monospace' }}>
            Downloadable App — Live Anomalous Activity Stream
          </h3>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            padding: '3px 10px',
            borderRadius: 12,
            fontSize: '0.72rem',
            fontFamily: 'JetBrains Mono, monospace',
            background: detectorActive ? 'rgba(0, 255, 65, 0.1)' : 'rgba(255, 204, 0, 0.1)',
            border: detectorActive ? '1px solid #00FF41' : '1px solid #ffcc00',
            color: detectorActive ? '#00FF41' : '#ffcc00',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: detectorActive ? '#00FF41' : '#ffcc00', boxShadow: detectorActive ? '0 0 6px #00FF41' : 'none' }}></span>
            {detectorActive ? 'Agent Connected & Syncing' : 'Agent Offline'}
          </span>

          <button
            onClick={fetchActivities}
            style={{
              background: 'transparent',
              border: '1px solid rgba(0,124,195,0.4)',
              color: '#007CC3',
              padding: '4px 10px',
              borderRadius: 4,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.75rem',
              fontFamily: 'JetBrains Mono, monospace'
            }}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <p style={{ color: '#94a3b8', fontSize: '0.82rem', marginBottom: 16, marginTop: 0 }}>
        Activities flagged by the downloadable FolderGuard application on your computer are marked, cataloged, shared in real time, and trigger automated website email alerts.
      </p>

      {/* TABLE */}
      {loading ? (
        <p style={{ color: '#64748b', textAlign: 'center', padding: '24px 0' }}>Loading host activities...</p>
      ) : activities.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', background: 'rgba(15, 23, 42, 0.4)', borderRadius: 6, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
          <CheckCircle size={32} style={{ color: '#10b981', marginBottom: 8 }} />
          <p style={{ margin: 0, color: '#e2e8f0', fontSize: '0.88rem', fontWeight: 600 }}>No Anomalous Behavior Flagged Yet</p>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '0.78rem' }}>Run the downloadable application on your host machine to monitor target directories.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', fontFamily: 'JetBrains Mono, monospace' }}>
            <thead>
              <tr style={{ background: '#0f172a', color: '#007CC3', textAlign: 'left', borderBottom: '1px solid #334155' }}>
                <th style={{ padding: '8px 10px' }}>Timestamp</th>
                <th style={{ padding: '8px 10px' }}>Anomalous Event</th>
                <th style={{ padding: '8px 10px' }}>Monitored Directory / File</th>
                <th style={{ padding: '8px 10px' }}>Severity</th>
                <th style={{ padding: '8px 10px' }}>Action Executed</th>
                <th style={{ padding: '8px 10px' }}>Website Email Alert</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((act, idx) => {
                const isCritical = (act.severity || '').toUpperCase() === 'CRITICAL' || (act.severity || '').toUpperCase() === 'HIGH';
                return (
                  <tr key={act.id || idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: idx % 2 === 0 ? 'transparent' : 'rgba(15, 23, 42, 0.4)' }}>
                    <td style={{ padding: '8px 10px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{formatTime(act.created_at)}</td>
                    <td style={{ padding: '8px 10px', color: '#00FF41', fontWeight: 700 }}>{formatEventName(act.event_type)}</td>
                    <td style={{ padding: '8px 10px', color: '#e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Folder size={14} style={{ color: '#007CC3', flexShrink: 0 }} />
                        <span>{act.directory} {act.target_file ? `(${act.target_file})` : ''}</span>
                      </div>
                    </td>
                    <td style={{ padding: '8px 10px' }}>{getSeverityBadge(act.severity)}</td>
                    <td style={{ padding: '8px 10px', color: '#cbd5e1' }}>{act.action_taken || 'Marked & Logged'}</td>
                    <td style={{ padding: '8px 10px' }}>
                      {isCritical ? (
                        <span style={{ color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                          <Mail size={14} /> Delivered
                        </span>
                      ) : (
                        <span style={{ color: '#64748b' }}>Logged</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default HostActivityList;
