import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, ShieldAlert, Lock, Wifi, Printer, Zap, Copy, Check, Terminal, X } from 'lucide-react';
import HostActivityList from './HostActivityList';

const generateData = () =>
  Array.from({ length: 20 }, (_, i) => ({
    name: i,
    cpu: Math.floor(Math.random() * 50) + 10,
  }));

const Dashboard = ({ userId, apiBase = '' }) => {
  const [detectorActive, setDetectorActive] = useState(false);
  const [chartData, setChartData] = useState(Array.from({ length: 20 }, (_, i) => ({ name: i, cpu: 0 })));
  const [anomalyScore, setAnomalyScore] = useState(0);
  const [netConns, setNetConns] = useState(0);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [copied, setCopied] = useState(false);

  // Poll detector status
  useEffect(() => {
    if (!userId) return;
    
    const checkStatus = async () => {
      try {
        const res = await fetch(`${apiBase}/api/detector/status?user_id=${userId}`);
        if (res.ok) {
          const data = await res.json();
          setDetectorActive(data.active);
        }
      } catch (err) {
        console.error("Error polling detector status:", err);
      }
    };

    checkStatus();
    const statusInterval = setInterval(checkStatus, 3000);
    return () => clearInterval(statusInterval);
  }, [userId]);

  const [filesProtected, setFilesProtected] = useState(0);

  // Telemetry updates — only if detector is active on host machine
  useEffect(() => {
    if (!detectorActive) {
      setChartData(Array.from({ length: 20 }, (_, i) => ({ name: i, cpu: 0 })));
      setAnomalyScore(0);
      setNetConns(0);
      setFilesProtected(0);
      return;
    }

    const fetchRealtimeStats = async () => {
      try {
        const storedUserId = localStorage.getItem('userId') || userId;
        const token = localStorage.getItem('jwtToken');
        const headers = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        const res = await fetch(`${apiBase}/api/admin/realtime-stats?user_id=${storedUserId}`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.chart_data)) {
            setChartData(data.chart_data);
          }
          setAnomalyScore(data.anomaly_score);
          setNetConns(data.active_connections);
          setFilesProtected(data.files_protected);
        } else if (res.status === 401) {
          console.warn("Realtime stats unauthorized - token may have expired");
        }
      } catch (err) {
        console.error("Error fetching realtime stats:", err);
      }
    };

    fetchRealtimeStats();
    const interval = setInterval(fetchRealtimeStats, 3000);

    return () => clearInterval(interval);
  }, [detectorActive, userId]);

  const detectorToken = localStorage.getItem("detector_token") || sessionStorage.getItem("detector_token") || "";

  const defaultServerOrigin = apiBase
    ? apiBase
    : (window.location.origin.includes('5173') || window.location.origin.includes('5174') ? 'http://127.0.0.1:5000' : window.location.origin);

  const [backendServerUrl, setBackendServerUrl] = useState(() => {
    return localStorage.getItem("custom_backend_url") || defaultServerOrigin;
  });

  const handleServerUrlChange = (newVal) => {
    const trimmed = newVal.trim();
    setBackendServerUrl(trimmed);
    localStorage.setItem("custom_backend_url", trimmed);
  };

  const effectiveServer = (backendServerUrl || defaultServerOrigin).replace(/\/+$/, '');
  const agentCommand = `irm "${effectiveServer}/api/agent.ps1?token=${encodeURIComponent(detectorToken)}&server=${encodeURIComponent(effectiveServer)}" | iex`;

  const copyAgentCommand = () => {
    navigator.clipboard.writeText(agentCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleDownloadDetector = () => {
    const token = localStorage.getItem("detector_token") || sessionStorage.getItem("detector_token");
    if (!token) {
      alert("Detector token missing. Please login again.");
      return;
    }
    window.location.href = `${effectiveServer}/api/detector-download?token=${encodeURIComponent(token)}`;
  };

  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const generatePDF = async () => {
    try {
      setIsGeneratingPDF(true);
      const storedUserId = localStorage.getItem('userId') || userId || '';
      const token = localStorage.getItem('jwtToken');
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const url = `${apiBase}/api/admin/security-report${storedUserId ? `?user_id=${storedUserId}` : ''}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate security report');
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `SelectShans_Security_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error(err);
      alert(err.message || "Error generating real-time security PDF report.");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="dashboard-wrapper">

      {!detectorActive && (
        <div style={{
          background: 'rgba(255, 204, 0, 0.1)',
          border: '1px solid var(--warning)',
          color: 'var(--warning)',
          padding: '12px 18px',
          borderRadius: 6,
          fontSize: '0.82rem',
          marginBottom: 10,
          fontFamily: 'JetBrains Mono, monospace',
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}>
          ⚠️ <strong>DETECTOR OFFLINE:</strong> Download and execute the agent program on your host machine to establish a secure stream and telemetry flow.
        </div>
      )}

      {/* TOP RIGHT BUTTONS */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 20
      }}>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={() => setShowAgentModal(true)}
            style={{
              background: 'linear-gradient(135deg, rgba(0, 124, 195, 0.25), rgba(0, 255, 65, 0.15))',
              border: '1px solid #00FF41',
              color: '#00FF41',
              padding: '7px 16px',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 0 12px rgba(0, 255, 65, 0.15)'
            }}
          >
            <Zap size={16} color="#00FF41" />
            <span>⚡ Connect Agent (0 Disk Space)</span>
          </button>

          <button
            onClick={handleDownloadDetector}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#94a3b8',
              padding: '7px 14px',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.8rem'
            }}
            title="Download offline Python package ZIP"
          >
            ⬇ Download ZIP
          </button>
        </div>

        <button
          onClick={generatePDF}
          disabled={isGeneratingPDF}
          style={{
            background: isGeneratingPDF ? '#334155' : '#1e293b',
            border: '1px solid #334155',
            color: '#cbd5e1',
            padding: '7px 16px',
            borderRadius: 6,
            cursor: isGeneratingPDF ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: '0.82rem',
            fontWeight: 600
          }}
        >
          <Printer size={16} /> {isGeneratingPDF ? 'Generating Live PDF...' : 'Generate Real-Time PDF'}
        </button>

      </div>

      {/* MODAL: RUN IN-MEMORY AGENT (0 DISK SPACE) */}
      {showAgentModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20
        }}>
          <div style={{
            background: '#0a0f1d',
            border: '1px solid #00ffcc',
            borderRadius: 8,
            maxWidth: 680,
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: 24,
            boxShadow: '0 20px 60px rgba(0,0,0,0.8), 0 0 25px rgba(0, 255, 204, 0.2)',
            position: 'relative'
          }}>
            <button
              onClick={() => setShowAgentModal(false)}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer'
              }}
            >
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ background: 'rgba(0, 255, 204, 0.1)', border: '1px solid #00ffcc', padding: 8, borderRadius: 6 }}>
                <Terminal size={22} color="#00ffcc" />
              </div>
              <div>
                <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.15rem' }}>
                  Live Endpoint Agent — Zero Disk Space
                </h3>
                <span style={{ fontSize: '0.78rem', color: '#00ffcc' }}>
                  Runs 100% in memory (RAM). Custom folder selection & remote server support.
                </span>
              </div>
            </div>

            {/* BACKEND SERVER URL CONFIGURATION */}
            <div style={{
              background: '#04070f',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 6,
              padding: '12px 14px',
              marginBottom: 16
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1' }}>
                  Backend Server URL (External or Localhost):
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => handleServerUrlChange('http://127.0.0.1:5000')}
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: '#94a3b8',
                      fontSize: '0.68rem',
                      padding: '2px 8px',
                      borderRadius: 4,
                      cursor: 'pointer'
                    }}
                  >
                    Localhost:5000
                  </button>
                  <button
                    type="button"
                    onClick={() => handleServerUrlChange(window.location.origin)}
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: '#94a3b8',
                      fontSize: '0.68rem',
                      padding: '2px 8px',
                      borderRadius: 4,
                      cursor: 'pointer'
                    }}
                  >
                    Current Host
                  </button>
                </div>
              </div>

              <input
                type="text"
                value={backendServerUrl}
                onChange={(e) => handleServerUrlChange(e.target.value)}
                placeholder="e.g. https://selectshans-backend.onrender.com or http://127.0.0.1:5000"
                style={{
                  width: '100%',
                  background: '#0a0f1d',
                  border: '1px solid #334155',
                  borderRadius: 4,
                  padding: '6px 10px',
                  color: '#38bdf8',
                  fontSize: '0.8rem',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box'
                }}
              />

              <div style={{ marginTop: 8, fontSize: '0.72rem', lineHeight: 1.4 }}>
                {effectiveServer.includes('localhost') || effectiveServer.includes('127.0.0.1') ? (
                  <span style={{ color: '#f59e0b' }}>
                    ⚠️ <strong>Localhost detected:</strong> The agent command will only work on this machine. If your frontend is deployed or your agent runs on another PC, paste your public backend URL (e.g. Render, Railway, or ngrok tunnel) above.
                  </span>
                ) : (
                  <span style={{ color: '#10b981' }}>
                    🌐 <strong>External backend URL configured:</strong> This agent command can be executed on any PC connected to the internet and will stream live telemetry directly to your dashboard.
                  </span>
                )}
              </div>
            </div>

            {/* FOLDER SELECTION HIGHLIGHT */}
            <div style={{
              background: 'rgba(0, 124, 195, 0.1)',
              border: '1px solid rgba(0, 124, 195, 0.3)',
              borderRadius: 6,
              padding: '10px 14px',
              fontSize: '0.75rem',
              color: '#cbd5e1',
              marginBottom: 16,
              lineHeight: 1.5
            }}>
              <strong style={{ color: '#38bdf8' }}>📁 Choose Your Protected Folder:</strong> When you run the PowerShell command, it will interactively prompt you to choose which folder on your PC to guard (via a <strong>native Windows Folder Picker dialog</strong> or manual path). It deploys an active decoy canary trap and saves a 1-click <code style={{ color: '#00ffcc' }}>Start-FolderGuard.bat</code> launcher right inside your chosen folder!
            </div>

            <p style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.5, marginBottom: 10 }}>
              Copy and run this single command in <strong>Windows PowerShell</strong>:
            </p>

            <div style={{
              background: '#04070f',
              border: '1px solid rgba(0, 255, 204, 0.3)',
              borderRadius: 6,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 16
            }}>
              <code style={{
                color: '#38bdf8',
                fontSize: '0.76rem',
                fontFamily: 'JetBrains Mono, monospace',
                wordBreak: 'break-all'
              }}>
                {agentCommand}
              </code>

              <button
                onClick={copyAgentCommand}
                style={{
                  background: copied ? '#10b981' : '#007CC3',
                  color: '#ffffff',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  flexShrink: 0
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 6,
              padding: '12px 14px',
              fontSize: '0.75rem',
              color: '#94a3b8',
              lineHeight: 1.6
            }}>
              <div><strong>1.</strong> Press <kbd style={{ background: '#1e293b', padding: '2px 6px', borderRadius: 3 }}>Win + X</kbd> and select <strong>Terminal</strong> or <strong>PowerShell</strong>.</div>
              <div><strong>2.</strong> Paste the command and press <kbd style={{ background: '#1e293b', padding: '2px 6px', borderRadius: 3 }}>Enter</kbd>.</div>
              <div><strong>3.</strong> Pick your target folder when prompted (or press Enter for folder dialog).</div>
              <div><strong>4.</strong> The agent activates in RAM and this dashboard turns <strong style={{ color: '#00ff41' }}>ONLINE</strong> with live telemetry.</div>
            </div>
          </div>
        </div>
      )}

      {/* STATS */}
      <div className="stats-grid">

        <div className="stat-card">
          <Activity size={24} />
          <div>
            <h4>Anomaly Score</h4>
            <p>{anomalyScore}%</p>
          </div>
        </div>

        <div className="stat-card">
          <ShieldAlert size={24} />
          <div>
            <h4>Threat Level</h4>
            <p>{anomalyScore > 70 ? 'HIGH' : anomalyScore > 40 ? 'MEDIUM' : 'LOW'}</p>
          </div>
        </div>

        <div className="stat-card">
          <Lock size={24} />
          <div>
            <h4>Files Protected</h4>
            <p>{filesProtected}</p>
          </div>
        </div>

        <div className="stat-card">
          <Wifi size={24} />
          <div>
            <h4>Active Connections</h4>
            <p>{netConns}</p>
          </div>
        </div>

      </div>

      {/* MAIN DASHBOARD LAYOUT GRID (Telemetry Chart) */}
      <div className="dashboard-grid-layout" style={{ marginTop: 24 }}>
        
        {/* REAL-TIME TELEMETRY CHART */}
        <div className="chart-container" style={{ marginTop: 0 }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={18} style={{ color: '#007CC3' }} /> Live System Anomaly Telemetry
          </h3>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={chartData}>
              <XAxis dataKey="name" hide />
              <YAxis />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="cpu"
                stroke="#007CC3"
                fill="#007CC3"
                fillOpacity={0.2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

      </div>

      {/* DOWNLOADABLE APP LIVE ANOMALOUS ACTIVITY STREAM */}
      <HostActivityList userId={userId} apiBase={apiBase} />

    </div>
  );
};

export default Dashboard;
