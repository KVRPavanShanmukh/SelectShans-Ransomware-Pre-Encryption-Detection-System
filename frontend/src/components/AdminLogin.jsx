import { API_URL } from '../config';
import React, { useState, useRef, useEffect } from 'react';
import { Lock, User, ShieldCheck, Mail, Key } from 'lucide-react';

const AdminLogin = ({ onAdminLogin, onCancel }) => {
  const [step, setStep] = useState(0);
  const [creds, setCreds] = useState({ username: '', password: '' });
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [psk, setPsk] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const errorTimeoutRef = useRef(null);

  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [resendCooldown]);

  useEffect(() => {
    if (error) {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
      errorTimeoutRef.current = setTimeout(() => {
        setError('');
      }, 4000);
    }
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, [error]);

  const submitCredentials = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds)
      });

      const data = await response.json();

      if (response.ok && data.pending) {
        setIdentifier(data.identifier);
        if (data.otp || data.dev_otp) setOtp(data.otp || data.dev_otp);
        if (data.psk || data.dev_psk) setPsk(data.psk || data.dev_psk);
        setStep(1);
        setResendCooldown(30);
      } else {
        setError(data.error || 'Invalid administrator credentials');
      }
    } catch {
      setError('Connection to security server failed');
    }

    setLoading(false);
  };

  const submitVerification = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/login/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier,
          otp: otp,
          psk: psk
        })
      });

      const data = await response.json();

      if (response.ok) {
        if (data.role !== 'admin') {
          setError('Access Denied: This account does not possess administrator privileges.');
          setLoading(false);
          return;
        }

        sessionStorage.setItem("detector_token", data.detector_token || "");
        sessionStorage.setItem("user_role", 'admin');
        sessionStorage.setItem("userId", String(data.user_id));
        sessionStorage.setItem("jwtToken", data.token);
        localStorage.setItem("detector_token", data.detector_token || "");
        localStorage.setItem("user_role", 'admin');
        localStorage.setItem("userId", String(data.user_id));
        localStorage.setItem("jwtToken", data.token);

        onAdminLogin(data.user_id, data.token, 'admin');
      } else {
        setError(data.error || 'Admin verification failed');
      }
    } catch {
      setError('Server connection failed during verification');
    }

    setLoading(false);
  };

  return (
    <div className="login-overlay">
      <div className="login-card" style={{ border: '2px solid var(--primary)', boxShadow: '0 0 20px rgba(0, 124, 195, 0.2)' }}>

        <div className="login-header">
          <ShieldCheck size={48} color="var(--primary)" />
          <h2 style={{ color: 'var(--primary)' }}>Admin Access</h2>
          <p>SOC Monitoring Dashboard</p>
        </div>

        {step === 0 && (
          <form onSubmit={submitCredentials}>
            <div className="input-group">
              <User size={16} />
              <input
                type="text"
                placeholder="Admin Username or Email"
                value={creds.username}
                onChange={e => setCreds({ ...creds, username: e.target.value })}
                required
              />
            </div>

            <div className="input-group">
              <Lock size={16} />
              <input
                type="password"
                placeholder="Admin Password"
                value={creds.password}
                onChange={e => setCreds({ ...creds, password: e.target.value })}
                required
              />
            </div>

            {error && (
              <div style={{
                background: '#ef4444',
                color: '#1a202c',
                padding: '10px 15px',
                borderRadius: 4,
                marginBottom: 15,
                fontSize: 14
              }}>
                {error}
              </div>
            )}

            <button type="submit" className="login-btn" disabled={loading} style={{ background: 'var(--primary)' }}>
              {loading ? 'Authenticating...' : 'Request Admin OTP'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 15 }}>
              <span
                onClick={onCancel}
                style={{ cursor: 'pointer', color: 'var(--primary)', fontSize: '0.8rem', textDecoration: 'underline' }}
              >
                Return to Standard Login
              </span>
            </div>
          </form>
        )}

        {step === 1 && (
          <form onSubmit={submitVerification}>
            <p style={{ marginBottom: 5 }}>
              Enter the Administrator OTP and PSK to confirm identity.
            </p>
            <p style={{ marginBottom: 15, fontSize: '13px', color: '#00ffcc', fontWeight: 'bold' }}>
              Credentials valid for 3 minutes.
            </p>

            <div className="input-group">
              <Mail size={16} />
              <input
                type="text"
                placeholder="6-digit Admin OTP"
                value={otp}
                maxLength={6}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                required
              />
            </div>

            <div className="input-group">
              <Key size={16} />
              <input
                type="text"
                placeholder="Admin PSK"
                value={psk}
                onChange={e => setPsk(e.target.value)}
                required
              />
            </div>

            {error && (
              <div style={{
                background: '#ef4444',
                color: '#1a202c',
                padding: '10px 15px',
                borderRadius: 4,
                marginBottom: 15,
                fontSize: 14
              }}>
                {error}
              </div>
            )}

            <button type="submit" className="login-btn" disabled={loading} style={{ background: 'var(--primary)' }}>
              {loading ? 'Verifying...' : 'Authenticate & Enter SOC'}
            </button>

            <button 
              type="button" 
              className="login-btn" 
              style={{ marginTop: 10, background: resendCooldown > 0 ? '#333' : '#007CC3' }} 
              disabled={resendCooldown > 0 || loading}
              onClick={(e) => submitCredentials(e)}
            >
              {resendCooldown > 0 ? `Resend Code in ${resendCooldown}s` : 'Resend Code'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 15 }}>
              <span
                onClick={onCancel}
                style={{ cursor: 'pointer', color: 'var(--primary)', fontSize: '0.8rem', textDecoration: 'underline' }}
              >
                Cancel
              </span>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};

export default AdminLogin;
