import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, ShieldAlert, Lock, Wifi, Printer } from 'lucide-react';
import OnionAgent from './OnionAgent';

const generateData = () =>
  Array.from({ length: 20 }, (_, i) => ({
    name: i,
    cpu: Math.floor(Math.random() * 50) + 10,
  }));

const Dashboard = ({ userId, apiBase = 'http://127.0.0.1:5000' }) => {
  const [detectorActive, setDetectorActive] = useState(false);
  const [chartData, setChartData] = useState(Array.from({ length: 20 }, (_, i) => ({ name: i, cpu: 0 })));
  const [anomalyScore, setAnomalyScore] = useState(0);
  const [netConns, setNetConns] = useState(0);

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
        const res = await fetch(`${apiBase}/api/admin/realtime-stats?user_id=${storedUserId}`);
        if (res.ok) {
          const data = await res.json();
          setChartData(data.chart_data);
          setAnomalyScore(data.anomaly_score);
          setNetConns(data.active_connections);
          setFilesProtected(data.files_protected);
        }
      } catch (err) {
        console.error("Error fetching realtime stats:", err);
      }
    };

    fetchRealtimeStats();
    const interval = setInterval(fetchRealtimeStats, 3000);

    return () => clearInterval(interval);
  }, [detectorActive, userId]);

  const handleDownloadDetector = () => {
    const token = localStorage.getItem("detector_token");
    if (!token) {
      alert("Detector token missing. Please login again.");
      return;
    }
    window.location.href = `${apiBase}/api/detector-download?token=${token}`;
  };

  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const generatePDF = async () => {
    try {
      setIsGeneratingPDF(true);
      const storedUserId = localStorage.getItem('userId') || userId || '';
      const url = `${apiBase}/api/admin/security-report${storedUserId ? `?user_id=${storedUserId}` : ''}`;
      const res = await fetch(url);
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
        marginBottom: 20
      }}>

        <button
          onClick={handleDownloadDetector}
          style={{
            background: 'rgba(0,124,195,0.15)',
            border: '1px solid rgba(0,124,195,0.4)',
            color: '#007CC3',
            padding: '6px 14px',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 600
          }}
        >
          ⬇ Download Detector
        </button>

        <button
          onClick={generatePDF}
          disabled={isGeneratingPDF}
          style={{
            background: isGeneratingPDF ? '#334155' : '#1e293b',
            border: '1px solid #334155',
            color: '#cbd5e1',
            padding: '6px 14px',
            borderRadius: 6,
            cursor: isGeneratingPDF ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <Printer size={16} /> {isGeneratingPDF ? 'Generating PDF...' : 'Generate Report'}
        </button>

      </div>

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

      {/* MAIN DASHBOARD LAYOUT GRID (Telemetry Chart + ONION AI Agent) */}
      <div className="dashboard-grid-layout" style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        
        {/* LEFT COLUMN: REAL-TIME TELEMETRY CHART */}
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

        {/* RIGHT COLUMN: ONION AI AGENT */}
        <div className="onion-container">
          <OnionAgent 
            userId={userId} 
            apiBase={apiBase} 
            onTriggerReport={generatePDF}
            onTriggerDetectorDownload={handleDownloadDetector}
          />
        </div>

      </div>

    </div>
  );
};

export default Dashboard;