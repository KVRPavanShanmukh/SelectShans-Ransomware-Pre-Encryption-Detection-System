import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Save } from 'lucide-react';

const ProfileSettings = ({ userId, apiBase = 'http://127.0.0.1:5000', onBack }) => {
    const [profile, setProfile] = useState({
        full_name: '',
        phone: '',
        organization: '',
        notification_email: '',
        email: ''
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState('success');
    const messageTimeoutRef = useRef(null);

    useEffect(() => {
        fetchProfile();
    }, [userId]);

    useEffect(() => {
        // Auto-fade message after 3-5 seconds
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

    const fetchProfile = async () => {
        if (!userId) {
            setLoading(false);
            return;
        }
        try {
            const response = await fetch(`${apiBase}/api/admin/profile?user_id=${userId}`);
            if (response.ok) {
                const data = await response.json();
                setProfile(data);
            } else {
                setMessage('Failed to fetch profile');
                setMessageType('error');
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
            setMessage('Error fetching profile');
            setMessageType('error');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setProfile(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSave = async () => {
        if (!userId) {
            setMessage('User ID not found');
            setMessageType('error');
            return;
        }

        setSaving(true);
        try {
            const response = await fetch(`${apiBase}/api/admin/profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    full_name: profile.full_name,
                    phone: profile.phone,
                    organization: profile.organization,
                    notification_email: profile.notification_email
                })
            });

            if (response.ok) {
                setMessage('Profile saved successfully');
                setMessageType('success');
            } else {
                const error = await response.json();
                setMessage(error.error || 'Failed to save profile');
                setMessageType('error');
            }
        } catch (error) {
            console.error('Error saving profile:', error);
            setMessage('Error saving profile: ' + error.message);
            setMessageType('error');
        } finally {
            setSaving(false);
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
                    <h2 style={{ fontSize: '1.2rem', color: '#f8fafc', margin: 0 }}>Profile Settings</h2>
                </div>

                {loading ? (
                    <p style={{ color: '#64748b', textAlign: 'center', padding: '40px 20px' }}>Loading profile...</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                        <div>
                            <label style={{ display: 'block', color: '#e2e8f0', marginBottom: 8, fontWeight: 600, fontSize: '0.9rem' }}>
                                Username
                            </label>
                            <input
                                type="text"
                                value={profile.username || ''}
                                disabled
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    background: '#1e293b',
                                    border: '1px solid #334155',
                                    color: '#64748b',
                                    borderRadius: 4,
                                    outline: 'none',
                                    fontSize: '0.9rem',
                                    cursor: 'not-allowed',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', color: '#e2e8f0', marginBottom: 8, fontWeight: 600, fontSize: '0.9rem' }}>
                                Email Address
                            </label>
                            <input
                                type="email"
                                value={profile.email || ''}
                                disabled
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    background: '#1e293b',
                                    border: '1px solid #334155',
                                    color: '#64748b',
                                    borderRadius: 4,
                                    outline: 'none',
                                    fontSize: '0.9rem',
                                    cursor: 'not-allowed',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', color: '#e2e8f0', marginBottom: 8, fontWeight: 600, fontSize: '0.9rem' }}>
                                Full Name
                            </label>
                            <input
                                type="text"
                                name="full_name"
                                value={profile.full_name || ''}
                                onChange={handleChange}
                                placeholder="Enter your full name"
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

                        <div>
                            <label style={{ display: 'block', color: '#e2e8f0', marginBottom: 8, fontWeight: 600, fontSize: '0.9rem' }}>
                                Phone Number
                            </label>
                            <input
                                type="tel"
                                name="phone"
                                value={profile.phone || ''}
                                onChange={handleChange}
                                placeholder="Enter your phone number"
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

                        <div>
                            <label style={{ display: 'block', color: '#e2e8f0', marginBottom: 8, fontWeight: 600, fontSize: '0.9rem' }}>
                                Organization
                            </label>
                            <input
                                type="text"
                                name="organization"
                                value={profile.organization || ''}
                                onChange={handleChange}
                                placeholder="Enter your organization"
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

                        <div>
                            <label style={{ display: 'block', color: '#e2e8f0', marginBottom: 8, fontWeight: 600, fontSize: '0.9rem' }}>
                                Notification Email
                            </label>
                            <input
                                type="email"
                                name="notification_email"
                                value={profile.notification_email || ''}
                                onChange={handleChange}
                                placeholder="Enter notification email"
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

                        <button
                            onClick={handleSave}
                            disabled={saving}
                            style={{
                                background: '#007CC3',
                                color: '#fff',
                                border: 'none',
                                padding: '12px 24px',
                                borderRadius: 4,
                                cursor: saving ? 'not-allowed' : 'pointer',
                                fontWeight: 600,
                                fontSize: '0.95rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                opacity: saving ? 0.6 : 1,
                                marginTop: 12
                            }}
                        >
                            <Save size={18} />
                            {saving ? 'Saving...' : 'Save Profile'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProfileSettings;
