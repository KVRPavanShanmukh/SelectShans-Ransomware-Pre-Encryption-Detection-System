import React, { useState, useRef } from 'react';
import { 
  Upload, ShieldAlert, ShieldCheck, FileText, CheckCircle2, 
  AlertTriangle, Hash, Cpu, Lock, Folder, X, RefreshCw, 
  HelpCircle, AlertCircle, Info, ChevronRight, FileCode
} from 'lucide-react';
import { API_URL } from '../config';

const formatBytes = (bytes) => {
  if (!bytes && bytes !== 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

const getVerdictBadge = (verdict) => {
  switch (verdict) {
    case 'MALICIOUS':
      return {
        label: 'MALICIOUS',
        color: '#ef4444',
        bg: 'rgba(239, 68, 68, 0.15)',
        border: 'rgba(239, 68, 68, 0.4)',
        icon: <ShieldAlert size={14} color="#ef4444" />
      };
    case 'SUSPICIOUS':
      return {
        label: 'SUSPICIOUS',
        color: '#f59e0b',
        bg: 'rgba(245, 158, 11, 0.15)',
        border: 'rgba(245, 158, 11, 0.4)',
        icon: <AlertTriangle size={14} color="#f59e0b" />
      };
    case 'CLEAN':
      return {
        label: 'CLEAN',
        color: '#10b981',
        bg: 'rgba(16, 185, 129, 0.15)',
        border: 'rgba(16, 185, 129, 0.4)',
        icon: <ShieldCheck size={14} color="#10b981" />
      };
    case 'UNKNOWN':
      return {
        label: 'UNKNOWN',
        color: '#94a3b8',
        bg: 'rgba(148, 163, 184, 0.15)',
        border: 'rgba(148, 163, 184, 0.4)',
        icon: <HelpCircle size={14} color="#94a3b8" />
      };
    case 'ERROR':
    default:
      return {
        label: 'ERROR',
        color: '#e11d48',
        bg: 'rgba(225, 29, 72, 0.15)',
        border: 'rgba(225, 29, 72, 0.4)',
        icon: <AlertCircle size={14} color="#e11d48" />
      };
  }
};

const MAX_FILES_LIMIT = 100;

const FileUploader = ({ jwtToken, onLogsUploaded }) => {
  const [selectedQueue, setSelectedQueue] = useState([]); // array of { file, relativePath, id, status: 'WAITING'|'SCANNING'|'COMPLETED'|'FAILED', result: null }
  const [isScanning, setIsScanning] = useState(false);
  const [overallWarning, setOverallWarning] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [activeFileId, setActiveFileId] = useState(null);
  const [folderSupportNotice, setFolderSupportNotice] = useState('');
  
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  // Helper to append new files into the queue avoiding duplicates by relativePath / name+size
  const addFilesToQueue = (fileList, isFromFolder = false) => {
    setOverallWarning('');
    const newItems = [];
    const existingKeys = new Set(selectedQueue.map(item => `${item.relativePath || item.file.name}_${item.file.size}`));

    let countAdded = 0;
    for (let i = 0; i < fileList.length; i++) {
      if (selectedQueue.length + countAdded >= MAX_FILES_LIMIT) {
        setOverallWarning(`Configured batch scan limit reached (Max ${MAX_FILES_LIMIT} files). Remaining items were skipped.`);
        break;
      }

      const f = fileList[i];
      // Extract relative path if directory scan
      const relPath = f.webkitRelativePath || f.name;
      const key = `${relPath}_${f.size}`;

      if (!existingKeys.has(key)) {
        existingKeys.add(key);
        newItems.push({
          id: `${Date.now()}_${Math.random().toString(36).substr(2, 7)}`,
          file: f,
          relativePath: relPath,
          status: 'WAITING',
          result: null
        });
        countAdded++;
      }
    }

    if (newItems.length > 0) {
      setSelectedQueue(prev => [...prev, ...newItems]);
      if (!activeFileId && newItems.length > 0) {
        setActiveFileId(newItems[0].id);
      }
    } else if (fileList.length > 0 && selectedQueue.length > 0) {
      setOverallWarning('Selected items are already in the analysis queue.');
    }
  };

  const handleFilesSelected = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToQueue(Array.from(e.target.files), false);
    }
    // reset input so user can re-select same file if desired
    e.target.value = '';
  };

  const handleFolderSelected = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToQueue(Array.from(e.target.files), true);
    } else {
      setFolderSupportNotice('No readable files found in the chosen folder.');
    }
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToQueue(Array.from(e.dataTransfer.files), false);
    }
  };

  const clearQueue = () => {
    if (isScanning) return;
    setSelectedQueue([]);
    setActiveFileId(null);
    setOverallWarning('');
    setFolderSupportNotice('');
  };

  const removeQueueItem = (id) => {
    if (isScanning) return;
    setSelectedQueue(prev => {
      const updated = prev.filter(item => item.id !== id);
      if (activeFileId === id) {
        setActiveFileId(updated.length > 0 ? updated[0].id : null);
      }
      return updated;
    });
  };

  // Analyze single file item with the backend API
  const analyzeSingleItem = async (item, token) => {
    const formData = new FormData();
    formData.append('file', item.file);
    if (item.relativePath) {
      formData.append('relative_path', item.relativePath);
    }

    const headers = {};
    if (token && token !== 'null' && token !== 'undefined') {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}/api/analyze-file`, {
      method: 'POST',
      headers: headers,
      body: formData
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      // Return structured error response preserving failure details
      return {
        filename: item.file.name,
        relative_path: item.relativePath,
        size: item.file.size,
        sha256: data.sha256 || null,
        entropy: data.entropy || null,
        risk_score: null,
        severity: 'HIGH',
        verdict: 'ERROR',
        indicators: [data.error || `Scan request failed with HTTP ${response.status}`],
        status: 'FAILED',
        error: data.error || `HTTP ${response.status}`
      };
    }

    return {
      ...data,
      filename: data.filename || item.file.name,
      relative_path: data.relative_path || item.relativePath,
      status: 'COMPLETED'
    };
  };

  // Run deep scan across every selected file in queue
  const startBatchAnalysis = async () => {
    const waitingItems = selectedQueue.filter(i => i.status === 'WAITING' || i.status === 'FAILED');
    if (waitingItems.length === 0) {
      if (selectedQueue.length === 0) {
        setOverallWarning('Please browse or drop files/folders before scanning.');
      } else {
        setOverallWarning('All selected files have already been analyzed.');
      }
      return;
    }

    setIsScanning(true);
    setOverallWarning('');

    const token = jwtToken || localStorage.getItem('jwtToken') || localStorage.getItem('token');
    let hasAlertTriggered = false;

    // Process files sequentially to show real progress and prevent client resource exhaustion
    for (let i = 0; i < selectedQueue.length; i++) {
      const currentItem = selectedQueue[i];
      if (currentItem.status === 'COMPLETED') continue;

      // Update status to SCANNING
      setSelectedQueue(prev => prev.map(item => 
        item.id === currentItem.id ? { ...item, status: 'SCANNING' } : item
      ));
      setActiveFileId(currentItem.id);

      try {
        const result = await analyzeSingleItem(currentItem, token);
        
        if (result.verdict === 'MALICIOUS' || (result.verdict === 'SUSPICIOUS' && result.risk_score >= 50)) {
          hasAlertTriggered = true;
        }

        setSelectedQueue(prev => prev.map(item => 
          item.id === currentItem.id 
            ? { 
                ...item, 
                status: result.verdict === 'ERROR' ? 'FAILED' : 'COMPLETED', 
                result: result 
              } 
            : item
        ));
      } catch (networkErr) {
        console.error('File scan network error:', networkErr);
        const errorResult = {
          filename: currentItem.file.name,
          relative_path: currentItem.relativePath,
          size: currentItem.file.size,
          sha256: null,
          entropy: null,
          risk_score: null,
          severity: 'HIGH',
          verdict: 'ERROR',
          indicators: [networkErr.message || 'Network communication error during analysis.'],
          status: 'FAILED',
          error: networkErr.message || 'Network failure'
        };

        setSelectedQueue(prev => prev.map(item => 
          item.id === currentItem.id 
            ? { ...item, status: 'FAILED', result: errorResult } 
            : item
        ));
      }
    }

    setIsScanning(false);
    if (hasAlertTriggered && onLogsUploaded) {
      onLogsUploaded();
    }
  };

  // Metrics calculation
  const totalCount = selectedQueue.length;
  const completedCount = selectedQueue.filter(i => i.status === 'COMPLETED').length;
  const failedCount = selectedQueue.filter(i => i.status === 'FAILED').length;
  const waitingCount = selectedQueue.filter(i => i.status === 'WAITING').length;
  const scanningCount = selectedQueue.filter(i => i.status === 'SCANNING').length;

  const maliciousCount = selectedQueue.filter(i => i.result?.verdict === 'MALICIOUS').length;
  const suspiciousCount = selectedQueue.filter(i => i.result?.verdict === 'SUSPICIOUS').length;
  const cleanCount = selectedQueue.filter(i => i.result?.verdict === 'CLEAN').length;
  const unknownCount = selectedQueue.filter(i => i.result?.verdict === 'UNKNOWN').length;

  const activeItem = selectedQueue.find(i => i.id === activeFileId) || selectedQueue[0] || null;
  const activeResult = activeItem?.result;

  return (
    <div className="uploader-container">
      {/* Upload Sandbox Box */}
      <div 
        className={`upload-box glass-effect ${isDragging ? 'dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        style={{
          border: isDragging ? '2px dashed #007CC3' : undefined,
          background: isDragging ? 'rgba(0, 124, 195, 0.08)' : undefined,
          transition: 'all 0.2s ease',
          maxWidth: 780,
          width: '100%'
        }}
      >
        <Upload size={48} color="#007CC3" />
        <h2>Threat Analysis Sandbox</h2>
        <p>
          Upload files or select entire directory folders for static signature,<br />
          Shannon entropy, extension disguise, and ransomware indicator scanning.
        </p>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFilesSelected}
          style={{ display: 'none' }}
        />

        {/* Hidden Folder Input (standard browser directory upload) */}
        <input
          ref={folderInputRef}
          type="file"
          webkitdirectory=""
          directory=""
          multiple
          onChange={handleFolderSelected}
          style={{ display: 'none' }}
        />

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 28, flexWrap: 'wrap' }}>
          <button 
            type="button"
            className="upload-btn" 
            onClick={() => fileInputRef.current?.click()}
            disabled={isScanning}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: isScanning ? 'not-allowed' : 'pointer' }}
          >
            <FileText size={14} /> Browse Files
          </button>

          <button 
            type="button"
            className="upload-btn" 
            onClick={() => folderInputRef.current?.click()}
            disabled={isScanning}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: isScanning ? 'not-allowed' : 'pointer', borderColor: 'rgba(0, 245, 255, 0.4)', color: 'var(--primary-bright)' }}
          >
            <Folder size={14} /> Scan Folder
          </button>

          <button
            type="button"
            className="upload-btn"
            onClick={startBatchAnalysis}
            disabled={isScanning || totalCount === 0 || (waitingCount === 0 && failedCount === 0)}
            style={{
              borderColor: totalCount === 0 ? '#334155' : '#007CC3',
              color: isScanning ? '#475569' : totalCount === 0 ? '#64748b' : '#007CC3',
              cursor: isScanning || totalCount === 0 ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 8,
              opacity: totalCount === 0 ? 0.6 : 1,
            }}
          >
            {isScanning ? (
              <><span className="spinner" /> Analyzing ({completedCount + failedCount}/{totalCount})…</>
            ) : (
              `Start Deep Scan ${waitingCount > 0 ? `(${waitingCount})` : ''}`
            )}
          </button>
        </div>

        {/* Browser Security & Folder Notice */}
        <div style={{ marginTop: 14, fontSize: '0.72rem', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Info size={13} color="#64748b" />
          <span>Browser sandbox security: Files are transmitted safely via standard web APIs without granting direct local drive execution access.</span>
        </div>

        {folderSupportNotice && (
          <p style={{ marginTop: 10, color: '#f59e0b', fontSize: '0.75rem', fontWeight: 600 }}>
            ℹ {folderSupportNotice}
          </p>
        )}

        {/* Overall Warning */}
        {overallWarning && (
          <p style={{ marginTop: 14, color: '#f59e0b', fontSize: '0.78rem', letterSpacing: 0.5, fontWeight: 700 }}>
            ⚠ {overallWarning}
          </p>
        )}
      </div>

      {/* Summary KPI Strip */}
      {totalCount > 0 && (
        <div style={{
          width: '100%',
          maxWidth: 780,
          marginTop: 20,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: 10,
        }}>
          <div className="card" style={{ padding: '12px 16px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Total Queued</span>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: 4, color: '#f8fafc' }}>{totalCount}</div>
          </div>
          <div className="card" style={{ padding: '12px 16px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Completed</span>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: 4, color: '#10b981' }}>{completedCount}</div>
          </div>
          <div className="card" style={{ padding: '12px 16px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Threats Found</span>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: 4, color: maliciousCount > 0 ? '#ef4444' : suspiciousCount > 0 ? '#f59e0b' : '#64748b' }}>
              {maliciousCount + suspiciousCount}
            </div>
          </div>
          <div className="card" style={{ padding: '12px 16px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Failed / Errors</span>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: 4, color: failedCount > 0 ? '#e11d48' : '#64748b' }}>{failedCount}</div>
          </div>
          <div className="card" style={{ padding: '12px 16px', textAlign: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Awaiting Scan</span>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: 4, color: '#007CC3' }}>{waitingCount}</div>
          </div>
        </div>
      )}

      {/* Main Multi-File Layout: Queue + Detailed Inspector */}
      {totalCount > 0 && (
        <div style={{ width: '100%', maxWidth: 780, marginTop: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
          
          {/* Analysis Queue Table */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p className="section-label" style={{ margin: 0 }}>
                Analysis Queue &amp; Batch Telemetry ({totalCount})
              </p>
              {!isScanning && (
                <button 
                  onClick={clearQueue}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#94a3b8',
                    padding: '3px 10px',
                    borderRadius: 4,
                    fontSize: '0.72rem',
                    cursor: 'pointer'
                  }}
                >
                  Clear Queue
                </button>
              )}
            </div>

            {/* Scrollable list */}
            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {selectedQueue.map((item) => {
                const isItemActive = activeFileId === item.id;
                const verdictBadge = item.result ? getVerdictBadge(item.result.verdict) : null;

                return (
                  <div 
                    key={item.id}
                    onClick={() => setActiveFileId(item.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: isItemActive ? 'rgba(0, 124, 195, 0.12)' : 'rgba(0,0,0,0.25)',
                      border: isItemActive ? '1px solid #007CC3' : '1px solid rgba(255,255,255,0.05)',
                      borderRadius: 4,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <FileCode size={16} color={isItemActive ? '#007CC3' : '#64748b'} style={{ flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontSize: '0.82rem',
                          fontWeight: isItemActive ? 600 : 400,
                          color: '#f8fafc',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {item.relativePath || item.file.name}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                          {formatBytes(item.file.size)}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      {item.status === 'SCANNING' && (
                        <span style={{ fontSize: '0.7rem', color: '#007CC3', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span className="spinner" style={{ width: 12, height: 12 }} /> SCANNING
                        </span>
                      )}

                      {item.status === 'WAITING' && (
                        <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                          READY
                        </span>
                      )}

                      {item.result && verdictBadge && (
                        <span style={{
                          background: verdictBadge.bg,
                          color: verdictBadge.color,
                          border: `1px solid ${verdictBadge.border}`,
                          padding: '2px 7px',
                          borderRadius: 3,
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}>
                          {verdictBadge.icon}
                          {verdictBadge.label}
                        </span>
                      )}

                      {!isScanning && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeQueueItem(item.id);
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#64748b',
                            cursor: 'pointer',
                            padding: '2px 4px'
                          }}
                          title="Remove from queue"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active File Inspection Report */}
          {activeItem && (
            <div 
              className="card scan-report"
              style={{
                borderLeftColor: activeResult 
                  ? getVerdictBadge(activeResult.verdict).color 
                  : '#007CC3',
                padding: '24px'
              }}
            >
              {activeResult ? (
                <div>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {getVerdictBadge(activeResult.verdict).icon}
                        <span style={{
                          fontSize: '1rem',
                          fontWeight: 700,
                          color: getVerdictBadge(activeResult.verdict).color,
                          letterSpacing: 0.5
                        }}>
                          Verdict: {activeResult.verdict}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 4 }}>
                        Target: <strong style={{ color: '#f8fafc' }}>{activeResult.relative_path || activeResult.filename}</strong>
                      </div>
                    </div>

                    <span style={{
                      background: getVerdictBadge(activeResult.verdict).bg,
                      color: getVerdictBadge(activeResult.verdict).color,
                      border: `1px solid ${getVerdictBadge(activeResult.verdict).border}`,
                      padding: '4px 10px',
                      borderRadius: 4,
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      letterSpacing: 1
                    }}>
                      {activeResult.severity || 'UNKNOWN'} SEVERITY
                    </span>
                  </div>

                  {/* Risk Score Meter (Displayed only when score is meaningful) */}
                  {activeResult.risk_score !== null && activeResult.risk_score !== undefined ? (
                    <div style={{ marginTop: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>Threat Anomaly Probability</span>
                        <span style={{ fontSize: '1.6rem', fontWeight: 800, color: getVerdictBadge(activeResult.verdict).color }}>
                          {activeResult.risk_score}%
                        </span>
                      </div>
                      <div className="score-meter" style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }}>
                        <div 
                          className="score-fill" 
                          style={{ 
                            width: `${activeResult.risk_score}%`, 
                            background: getVerdictBadge(activeResult.verdict).color, 
                            height: '100%', 
                            borderRadius: 4 
                          }} 
                        />
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 14, fontSize: '0.78rem', color: '#64748b' }}>
                      <em>Numerical risk score omitted for non-standard or failed payload assessment.</em>
                    </div>
                  )}

                  {/* Metadata telemetry grid */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 12,
                    marginTop: 18,
                    padding: '14px 16px',
                    background: 'rgba(0,0,0,0.25)',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.05)',
                    fontSize: '0.78rem'
                  }}>
                    <div>
                      <span style={{ color: '#64748b' }}>Entropy Level:</span>
                      <div style={{ color: '#f8fafc', fontWeight: 600, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Cpu size={13} color="#007CC3" /> 
                        {activeResult.entropy !== null && activeResult.entropy !== undefined ? `${activeResult.entropy} / 8.00` : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Payload Size:</span>
                      <div style={{ color: '#f8fafc', fontWeight: 600, marginTop: 3 }}>
                        {formatBytes(activeResult.size)}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Relative Scope:</span>
                      <div style={{ color: '#f8fafc', fontWeight: 600, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {activeResult.relative_path || activeResult.filename}
                      </div>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span style={{ color: '#64748b' }}>SHA-256 Checksum:</span>
                      <div style={{
                        color: '#94a3b8',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '0.72rem',
                        marginTop: 3,
                        wordBreak: 'break-all'
                      }}>
                        <Hash size={11} style={{ display: 'inline', marginRight: 4 }} />
                        {activeResult.sha256 || 'Unavailable'}
                      </div>
                    </div>
                  </div>

                  {/* Detection Findings & Indicators */}
                  <div style={{ marginTop: 18 }}>
                    <span style={{ fontSize: '0.8rem', color: '#cbd5e1', fontWeight: 600 }}>Findings &amp; Heuristic Indicators:</span>
                    <ul style={{ 
                      paddingLeft: 20, 
                      marginTop: 8, 
                      color: activeResult.verdict === 'MALICIOUS' ? '#fca5a5' : activeResult.verdict === 'SUSPICIOUS' ? '#fde68a' : '#94a3b8', 
                      fontSize: '0.8rem', 
                      lineHeight: 1.8 
                    }}>
                      {activeResult.indicators && activeResult.indicators.length > 0 ? (
                        activeResult.indicators.map((ind, idx) => (
                          <li key={idx}>
                            {activeResult.verdict === 'MALICIOUS' ? '🚨 ' : activeResult.verdict === 'SUSPICIOUS' ? '⚠ ' : '• '}
                            {ind}
                          </li>
                        ))
                      ) : (
                        <li>No specific anomaly signatures triggered during static inspection.</li>
                      )}
                    </ul>
                  </div>

                  {/* Isolation Policy Label (Clear, genuine labeling) */}
                  <div style={{
                    marginTop: 20,
                    padding: '10px 14px',
                    borderRadius: 6,
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.07)',
                    fontSize: '0.76rem',
                    color: '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                    <Lock size={14} color="#64748b" />
                    <span>
                      <strong>Containment Status:</strong> Static sandbox analysis runs safely in isolation. Host system quarantine requires the host-level FolderGuard / WPF service agent.
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '24px 10px', color: '#64748b' }}>
                  <p style={{ margin: 0, fontSize: '0.85rem' }}>
                    Selected file: <strong style={{ color: '#cbd5e1' }}>{activeItem.relativePath || activeItem.file.name}</strong> ({formatBytes(activeItem.file.size)})
                  </p>
                  <p style={{ margin: '8px 0 0 0', fontSize: '0.75rem' }}>
                    Click <strong>"Start Deep Scan"</strong> above to execute static analysis and view threat intelligence.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FileUploader;
