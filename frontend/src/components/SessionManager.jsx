import React, { useState, useEffect, useRef } from 'react';
import { Clock } from 'lucide-react';
import './SessionManager.css';

// Hard maximum session duration: 7.5 minutes (450 seconds)
const MAX_SESSION_SECONDS = 450;

const parseJwtExp = (token) => {
  try {
    if (!token || token === 'null' || token === 'undefined') return null;
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const decoded = JSON.parse(jsonPayload);
    return typeof decoded.exp === 'number' ? decoded.exp : null;
  } catch {
    return null;
  }
};

const SessionManager = ({ jwtToken, onLogout }) => {
  const hasLoggedOutRef = useRef(false);

  const resolveExpiryEpoch = useCallbackOrDirect = () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const maxAllowedEpoch = nowSec + MAX_SESSION_SECONDS;
    const token = jwtToken || localStorage.getItem('jwtToken');
    const tokenExp = parseJwtExp(token);

    if (tokenExp) {
      return Math.min(tokenExp, maxAllowedEpoch);
    }

    const savedExpiry = localStorage.getItem('session_expires_at_epoch');
    if (savedExpiry) {
      const parsed = parseInt(savedExpiry, 10);
      if (!Number.isNaN(parsed)) return Math.min(parsed, maxAllowedEpoch);
    }

    localStorage.setItem('session_expires_at_epoch', maxAllowedEpoch.toString());
    return maxAllowedEpoch;
  };

  const [expiryEpoch, setExpiryEpoch] = useState(resolveExpiryEpoch);
  const [timeLeft, setTimeLeft] = useState(() =>
    Math.max(0, resolveExpiryEpoch() - Math.floor(Date.now() / 1000))
  );

  // Sync expiry whenever a new token arrives
  useEffect(() => {
    hasLoggedOutRef.current = false;
    const nextExpiry = resolveExpiryEpoch();
    localStorage.setItem('session_expires_at_epoch', nextExpiry.toString());
    setExpiryEpoch(nextExpiry);
    setTimeLeft(Math.max(0, nextExpiry - Math.floor(Date.now() / 1000)));
  }, [jwtToken]);

  // Strict countdown: immediately log out at 0 seconds
  useEffect(() => {
    const triggerAutoLogout = () => {
      if (hasLoggedOutRef.current) return;
      hasLoggedOutRef.current = true;
      localStorage.removeItem('session_expires_at_epoch');
      localStorage.removeItem('jwtToken');
      if (typeof onLogout === 'function') {
        onLogout();
      } else {
        window.location.href = '/';
      }
    };

    const tick = () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, expiryEpoch - nowSec);
      setTimeLeft(remaining);

      if (remaining <= 0) {
        triggerAutoLogout();
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiryEpoch, onLogout]);

  const minutesRemaining = Math.floor(timeLeft / 60);
  const secondsRemaining = (timeLeft % 60).toString().padStart(2, '0');

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: timeLeft <= 60 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(0, 124, 195, 0.12)',
        border: `1px solid ${timeLeft <= 60 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(0, 124, 195, 0.3)'}`,
        padding: '4px 10px',
        borderRadius: 4,
        fontSize: '0.72rem',
        fontFamily: 'JetBrains Mono, monospace',
        color: timeLeft <= 60 ? '#ef4444' : '#007CC3',
        userSelect: 'none'
      }}
      title="Session expires automatically when timer reaches 0:00"
    >
      <Clock size={12} color={timeLeft <= 60 ? '#ef4444' : '#007CC3'} />
      <span>{minutesRemaining}:{secondsRemaining}</span>
    </div>
  );
};

export default SessionManager;