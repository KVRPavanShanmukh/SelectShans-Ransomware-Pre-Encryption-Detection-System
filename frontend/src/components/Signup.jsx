import React, { useState } from 'react';
import { User, Mail, Lock, ShieldCheck } from 'lucide-react';

const SECURITY_QUESTIONS = [
    'What is the Event ID for FileCreate in Sysmon?',
    'What algorithm does this system use for file traversal?',
    'What does PRD stand for in SelectShans?',
    'What encryption standard is simulated in the lab?',
];

const Signup = ({ onSignupSuccess, onSwitchToLogin }) => {
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        sec_q: SECURITY_QUESTIONS[0],
        sec_a: ''
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSignup = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // Pointing to the new Flask backend port 5000
            const response = await fetch('http://127.0.0.1:5000/api/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
            });

            const data = await response.json();

            if (response.ok) {
                onSignupSuccess();
            } else {
                setError(data.error || 'Signup failed');
            }
        } catch (err) {
            setError('Connection to security server failed.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-overlay">
            <div className="login-card" style={{ maxWidth: 450 }}>
                {/* Header */}
                <div className="login-header" style={{ marginBottom: 24 }}>
                    <div className="shield-pulse">
                        <ShieldCheck size={48} color="var(--primary-bright)" />
                    </div>
                    <h2>SelectShans REGISTRATION</h2>
                    <p>Request Analyst Access</p>
                </div>

                <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="input-group">
                        <User size={16} />
                        <input
                            type="text"
                            placeholder="Desired Username"
                            value={formData.username}
                            onChange={e => setFormData({ ...formData, username: e.target.value })}
                            required
                        />
                    </div>

                    <div className="input-group">
                        <Mail size={16} />
                        <input
                            type="email"
                            placeholder="Corporate Email"
                            value={formData.email}
                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                            required
                        />
                    </div>

                    <div className="input-group">
                        <Lock size={16} />
                        <input
                            type="password"
                            placeholder="Secure Password"
                            value={formData.password}
                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                            required
                        />
                    </div>

                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', border: '1px solid rgba(0, 255, 65, 0.1)' }}>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 8, fontFamily: 'JetBrains Mono, monospace' }}>
                            SECURITY CLEARANCE QUESTION:
                        </p>
                        <select
                            value={formData.sec_q}
                            onChange={e => setFormData({ ...formData, sec_q: e.target.value })}
                            style={{
                                width: '100%',
                                background: 'transparent',
                                color: 'var(--text-primary)',
                                border: 'none',
                                outline: 'none',
                                marginBottom: 12,
                                cursor: 'pointer',
                                fontFamily: 'Inter, sans-serif',
                                fontSize: '0.85rem'
                            }}
                        >
                            {SECURITY_QUESTIONS.map((q, i) => (
                                <option key={i} value={q} style={{ background: '#0a0a0a' }}>{q}</option>
                            ))}
                        </select>

                        <input
                            type="text"
                            placeholder="Your Answer"
                            value={formData.sec_a}
                            onChange={e => setFormData({ ...formData, sec_a: e.target.value })}
                            required
                            style={{
                                width: '100%',
                                background: 'rgba(0,255,65,0.05)',
                                border: '1px solid rgba(0,255,65,0.2)',
                                color: 'var(--primary-bright)',
                                padding: '8px 12px',
                                outline: 'none',
                                fontFamily: 'JetBrains Mono, monospace',
                                fontSize: '0.8rem'
                            }}
                        />
                    </div>

                    {error && <div className="login-error">{error}</div>}

                    <button type="submit" className="login-btn" disabled={loading} style={{ marginTop: 8 }}>
                        <span>{loading ? 'INITIALIZING...' : 'REQUEST ACCESS'}</span>
                    </button>
                </form>

                <p style={{ textAlign: 'center', marginTop: 24, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Already have clearance? <span onClick={onSwitchToLogin} style={{ color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline' }}>Login here</span>
                </p>
            </div>
        </div>
    );
};

export default Signup;
