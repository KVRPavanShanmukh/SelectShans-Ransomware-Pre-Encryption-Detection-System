import { API_URL } from '../config';
import React, { useState } from 'react';
import { User, Mail, Lock, ShieldCheck } from 'lucide-react';

const Signup = ({ onSignupSuccess, onSwitchToLogin }) => {
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: ''
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSignup = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // Pointing to the new Flask backend port 5000
            const response = await fetch(`${API_URL}/api/signup`, {
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
