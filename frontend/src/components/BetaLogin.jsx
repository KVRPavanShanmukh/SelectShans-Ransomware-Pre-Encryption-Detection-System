import { API_URL } from '../config';
import React, { useState, useRef, useEffect } from 'react';
import { Lock, ShieldCheck, Mail, Key } from 'lucide-react';

const BetaLogin = ({ jwtToken, onBetaLoginSuccess, onCancel }) => {
  const [step, setStep] = useState(0); // 0: Enter Email, 1: Enter CryptOTP
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);
  const errorTimeoutRef = useRef(null);

  useEffect(() => {
    if (error) {
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = setTimeout(() => setError(''), 4000);
    }
    return () => {
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    };
  }, [error]);

  const requestBetaOtp = async (e) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your gmail');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/beta/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({ email })
      });
      const data = await response.json();
      if (response.ok) {
        if (data.code) setCode(data.code);
        setStep(1);
        setAccessDenied(false);
        setRequestSuccess(false);
      } else {
        if (response.status === 403 && data.error.includes("Access Denied")) {
          setAccessDenied(true);
        }
        setError(data.error || 'Failed to request GHOST access');
      }
    } catch {
      setError('Server connection failed');
    }
    setLoading(false);
  };

  const handleRequestAccess = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/users/request-shikikan`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${jwtToken}` }
      });
      if (response.ok) {
        setRequestSuccess(true);
        setAccessDenied(false);
      } else {
        setError('Failed to send request');
      }
    } catch {
      setError('Server connection failed');
    }
    setLoading(false);
  };

  const submitBetaCode = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/beta/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({ code })
      });
      const data = await response.json();
      if (response.ok) {
        onBetaLoginSuccess(data.beta_token);
      } else {
        setError(data.error || 'GHOST Layer Verification failed');
      }
    } catch {
      setError('Server connection failed');
    }
    setLoading(false);
  };

  return (
    <div className="login-overlay" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)' }}>
      <div className="login-card" style={{ 
        background: '#f8f9fa',
        border: '2px solid #0ff', 
        borderRadius: 0,
        boxShadow: '0 0 15px #0ff, inset 0 0 15px #0ff',
        color: '#0ff',
        fontFamily: '"Courier New", Courier, monospace',
        textTransform: 'uppercase'
      }}>
        <div className="login-header" style={{ borderBottom: '1px solid #ff4d4d', paddingBottom: 15, marginBottom: 20 }}>
          <ShieldCheck size={48} color="#ff4d4d" style={{ filter: 'drop-shadow(0 0 5px #ff4d4d)' }} />
          <h2 style={{ color: '#ff4d4d', textShadow: '0 0 8px #ff4d4d', margin: '10px 0 5px' }}>GHOST - SHIKI-KAN</h2>
          <p style={{ color: '#ff4d4d', fontSize: '0.8rem', letterSpacing: 2 }}>[ ADVANCED LAYER ACCESS ]</p>
        </div>

        {step === 0 && (
          <form onSubmit={requestBetaOtp} style={{ textAlign: 'center' }}>
            <p style={{ marginBottom: 20, color: '#ff4d4d', fontSize: '0.9rem', textTransform: 'none' }}>
              &gt; WARNING: RESTRICTED ZONE <br/>
              &gt; ENTER GMAIL TO INITIATE TRACING...
            </p>
            
            <div className="input-group" style={{ border: '1px solid #ff4d4d', borderRadius: 0, background: 'rgba(255,77,77,0.1)', marginBottom: 20 }}>
              <Mail size={16} color="#ff4d4d" />
              <input
                type="email"
                placeholder="ENTER_GMAIL"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                style={{ background: 'transparent', color: '#ff4d4d', fontFamily: 'monospace' }}
              />
            </div>

            <button type="submit" className="login-btn" style={{ 
              background: 'transparent', color: '#ff4d4d', border: '1px solid #ff4d4d', borderRadius: 0,
              boxShadow: '0 0 5px #ff4d4d', textTransform: 'uppercase', fontWeight: 'bold'
            }} disabled={loading}>
              {loading ? 'TRANSMITTING...' : 'INITIATE_HANDSHAKE'}
            </button>
            <button type="button" onClick={onCancel} className="login-btn" style={{ 
              background: 'transparent', color: '#888', border: '1px solid #888', borderRadius: 0, 
              marginTop: 10, textTransform: 'uppercase' 
            }}>
              ABORT
            </button>
            
            {accessDenied && (
              <div style={{ marginTop: 20 }}>
                <p style={{ color: '#ff4d4d', fontSize: '0.85rem' }}>&gt; ACCESS DENIED BY ADMIN</p>
                <button type="button" onClick={handleRequestAccess} className="login-btn" style={{ 
                  background: '#ff4d4d', color: '#1a202c', border: 'none', borderRadius: 0, marginTop: 5,
                  boxShadow: '0 0 10px #ff4d4d', fontWeight: 'bold'
                }} disabled={loading}>
                  {loading ? 'REQUESTING...' : 'REQUEST ACCESS'}
                </button>
              </div>
            )}
            
            {requestSuccess && (
              <p style={{ color: '#00ff41', fontSize: '0.85rem', marginTop: 15 }}>
                &gt; ACCESS REQUEST SENT TO ADMIN. AWAITING APPROVAL.
              </p>
            )}
          </form>
        )}

        {step === 1 && (
          <form onSubmit={submitBetaCode}>
            <p style={{ marginBottom: 15, fontSize: '0.85rem', color: '#ff4d4d', textTransform: 'none', borderLeft: '2px solid #ff4d4d', paddingLeft: 10 }}>
              &gt; PAYLOAD SENT TO GMAIL <br />
              &gt; FORMAT: [INT_OTP/STR_OTP INTERLEAVED]<br />
              &gt; EX: 5144 + sps &rarr; <span style={{color: '#ff4d4d'}}>5s1p4s4</span>
            </p>

            <div className="input-group" style={{ border: '1px solid #ff4d4d', borderRadius: 0, background: 'rgba(255,77,77,0.1)' }}>
              <Key size={16} color="#ff4d4d" />
              <input
                type="text"
                placeholder="ENTER_AUTH_KEY"
                value={code}
                onChange={e => setCode(e.target.value)}
                required
                style={{ background: 'transparent', color: '#ff4d4d', fontFamily: 'monospace' }}
              />
            </div>

            {error && (
              <div style={{
                background: 'rgba(255,0,0,0.2)', color: '#f00', padding: '10px',
                border: '1px solid #f00', marginBottom: 15, fontSize: 13,
                animation: 'fadeInOut 4s ease-in-out forwards', textTransform: 'uppercase'
              }}>
                [ERR] {error}
              </div>
            )}

            <button type="submit" className="login-btn" style={{ 
              background: '#ff4d4d', color: '#1a202c', border: 'none', borderRadius: 0,
              boxShadow: '0 0 10px #ff4d4d', fontWeight: 'bold'
            }} disabled={loading}>
              {loading ? 'DECRYPTING...' : 'VERIFY_ACCESS & LOGIN'}
            </button>
            <button type="button" onClick={onCancel} className="login-btn" style={{ 
              background: 'transparent', color: '#888', border: '1px solid #888', borderRadius: 0, marginTop: 10 
            }}>
              ABORT
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default BetaLogin;
