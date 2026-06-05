import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Download, Activity } from 'lucide-react';

const SystemHealth = ({ userId, apiBase = 'http://127.0.0.1:5000', onBack }) => {
    const [downloading, setDownloading] = useState(false);
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState('success');
    const messageTimeoutRef = useRef(null);

    useEffect(() => {
        // Auto-fade message after 4 seconds
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

    // Mock health data - in a real app, this would come from the backend
    const healthData = {
        cpu_usage: 45.2,
        memory_usage: 62.5,
        disk_usage: 78.3,
        active_processes: 127,
        active_alerts: 3,
        threat_level: 'MEDIUM',
        health_score: 72
    };

    const getHealthStatus = (score) => {
        if (score >= 80) return { text: 'Excellent', color: '#10b981' };
        if (score >= 60) return { text: 'Good', color: '#007CC3' };
        if (score >= 40) return { text: 'Fair', color: '#f59e0b' };
        return { text: 'Poor', color: '#ef4444' };
    };

    const getThreatColor = (level) => {
        switch(level.toUpperCase()) {
            case 'LOW': return '#10b981';
            case 'MEDIUM': return '#f59e0b';
            case 'HIGH': return '#ef4444';
            case 'CRITICAL': return '#dc2626';
            default: return '#64748b';
        }
    };

    const handleDownloadPDF = async () => {
        setDownloading(true);
        try {
            const response = await fetch(`${apiBase}/api/admin/system-health?user_id=${userId}`);

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'system_health_report.pdf';
                a.click();
                window.URL.revokeObjectURL(url);
                setMessage('Health report downloaded successfully');
                setMessageType('success');
            } else {
                setMessage('Failed to download report');
                setMessageType('error');
            }
        } catch (error) {
            console.error('Error downloading report:', error);
            setMessage('Error downloading report');
            setMessageType('error');
        } finally {
            setDownloading(false);
        }
    };

    const healthStatus = getHealthStatus(healthData.health_score);

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
                    borderRadius: 4,
                    zIndex: 1000,
                    animation: 'fadeInOut 4s ease-in-out forwards',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                }}>
                    <style>{`
                        @keyframes fadeInOut {
                            0% { opacity: 1; transform: translateY(0); }
                            85% { opacity: 1; transform: translateY(0); }
                            100% { opacity: 0; transform: translateY(-10px); }
                        }
                    `}</style>
                    {message}
                </div>
            )}

            <div className="card" style={{ maxWidth: 700, margin: '0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
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
                            <ArrowLeft size={24} />
                        </button>
                        <h2 style={{ fontSize: '1.2rem', color: '#f8fafc', margin: 0 }}>System Health Report</h2>
                    </div>
                    <button
                        onClick={handleDownloadPDF}
                        disabled={downloading}
                        style={{
                            background: '#007CC3',
                            color: '#fff',
                            border: 'none',
                            padding: '8px 16px',
                            borderRadius: 4,
                            cursor: downloading ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            opacity: downloading ? 0.6 : 1
                        }}
                    >
                        <Download size={16} />
                        {downloading ? 'Generating...' : 'Download PDF'}
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {/* Overall Health Score */}
                    <div style={{
                        background: 'rgba(0,0,0,0.3)',
                        padding: 24,
                        borderRadius: 8,
                        textAlign: 'center',
                        border: `2px solid ${healthStatus.color}`
                    }}>
                        <div style={{ marginBottom: 12 }}>
                            <Activity size={48} color={healthStatus.color} style={{ margin: '0 auto' }} />
                        </div>
                        <h3 style={{ fontSize: '2.5rem', color: healthStatus.color, margin: '12px 0' }}>
                            {healthData.health_score}/100
                        </h3>
                        <p style={{ fontSize: '1.1rem', color: '#e2e8f0', margin: '8px 0 0 0' }}>
                            Status: <span style={{ color: healthStatus.color, fontWeight: 600 }}>{healthStatus.text}</span>
                        </p>
                    </div>

                    {/* System Metrics */}
                    <div>
                        <h3 style={{ color: '#e2e8f0', marginBottom: 16, fontSize: '1rem' }}>System Metrics</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                            {/* CPU Usage */}
                            <div style={{
                                background: 'rgba(0,0,0,0.2)',
                                padding: 16,
                                borderRadius: 8,
                                border: '1px solid #334155'
                            }}>
                                <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: 8 }}>CPU Usage</p>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                    <h4 style={{ fontSize: '1.8rem', color: '#e2e8f0', margin: 0 }}>
                                        {healthData.cpu_usage}%
                                    </h4>
                                    <span style={{
                                        background: healthData.cpu_usage < 80 ? '#10b981' : '#f59e0b',
                                        color: '#fff',
                                        padding: '2px 8px',
                                        borderRadius: 3,
                                        fontSize: '0.75rem',
                                        fontWeight: 600
                                    }}>
                                        {healthData.cpu_usage < 80 ? 'Normal' : 'High'}
                                    </span>
                                </div>
                            </div>

                            {/* Memory Usage */}
                            <div style={{
                                background: 'rgba(0,0,0,0.2)',
                                padding: 16,
                                borderRadius: 8,
                                border: '1px solid #334155'
                            }}>
                                <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: 8 }}>Memory Usage</p>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                    <h4 style={{ fontSize: '1.8rem', color: '#e2e8f0', margin: 0 }}>
                                        {healthData.memory_usage}%
                                    </h4>
                                    <span style={{
                                        background: healthData.memory_usage < 85 ? '#10b981' : '#f59e0b',
                                        color: '#fff',
                                        padding: '2px 8px',
                                        borderRadius: 3,
                                        fontSize: '0.75rem',
                                        fontWeight: 600
                                    }}>
                                        {healthData.memory_usage < 85 ? 'Normal' : 'High'}
                                    </span>
                                </div>
                            </div>

                            {/* Disk Usage */}
                            <div style={{
                                background: 'rgba(0,0,0,0.2)',
                                padding: 16,
                                borderRadius: 8,
                                border: '1px solid #334155'
                            }}>
                                <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: 8 }}>Disk Usage</p>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                    <h4 style={{ fontSize: '1.8rem', color: '#e2e8f0', margin: 0 }}>
                                        {healthData.disk_usage}%
                                    </h4>
                                    <span style={{
                                        background: healthData.disk_usage < 90 ? '#10b981' : '#ef4444',
                                        color: '#fff',
                                        padding: '2px 8px',
                                        borderRadius: 3,
                                        fontSize: '0.75rem',
                                        fontWeight: 600
                                    }}>
                                        {healthData.disk_usage < 90 ? 'Normal' : 'Critical'}
                                    </span>
                                </div>
                            </div>

                            {/* Active Processes */}
                            <div style={{
                                background: 'rgba(0,0,0,0.2)',
                                padding: 16,
                                borderRadius: 8,
                                border: '1px solid #334155'
                            }}>
                                <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: 8 }}>Active Processes</p>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                    <h4 style={{ fontSize: '1.8rem', color: '#e2e8f0', margin: 0 }}>
                                        {healthData.active_processes}
                                    </h4>
                                    <span style={{
                                        background: '#007CC3',
                                        color: '#fff',
                                        padding: '2px 8px',
                                        borderRadius: 3,
                                        fontSize: '0.75rem',
                                        fontWeight: 600
                                    }}>
                                        Normal
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Security Metrics */}
                    <div>
                        <h3 style={{ color: '#e2e8f0', marginBottom: 16, fontSize: '1rem' }}>Security Metrics</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                            {/* Active Alerts */}
                            <div style={{
                                background: 'rgba(0,0,0,0.2)',
                                padding: 16,
                                borderRadius: 8,
                                border: '1px solid #334155'
                            }}>
                                <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: 8 }}>Active Alerts</p>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                    <h4 style={{ fontSize: '1.8rem', color: '#e2e8f0', margin: 0 }}>
                                        {healthData.active_alerts}
                                    </h4>
                                    <span style={{
                                        background: healthData.active_alerts < 5 ? '#10b981' : '#ef4444',
                                        color: '#fff',
                                        padding: '2px 8px',
                                        borderRadius: 3,
                                        fontSize: '0.75rem',
                                        fontWeight: 600
                                    }}>
                                        {healthData.active_alerts < 5 ? 'Safe' : 'Warning'}
                                    </span>
                                </div>
                            </div>

                            {/* Threat Level */}
                            <div style={{
                                background: 'rgba(0,0,0,0.2)',
                                padding: 16,
                                borderRadius: 8,
                                border: '1px solid #334155'
                            }}>
                                <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: 8 }}>Threat Level</p>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                    <h4 style={{ fontSize: '1.5rem', color: getThreatColor(healthData.threat_level), margin: 0 }}>
                                        {healthData.threat_level}
                                    </h4>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Recommendations */}
                    <div style={{
                        background: 'rgba(7, 124, 195, 0.1)',
                        border: '1px solid rgba(7, 124, 195, 0.3)',
                        padding: 16,
                        borderRadius: 8
                    }}>
                        <h4 style={{ color: '#007CC3', marginTop: 0, marginBottom: 8 }}>Recommendations</h4>
                        <ul style={{ margin: 0, paddingLeft: 20, color: '#94a3b8', fontSize: '0.9rem' }}>
                            <li style={{ marginBottom: 4 }}>Monitor disk usage closely as it's above 75%</li>
                            <li style={{ marginBottom: 4 }}>Review and address active alerts</li>
                            <li>Keep system patches and signatures up to date</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SystemHealth;
