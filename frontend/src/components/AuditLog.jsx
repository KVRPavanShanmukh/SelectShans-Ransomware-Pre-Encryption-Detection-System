import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Download, FileText, File, Calendar, MapPin, Activity, RefreshCw } from 'lucide-react';

const AuditLog = ({ userId, apiBase = 'http://127.0.0.1:5000', onBack }) => {
    const [exportFormat, setExportFormat] = useState('pdf'); // 'pdf' or 'txt'
    const [downloading, setDownloading] = useState(false);
    const [logs, setLogs] = useState([]);
    const [loadingLogs, setLoadingLogs] = useState(true);
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState('success');
    const messageTimeoutRef = useRef(null);

    useEffect(() => {
        fetchAuditLogs();
    }, [userId]);

    useEffect(() => {
        if (message) {
            if (messageTimeoutRef.current) {
                clearTimeout(messageTimeoutRef.current);
            }
            messageTimeoutRef.current = setTimeout(() => {
                setMessage('');
                setMessageType('success');
            }, 4000);
        }
        return () => {
            if (messageTimeoutRef.current) {
                clearTimeout(messageTimeoutRef.current);
            }
        };
    }, [message]);

    const fetchAuditLogs = async () => {
        setLoadingLogs(true);
        try {
            const response = await fetch(`${apiBase}/api/admin/audit-log?user_id=${userId || ''}&format=json`);
            if (response.ok) {
                const data = await response.json();
                setLogs(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error('Error fetching audit logs:', error);
        } finally {
            setLoadingLogs(false);
        }
    };

    const handleDownload = async () => {
        setDownloading(true);
        try {
            const url = `${apiBase}/api/admin/audit-log?user_id=${userId || ''}&format=${exportFormat}`;
            const response = await fetch(url);

            if (response.ok) {
                const blob = await response.blob();
                const downloadUrl = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                
                const ext = exportFormat === 'pdf' ? 'pdf' : 'txt';
                a.download = `SelectShans_AuditLog_${new Date().toISOString().slice(0, 10)}.${ext}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(downloadUrl);

                setMessage(`Audit log successfully exported as ${exportFormat.toUpperCase()}`);
                setMessageType('success');
            } else {
                setMessage('Failed to download audit log');
                setMessageType('error');
            }
        } catch (error) {
            console.error('Error downloading audit log:', error);
            setMessage('Error downloading audit log: ' + error.message);
            setMessageType('error');
        } finally {
            setDownloading(false);
        }
    };

    const formatTimestamp = (ts) => {
        if (!ts) return { date: 'N/A', time: 'N/A' };
        try {
            const d = new Date(ts);
            return {
                date: d.toISOString().slice(0, 10),
                time: d.toTimeString().slice(0, 8) + ' UTC'
            };
        } catch {
            return { date: String(ts).slice(0, 10), time: String(ts).slice(11, 19) };
        }
    };

    return (
        <div className="dashboard-wrapper">
            {message && (
                <div style={{
                    position: 'fixed',
                    top: 20,
                    right: 20,
                    background: messageType === 'success' ? '#10b981' : '#ef4444',
                    color: '#fff',
                    padding: '12px 20px',
                    borderRadius: 6,
                    zIndex: 1000,
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.85rem',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                }}>
                    {message}
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* EXPORT OPTIONS CARD */}
                <div className="card" style={{ background: 'rgba(5, 10, 14, 0.95)', border: '1px solid rgba(0, 124, 195, 0.3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <button
                                onClick={onBack}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#007CC3',
                                    cursor: 'pointer',
                                    padding: 0,
                                    display: 'flex',
                                    alignItems: 'center'
                                }}
                            >
                                <ArrowLeft size={22} />
                            </button>
                            <h2 style={{ fontSize: '1.2rem', color: '#f8fafc', margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>
                                SOC Audit Logs Export
                            </h2>
                        </div>

                        <button
                            onClick={fetchAuditLogs}
                            disabled={loadingLogs}
                            style={{
                                background: 'transparent',
                                border: '1px solid rgba(0,124,195,0.4)',
                                color: '#007CC3',
                                padding: '6px 12px',
                                borderRadius: 4,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: '0.78rem',
                                fontFamily: 'JetBrains Mono, monospace'
                            }}
                        >
                            <RefreshCw size={14} className={loadingLogs ? 'spin' : ''} /> Refresh Logs
                        </button>
                    </div>

                    <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: 20, lineHeight: 1.5 }}>
                        Select your preferred export format to generate a readable, complete audit record containing exact <strong>Date</strong>, <strong>Time</strong>, <strong>Place/IP Location</strong>, and <strong>Action Details</strong>.
                    </p>

                    {/* FORMAT SELECTION PILLS / CARDS */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

                        {/* PDF OPTION */}
                        <div
                            onClick={() => setExportFormat('pdf')}
                            style={{
                                background: exportFormat === 'pdf' ? 'rgba(0, 124, 195, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                                border: exportFormat === 'pdf' ? '2px solid #007CC3' : '1px solid #334155',
                                borderRadius: 8,
                                padding: 18,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 14,
                                transition: 'all 0.2s ease',
                                boxShadow: exportFormat === 'pdf' ? '0 0 15px rgba(0, 124, 195, 0.2)' : 'none'
                            }}
                        >
                            <div style={{ width: 42, height: 42, borderRadius: 8, background: 'rgba(0, 124, 195, 0.2)', color: '#007CC3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FileText size={24} />
                            </div>
                            <div>
                                <h4 style={{ margin: 0, color: '#f8fafc', fontSize: '0.95rem', fontFamily: 'JetBrains Mono, monospace' }}>PDF Document (.pdf)</h4>
                                <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '0.78rem' }}>Formatted document report with metadata & event tables.</p>
                            </div>
                        </div>

                        {/* TXT OPTION */}
                        <div
                            onClick={() => setExportFormat('txt')}
                            style={{
                                background: exportFormat === 'txt' ? 'rgba(0, 255, 65, 0.15)' : 'rgba(15, 23, 42, 0.6)',
                                border: exportFormat === 'txt' ? '2px solid #00FF41' : '1px solid #334155',
                                borderRadius: 8,
                                padding: 18,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 14,
                                transition: 'all 0.2s ease',
                                boxShadow: exportFormat === 'txt' ? '0 0 15px rgba(0, 255, 65, 0.15)' : 'none'
                            }}
                        >
                            <div style={{ width: 42, height: 42, borderRadius: 8, background: 'rgba(0, 255, 65, 0.2)', color: '#00FF41', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <File size={24} />
                            </div>
                            <div>
                                <h4 style={{ margin: 0, color: '#f8fafc', fontSize: '0.95rem', fontFamily: 'JetBrains Mono, monospace' }}>Plain Text (.txt)</h4>
                                <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '0.78rem' }}>Structured plain text log file with date/time stamps.</p>
                            </div>
                        </div>

                    </div>

                    {/* DOWNLOAD BUTTON */}
                    <button
                        onClick={handleDownload}
                        disabled={downloading}
                        style={{
                            width: '100%',
                            background: exportFormat === 'pdf' ? '#007CC3' : '#00FF41',
                            color: exportFormat === 'pdf' ? '#ffffff' : '#000000',
                            border: 'none',
                            padding: '14px',
                            borderRadius: 6,
                            cursor: downloading ? 'not-allowed' : 'pointer',
                            fontWeight: 800,
                            fontSize: '0.95rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 10,
                            fontFamily: 'JetBrains Mono, monospace',
                            letterSpacing: 1,
                            transition: 'all 0.2s',
                            opacity: downloading ? 0.6 : 1
                        }}
                    >
                        <Download size={20} />
                        {downloading ? `Generating ${exportFormat.toUpperCase()}...` : `Download Audit Log as ${exportFormat.toUpperCase()}`}
                    </button>
                </div>

                {/* LIVE AUDIT LOG PREVIEW TABLE */}
                <div className="card" style={{ background: 'rgba(5, 10, 14, 0.95)', border: '1px solid rgba(0, 124, 195, 0.3)' }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: '#f8fafc', fontFamily: 'JetBrains Mono, monospace', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Activity size={18} style={{ color: '#007CC3' }} /> Live Audit Log Inspection ({logs.length} events)
                    </h3>

                    {loadingLogs ? (
                        <p style={{ color: '#64748b', textAlign: 'center', padding: '30px' }}>Loading live audit logs...</p>
                    ) : logs.length === 0 ? (
                        <p style={{ color: '#64748b', textAlign: 'center', padding: '30px' }}>No audit log records found.</p>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', fontFamily: 'JetBrains Mono, monospace' }}>
                                <thead>
                                    <tr style={{ background: '#0f172a', color: '#007CC3', textAlign: 'left', borderBottom: '1px solid #334155' }}>
                                        <th style={{ padding: '10px 12px' }}>Date</th>
                                        <th style={{ padding: '10px 12px' }}>Time</th>
                                        <th style={{ padding: '10px 12px' }}>Place / IP Location</th>
                                        <th style={{ padding: '10px 12px' }}>Action</th>
                                        <th style={{ padding: '10px 12px' }}>Event Description</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.slice(0, 50).map((log, i) => {
                                        const ts = formatTimestamp(log.timestamp);
                                        const placeStr = (!log.ip_address || log.ip_address === '127.0.0.1') ? '127.0.0.1 (Local SOC Station)' : `${log.ip_address} (Remote Node)`;
                                        return (
                                            <tr key={log.id || i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'transparent' : 'rgba(15, 23, 42, 0.4)' }}>
                                                <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{ts.date}</td>
                                                <td style={{ padding: '8px 12px', color: '#00FF41' }}>{ts.time}</td>
                                                <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>{placeStr}</td>
                                                <td style={{ padding: '8px 12px', color: '#38bdf8', fontWeight: 600 }}>{log.action}</td>
                                                <td style={{ padding: '8px 12px', color: '#e2e8f0' }}>{log.description || 'N/A'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default AuditLog;
