import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Download, Lock } from 'lucide-react';

const AuditLog = ({ userId, apiBase = 'http://127.0.0.1:5000', onBack }) => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
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

    const handleDownload = async () => {
        if (!password) {
            setMessage('Please enter a password');
            setMessageType('error');
            return;
        }

        if (password !== confirmPassword) {
            setMessage('Passwords do not match');
            setMessageType('error');
            return;
        }

        setDownloading(true);
        try {
            const response = await fetch(
                `${apiBase}/api/admin/audit-log?user_id=${userId}&password=${encodeURIComponent(password)}`
            );

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = response.headers.get('Content-Disposition')?.split('filename=')[1] || 'audit_log.enc';
                a.click();
                window.URL.revokeObjectURL(url);
                setMessage('Audit log downloaded successfully');
                setMessageType('success');
            } else {
                setMessage('Failed to download audit log');
                setMessageType('error');
            }
        } catch (error) {
            console.error('Error downloading audit log:', error);
            setMessage('Error downloading audit log');
            setMessageType('error');
        } finally {
            setDownloading(false);
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

            <div className="card" style={{ maxWidth: 600, margin: '0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
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
                    <h2 style={{ fontSize: '1.2rem', color: '#f8fafc', margin: 0 }}>View Audit Log</h2>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <div style={{ 
                        background: 'rgba(7, 124, 195, 0.1)', 
                        border: '1px solid rgba(7, 124, 195, 0.3)',
                        padding: 16,
                        borderRadius: 8
                    }}>
                        <h3 style={{ color: '#007CC3', fontSize: '0.9rem', marginTop: 0, marginBottom: 8 }}>
                            ℹ Encrypted Download
                        </h3>
                        <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>
                            Your audit log will be encrypted with a password for secure download. Set a strong password and keep it safe - you'll need it to decrypt the file later.
                        </p>
                    </div>

                    <div>
                        <label style={{ display: 'block', color: '#e2e8f0', marginBottom: 8, fontWeight: 600, fontSize: '0.9rem' }}>
                            Encryption Password
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter a strong password"
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                background: '#1e293b',
                                border: '1px solid #334155',
                                color: '#e2e8f0',
                                borderRadius: 4,
                                outline: 'none',
                                fontSize: '0.9rem',
                                boxSizing: 'border-box',
                                transition: 'border-color 0.2s'
                            }}
                            onFocus={(e) => e.target.style.borderColor = '#007CC3'}
                            onBlur={(e) => e.target.style.borderColor = '#334155'}
                        />
                        <p style={{ color: '#64748b', fontSize: '0.8rem', marginTop: 4, margin: '4px 0 0 0' }}>
                            Use a mix of uppercase, lowercase, numbers, and symbols for security
                        </p>
                    </div>

                    <div>
                        <label style={{ display: 'block', color: '#e2e8f0', marginBottom: 8, fontWeight: 600, fontSize: '0.9rem' }}>
                            Confirm Password
                        </label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Confirm your password"
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                background: '#1e293b',
                                border: '1px solid #334155',
                                color: '#e2e8f0',
                                borderRadius: 4,
                                outline: 'none',
                                fontSize: '0.9rem',
                                boxSizing: 'border-box',
                                transition: 'border-color 0.2s'
                            }}
                            onFocus={(e) => e.target.style.borderColor = '#007CC3'}
                            onBlur={(e) => e.target.style.borderColor = '#334155'}
                        />
                    </div>

                    <div style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        padding: 12,
                        borderRadius: 4
                    }}>
                        <p style={{ color: '#fca5a5', fontSize: '0.8rem', margin: 0 }}>
                            ⚠ Important: Keep your password safe. You cannot decrypt the audit log without it.
                        </p>
                    </div>

                    <button
                        onClick={handleDownload}
                        disabled={downloading || !password || !confirmPassword}
                        style={{
                            background: password && confirmPassword && !downloading ? '#007CC3' : '#334155',
                            color: '#fff',
                            border: 'none',
                            padding: '12px 24px',
                            borderRadius: 4,
                            cursor: (password && confirmPassword && !downloading) ? 'pointer' : 'not-allowed',
                            fontWeight: 600,
                            fontSize: '0.95rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            opacity: (password && confirmPassword && !downloading) ? 1 : 0.6,
                            transition: 'all 0.2s'
                        }}
                    >
                        <Download size={18} />
                        {downloading ? 'Downloading...' : 'Download Encrypted Audit Log'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AuditLog;
