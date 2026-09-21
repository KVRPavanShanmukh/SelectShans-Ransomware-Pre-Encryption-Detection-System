import React, { useState } from 'react';
import { Lock, User, ShieldCheck } from 'lucide-react';

const AdminLogin = ({ onAdminLogin, onCancel }) => {
  const [creds, setCreds] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submitCredentials = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('http://127.0.0.1:5000/api/admin/fixed-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds)
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem("jwtToken", data.token);
        localStorage.setItem("userId", data.user_id);
        localStorage.setItem("user_role", data.role);
        onAdminLogin(data.user_id, data.token);
      } else {
        setError(data.error || 'Invalid admin credentials');
      }
    } catch {
      setError('Server connection failed');
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

        <form onSubmit={submitCredentials}>
          <div className="input-group">
            <User size={16} />
            <input
              type="text"
              placeholder="Admin Username"
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
              color: '#fff',
              padding: '10px 15px',
              borderRadius: 4,
              marginBottom: 15,
              fontSize: 14
            }}>
              {error}
            </div>
          )}

          <button type="submit" className="login-btn" disabled={loading} style={{ background: 'var(--primary)' }}>
            {loading ? 'Authenticating...' : 'Enter Dashboard'}
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

      </div>
    </div>
  );
};

export default AdminLogin;
