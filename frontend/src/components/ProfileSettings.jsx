import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Save, Lock, User, Mail, Calendar, Phone, Building, MapPin, Key } from 'lucide-react';

const ProfileSettings = ({ userId, apiBase = 'http://127.0.0.1:5000', onBack }) => {
    const [profile, setProfile] = useState({
        username: '',
        email: '',
        full_name: '',
        phone: '',
        organization: '',
        address: '',
        dob: '',
        notification_email: '',
        new_password: ''
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
                setProfile({
                    ...data,
                    new_password: ''
                });
            } else {
                setMessage('Failed to fetch profile settings');
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
                    username: profile.username,
                    full_name: profile.full_name,
                    phone: profile.phone,
                    organization: profile.organization,
                    address: profile.address,
                    dob: profile.dob,
                    notification_email: profile.notification_email,
                    new_password: profile.new_password
                })
            });

            if (response.ok) {
                setMessage('Profile saved successfully!');
                setMessageType('success');
                setProfile(prev => ({ ...prev, new_password: '' }));
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

            <div className="card" style={{ maxWidth: 650, margin: '0 auto', background: 'rgba(5, 10, 14, 0.95)', border: '1px solid rgba(0, 124, 195, 0.3)' }}>
                
                {/* HEADER */}
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
                        <ArrowLeft size={22} />
                    </button>
                    <h2 style={{ fontSize: '1.2rem', color: '#f8fafc', margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>SOC Profile Settings</h2>
                </div>

                {loading ? (
                    <p style={{ color: '#64748b', textAlign: 'center', padding: '40px 20px' }}>Loading user profile...</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

                        {/* EMAIL ADDRESS (LOCKED / READ ONLY) */}
                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8', marginBottom: 6, fontWeight: 600, fontSize: '0.85rem' }}>
                                <Mail size={15} style={{ color: '#007CC3' }} /> Email Address <Lock size={12} style={{ color: '#f59e0b', marginLeft: 'auto' }} /> <span style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 400 }}>(Non-modifiable once created)</span>
                            </label>
                            <input
                                type="email"
                                value={profile.email || ''}
                                disabled
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    background: 'rgba(15, 23, 42, 0.6)',
                                    border: '1px solid rgba(245, 158, 11, 0.3)',
                                    color: '#94a3b8',
                                    borderRadius: 6,
                                    outline: 'none',
                                    fontSize: '0.88rem',
                                    cursor: 'not-allowed',
                                    boxSizing: 'border-box',
                                    fontFamily: 'JetBrains Mono, monospace'
                                }}
                            />
                        </div>

                        {/* USERNAME (EDITABLE) */}
                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#e2e8f0', marginBottom: 6, fontWeight: 600, fontSize: '0.85rem' }}>
                                <User size={15} style={{ color: '#00FF41' }} /> Username (Editable)
                            </label>
                            <input
                                type="text"
                                name="username"
                                value={profile.username || ''}
                                onChange={handleChange}
                                placeholder="Enter username"
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    background: '#0f172a',
                                    border: '1px solid #334155',
                                    color: '#f8fafc',
                                    borderRadius: 6,
                                    outline: 'none',
                                    fontSize: '0.88rem',
                                    boxSizing: 'border-box',
                                    transition: 'border-color 0.2s',
                                    fontFamily: 'JetBrains Mono, monospace'
                                }}
                                onFocus={(e) => e.target.style.borderColor = '#007CC3'}
                                onBlur={(e) => e.target.style.borderColor = '#334155'}
                            />
                        </div>

                        {/* FULL NAME (EDITABLE) */}
                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#e2e8f0', marginBottom: 6, fontWeight: 600, fontSize: '0.85rem' }}>
                                <User size={15} style={{ color: '#00FF41' }} /> Full Name
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
                                    background: '#0f172a',
                                    border: '1px solid #334155',
                                    color: '#f8fafc',
                                    borderRadius: 6,
                                    outline: 'none',
                                    fontSize: '0.88rem',
                                    boxSizing: 'border-box',
                                    transition: 'border-color 0.2s'
                                }}
                                onFocus={(e) => e.target.style.borderColor = '#007CC3'}
                                onBlur={(e) => e.target.style.borderColor = '#334155'}
                            />
                        </div>

                        {/* DATE OF BIRTH (EDITABLE) */}
                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#e2e8f0', marginBottom: 6, fontWeight: 600, fontSize: '0.85rem' }}>
                                <Calendar size={15} style={{ color: '#00FF41' }} /> Date of Birth (DOB)
                            </label>
                            <input
                                type="text"
                                name="dob"
                                value={profile.dob || ''}
                                onChange={handleChange}
                                placeholder="DDMMYY or YYYY-MM-DD"
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    background: '#0f172a',
                                    border: '1px solid #334155',
                                    color: '#f8fafc',
                                    borderRadius: 6,
                                    outline: 'none',
                                    fontSize: '0.88rem',
                                    boxSizing: 'border-box',
                                    transition: 'border-color 0.2s',
                                    fontFamily: 'JetBrains Mono, monospace'
                                }}
                                onFocus={(e) => e.target.style.borderColor = '#007CC3'}
                                onBlur={(e) => e.target.style.borderColor = '#334155'}
                            />
                        </div>

                        {/* PHONE NUMBER (EDITABLE) */}
                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#e2e8f0', marginBottom: 6, fontWeight: 600, fontSize: '0.85rem' }}>
                                <Phone size={15} style={{ color: '#00FF41' }} /> Mobile Phone Number
                            </label>
                            <input
                                type="tel"
                                name="phone"
                                value={profile.phone || ''}
                                onChange={handleChange}
                                placeholder="Enter mobile phone number"
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    background: '#0f172a',
                                    border: '1px solid #334155',
                                    color: '#f8fafc',
                                    borderRadius: 6,
                                    outline: 'none',
                                    fontSize: '0.88rem',
                                    boxSizing: 'border-box',
                                    transition: 'border-color 0.2s',
                                    fontFamily: 'JetBrains Mono, monospace'
                                }}
                                onFocus={(e) => e.target.style.borderColor = '#007CC3'}
                                onBlur={(e) => e.target.style.borderColor = '#334155'}
                            />
                        </div>

                        {/* ORGANIZATION & ADDRESS (EDITABLE) */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#e2e8f0', marginBottom: 6, fontWeight: 600, fontSize: '0.85rem' }}>
                                    <Building size={15} style={{ color: '#00FF41' }} /> Organization
                                </label>
                                <input
                                    type="text"
                                    name="organization"
                                    value={profile.organization || ''}
                                    onChange={handleChange}
                                    placeholder="Company / Org"
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        background: '#0f172a',
                                        border: '1px solid #334155',
                                        color: '#f8fafc',
                                        borderRadius: 6,
                                        outline: 'none',
                                        fontSize: '0.88rem',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#e2e8f0', marginBottom: 6, fontWeight: 600, fontSize: '0.85rem' }}>
                                    <MapPin size={15} style={{ color: '#00FF41' }} /> Address / Location
                                </label>
                                <input
                                    type="text"
                                    name="address"
                                    value={profile.address || ''}
                                    onChange={handleChange}
                                    placeholder="Physical address"
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        background: '#0f172a',
                                        border: '1px solid #334155',
                                        color: '#f8fafc',
                                        borderRadius: 6,
                                        outline: 'none',
                                        fontSize: '0.88rem',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>
                        </div>

                        {/* NOTIFICATION EMAIL (EDITABLE) */}
                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#e2e8f0', marginBottom: 6, fontWeight: 600, fontSize: '0.85rem' }}>
                                <Mail size={15} style={{ color: '#00FF41' }} /> Alert Notification Email
                            </label>
                            <input
                                type="email"
                                name="notification_email"
                                value={profile.notification_email || ''}
                                onChange={handleChange}
                                placeholder="Secondary email for alerts"
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    background: '#0f172a',
                                    border: '1px solid #334155',
                                    color: '#f8fafc',
                                    borderRadius: 6,
                                    outline: 'none',
                                    fontSize: '0.88rem',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        {/* CHANGE PASSWORD (EDITABLE) */}
                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#e2e8f0', marginBottom: 6, fontWeight: 600, fontSize: '0.85rem' }}>
                                <Key size={15} style={{ color: '#00FF41' }} /> Change Password <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 400 }}>(Leave blank to keep unchanged)</span>
                            </label>
                            <input
                                type="password"
                                name="new_password"
                                value={profile.new_password || ''}
                                onChange={handleChange}
                                placeholder="Enter new password"
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    background: '#0f172a',
                                    border: '1px solid #334155',
                                    color: '#f8fafc',
                                    borderRadius: 6,
                                    outline: 'none',
                                    fontSize: '0.88rem',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        {/* SAVE BUTTON */}
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            style={{
                                background: '#007CC3',
                                color: '#fff',
                                border: 'none',
                                padding: '12px 24px',
                                borderRadius: 6,
                                cursor: saving ? 'not-allowed' : 'pointer',
                                fontWeight: 700,
                                fontSize: '0.9rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                opacity: saving ? 0.6 : 1,
                                marginTop: 12,
                                fontFamily: 'JetBrains Mono, monospace'
                            }}
                        >
                            <Save size={18} />
                            {saving ? 'Saving Profile...' : 'Save Profile Changes'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProfileSettings;
