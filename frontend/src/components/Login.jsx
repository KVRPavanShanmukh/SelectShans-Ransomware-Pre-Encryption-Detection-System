import React, { useState, useRef, useEffect } from 'react';
import { Lock, User, Mail, Key, ShieldCheck } from 'lucide-react';

const Login = ({ onLogin, onSwitchToSignup }) => {

  const [step, setStep] = useState(0);
  const [creds, setCreds] = useState({ username: '', password: '' });
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [psk, setPsk] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const errorTimeoutRef = useRef(null);

  useEffect(() => {
    // Auto-fade error after 4 seconds
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

  // STEP 1 — Submit Credentials
  const submitCredentials = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('http://127.0.0.1:5000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds)
      });

      const data = await response.json();

      if (response.ok && data.pending) {
        setIdentifier(data.identifier);
        setStep(1);
      } else {
        setError(data.error || 'Invalid credentials');
      }

    } catch {
      setError('Server connection failed');
    }

    setLoading(false);
  };

  // STEP 2 — Verify OTP + PSK
  const submitVerification = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('http://127.0.0.1:5000/api/login/verify', {
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
        // Store tokens
        localStorage.setItem("detector_token", data.detector_token);
        localStorage.setItem("user_role", data.role);
        
        // Call onLogin with userId and JWT token
        onLogin(data.user_id, data.token);
      } else {
        setError(data.error || 'Verification failed');
      }

    } catch {
      setError('Server connection failed');
    }

    setLoading(false);
  };

  const handleCredentialResponse = async (response) => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('http://127.0.0.1:5000/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: response.credential })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem("detector_token", data.detector_token);
        localStorage.setItem("user_role", data.role || 'user');
        onLogin(data.user_id, data.token);
      } else {
        setError(data.error || 'Google login failed');
      }
    } catch {
      setError('Server connection failed');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (step !== 0) return;

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    script.onload = () => {
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: "your-google-client-id.apps.googleusercontent.com", // User should replace this with their actual client ID
          callback: handleCredentialResponse
        });
        
        const btnDiv = document.getElementById("google-signin-btn");
        if (btnDiv) {
          window.google.accounts.id.renderButton(btnDiv, {
            theme: "outline",
            size: "large",
            width: 300
          });
        }
      }
    };

    return () => {
      try {
        document.body.removeChild(script);
      } catch (e) {}
    };
  }, [step]);

  return (
    <div className="login-overlay">
      <div className="login-card">

        <div className="login-header">
          <ShieldCheck size={48} color="#007CC3" />
          <h2>SentinelStream</h2>
          <p>Pre-Encryption Detection System</p>
        </div>

        {step === 0 && (
          <form onSubmit={submitCredentials}>
            <div className="input-group">
              <User size={16} />
              <input
                type="text"
                placeholder="Username or Email"
                value={creds.username}
                onChange={e => setCreds({ ...creds, username: e.target.value })}
                required
              />
            </div>

            <div className="input-group">
              <Lock size={16} />
              <input
                type="password"
                placeholder="Password"
                value={creds.password}
                onChange={e => setCreds({ ...creds, password: e.target.value })}
                required
              />
            </div>

            {error && (
              <div style={{
                background: '#ef4444',
                color: '#fff',
                padding: '10px 15px',
                borderRadius: 4,
                marginBottom: 15,
                fontSize: 14,
                animation: 'fadeInOut 4s ease-in-out forwards'
              }}>
                <style>{`
                  @keyframes fadeInOut {
                    0% { opacity: 1; transform: translateY(0); }
                    85% { opacity: 1; transform: translateY(0); }
                    100% { opacity: 0; transform: translateY(-10px); }
                  }
                `}</style>
                {error}
              </div>
            )}

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Processing...' : 'Send OTP & PSK'}
            </button>
            
            <div style={{ 
              textAlign: 'center', 
              margin: '15px 0', 
              display: 'flex', 
              alignItems: 'center',
              gap: 10
            }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.2)' }}></div>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>OR</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.2)' }}></div>
            </div>
            
            <div 
              id="google-signin-btn" 
              style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                marginTop: 10 
              }}
            ></div>
          </form>
        )}

        {step === 1 && (
          <form onSubmit={submitVerification}>
            <p style={{ marginBottom: 15 }}>
              Enter the OTP and PSK sent to your email.
            </p>

            <div className="input-group">
              <Mail size={16} />
              <input
                type="text"
                placeholder="6-digit OTP"
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
                placeholder="PSK"
                value={psk}
                onChange={e => setPsk(e.target.value)}
                required
              />
            </div>

            {error && (
              <div style={{
                background: '#ef4444',
                color: '#fff',
                padding: '10px 15px',
                borderRadius: 4,
                marginBottom: 15,
                fontSize: 14,
                animation: 'fadeInOut 4s ease-in-out forwards'
              }}>
                <style>{`
                  @keyframes fadeInOut {
                    0% { opacity: 1; transform: translateY(0); }
                    85% { opacity: 1; transform: translateY(0); }
                    100% { opacity: 0; transform: translateY(-10px); }
                  }
                `}</style>
                {error}
              </div>
            )}

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Verifying...' : 'Complete Login'}
            </button>
          </form>
        )}

        <p style={{ textAlign: 'center', marginTop: 20 }}>
          New User?{' '}
          <span
            onClick={onSwitchToSignup}
            style={{ cursor: 'pointer', textDecoration: 'underline' }}
          >
            Create Account
          </span>
        </p>

      </div>
    </div>
  );
};

export default Login;