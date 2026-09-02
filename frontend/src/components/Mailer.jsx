import React, { useState } from 'react';
import { Mail, Send, AlertCircle, CheckCircle } from 'lucide-react';

const Mailer = ({ userId }) => {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState(null); // 'sending', 'success', 'error'
  const [message, setMessage] = useState('');

  const handleSend = async (e) => {
    e.preventDefault();
    if (!to || !subject || !body) {
      setStatus('error');
      setMessage('All fields are required.');
      return;
    }

    setStatus('sending');
    setMessage('');

    try {
      const response = await fetch('http://127.0.0.1:5000/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('jwtToken')}`
        },
        body: JSON.stringify({ to, subject, body })
      });

      const data = await response.json();
      if (response.ok) {
        setStatus('success');
        setMessage('Email dispatched successfully.');
        setTo('');
        setSubject('');
        setBody('');
      } else {
        setStatus('error');
        setMessage(data.error || 'Failed to dispatch email.');
      }
    } catch (err) {
      setStatus('error');
      setMessage('Network error while dispatching email.');
    }
  };

  return (
    <div className="dashboard-content">
      <div className="card" style={{ maxWidth: 600, margin: '0 auto', marginTop: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, borderBottom: '1px solid rgba(0,255,65,0.2)', paddingBottom: 16 }}>
          <Mail size={24} color="var(--primary-bright)" />
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text)' }}>Mail Dispatch</h2>
        </div>

        <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="form-group">
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1 }}>Recipient Email</label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="cyber-input"
              placeholder="target@domain.com"
              style={{ width: '100%', padding: '10px 14px', background: 'rgba(5, 10, 14, 0.6)', border: '1px solid rgba(0, 255, 65, 0.3)', color: 'var(--text)', borderRadius: 4, marginTop: 8 }}
            />
          </div>

          <div className="form-group">
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1 }}>Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="cyber-input"
              placeholder="Alert notification..."
              style={{ width: '100%', padding: '10px 14px', background: 'rgba(5, 10, 14, 0.6)', border: '1px solid rgba(0, 255, 65, 0.3)', color: 'var(--text)', borderRadius: 4, marginTop: 8 }}
            />
          </div>

          <div className="form-group">
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1 }}>Message Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="cyber-input"
              placeholder="Enter message details here..."
              rows={6}
              style={{ width: '100%', padding: '10px 14px', background: 'rgba(5, 10, 14, 0.6)', border: '1px solid rgba(0, 255, 65, 0.3)', color: 'var(--text)', borderRadius: 4, marginTop: 8, resize: 'vertical' }}
            />
          </div>

          <button
            type="submit"
            disabled={status === 'sending'}
            style={{ 
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, 
              padding: '12px', background: 'rgba(0, 255, 65, 0.1)', border: '1px solid var(--primary-bright)', 
              color: 'var(--primary-bright)', borderRadius: 4, cursor: status === 'sending' ? 'not-allowed' : 'pointer',
              fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1
            }}
          >
            {status === 'sending' ? <span className="spinner" style={{ width: 16, height: 16, display: 'inline-block', border: '2px solid rgba(0,255,65,0.3)', borderTopColor: 'var(--primary-bright)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> : <Send size={18} />}
            {status === 'sending' ? 'Dispatching...' : 'Dispatch Mail'}
          </button>
        </form>

        {status === 'success' && (
          <div style={{ marginTop: 20, padding: 16, background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 10, color: '#10b981' }}>
            <CheckCircle size={18} />
            <span style={{ fontSize: '0.85rem' }}>{message}</span>
          </div>
        )}
        
        {status === 'error' && (
          <div style={{ marginTop: 20, padding: 16, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 10, color: '#ef4444' }}>
            <AlertCircle size={18} />
            <span style={{ fontSize: '0.85rem' }}>{message}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Mailer;
