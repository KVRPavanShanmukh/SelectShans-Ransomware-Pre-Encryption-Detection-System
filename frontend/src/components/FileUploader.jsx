import React, { useState } from 'react';
import { Upload, ShieldAlert, ShieldCheck, FileText } from 'lucide-react';

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

const FileUploader = ({ onLogsUploaded }) => {
  const [files, setFiles] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [warning, setWarning] = useState('');

  const handleFileChange = (e) => {
    const uploaded = Array.from(e.target.files);
    setFiles(uploaded);
    setScanResult(null);
    setWarning('');
  };

  const startAnalysis = async () => {
    if (files.length === 0) {
      setWarning('SELECT FILES BEFORE SCANNING');
      return;
    }
    setIsScanning(true);
    setScanResult(null);
    setWarning('');

    try {
      const formData = new FormData();
      formData.append('file', files[0]); // Analyze first file for now

      const token = localStorage.getItem('token');
      const response = await fetch('/api/analyze-file', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error('Analysis request failed');
      }

      const data = await response.json();
      const verdict = data.severity === 'HIGH' || data.severity === 'CRITICAL' ? 'threat' : 'safe';

      setScanResult({
        verdict: verdict,
        status: verdict === 'threat' ? 'Anomaly Detected' : 'No Threats Detected',
        score: data.risk_score,
        threats: data.indicators || [],
      });

      if (onLogsUploaded) onLogsUploaded();
    } catch (err) {
      console.error(err);
      setWarning('ANALYSIS FAILED. PLEASE TRY AGAIN.');
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="uploader-container">
      <div className="upload-box glass-effect">
        <Upload size={48} color="#007CC3" />
        <h2>Threat Analysis Sandbox</h2>
        <p>Upload .evtx logs, .csv exports, or binaries<br />for behavioral anomaly scanning</p>

        <input
          type="file"
          multiple
          onChange={handleFileChange}
          id="fileInput"
          style={{ display: 'none' }}
        />

        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 28, flexWrap: 'wrap' }}>
          <label htmlFor="fileInput" className="upload-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <FileText size={14} /> Browse Files
          </label>

          <button
            className="upload-btn"
            onClick={startAnalysis}
            disabled={isScanning}
            style={{
              borderColor: '#007CC3',
              color: isScanning ? '#475569' : '#007CC3',
              cursor: isScanning ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
          >
            {isScanning ? (
              <><span className="spinner" />Correlating…</>
            ) : (
              'Start Deep Scan'
            )}
          </button>
        </div>

        {/* Inline warning */}
        {warning && (
          <p style={{ marginTop: 16, color: '#f59e0b', fontSize: '0.72rem', letterSpacing: 2, fontWeight: 700, textTransform: 'uppercase' }}>
            ⚠ {warning}
          </p>
        )}
      </div>

      <div style={{ marginTop: 32, width: '100%', maxWidth: 680 }}>
        {/* Analysis Queue */}
        {files.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <p className="section-label">Analysis Queue</p>
            <div style={{ marginTop: 16 }}>
              {files.map((file, i) => (
                <div key={i} className="file-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <FileText size={16} color="#94a3b8" />
                    <span style={{ fontSize: '0.85rem' }}>{file.name}</span>
                    <span style={{ fontSize: '0.72rem', color: '#475569' }}>({formatBytes(file.size)})</span>
                  </div>
                  <span className="status">
                    {isScanning ? 'SCANNING' : 'READY'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Scan Report */}
        {scanResult && (
          <div
            className="card scan-report"
            style={{ borderLeftColor: scanResult.verdict === 'threat' ? '#ef4444' : '#10b981' }}
          >
            {scanResult.verdict === 'threat' ? (
              <>
                <p className="section-label" style={{ color: '#ef4444' }}>
                  <ShieldAlert size={14} /> Threat Report
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '16px 0' }}>
                  <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>Threat Probability</span>
                  <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#ef4444' }}>{scanResult.score}%</span>
                </div>
                <div className="score-meter">
                  <div className="score-fill" style={{ width: `${scanResult.score}%`, background: '#ef4444' }} />
                </div>
                <ul style={{ paddingLeft: 20, marginTop: 16, color: '#94a3b8', fontSize: '0.82rem', lineHeight: 2 }}>
                  {scanResult.threats.map((t, i) => <li key={i}>⚠ {t}</li>)}
                </ul>
                <button className="btn-danger" style={{ marginTop: 20 }}>
                  <span>Isolate System</span>
                </button>
              </>
            ) : (
              <>
                <p className="section-label" style={{ color: '#10b981' }}>
                  <ShieldCheck size={14} /> No Threats Detected
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '16px 0' }}>
                  <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>Threat Probability</span>
                  <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#10b981' }}>{scanResult.score}%</span>
                </div>
                <div className="score-meter">
                  <div className="score-fill" style={{ width: `${scanResult.score}%`, background: '#10b981' }} />
                </div>
                <p style={{ color: '#6ee7b7', fontSize: '0.82rem', marginTop: 16, letterSpacing: 0.5 }}>
                  ✓ Files analysed. No ransomware pre-encryption signatures found.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUploader;
