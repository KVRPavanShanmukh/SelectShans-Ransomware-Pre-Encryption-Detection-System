import React, { useState, useEffect, useRef } from 'react';
import './SessionManager.css';

// Hard maximum session duration: 10 minutes (600 seconds)
const MAX_SESSION_SECONDS = 600;

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

  const resolveExpiryEpoch = () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const maxAllowedEpoch = nowSec + MAX_SESSION_SECONDS;
    const token = jwtToken || sessionStorage.getItem('jwtToken') || localStorage.getItem('jwtToken');
    const tokenExp = parseJwtExp(token);

    if (tokenExp && tokenExp > nowSec) {
      return Math.min(tokenExp, maxAllowedEpoch);
    }

    // Default to fresh 10-minute session from right now
    const freshExpiry = maxAllowedEpoch;
    try {
      sessionStorage.setItem('session_expires_at_epoch', freshExpiry.toString());
    } catch (e) {}
    return freshExpiry;
  };

  const [expiryEpoch, setExpiryEpoch] = useState(resolveExpiryEpoch);

  // Sync expiry whenever a new token arrives
  useEffect(() => {
    hasLoggedOutRef.current = false;
    const nextExpiry = resolveExpiryEpoch();
    localStorage.setItem('session_expires_at_epoch', nextExpiry.toString());
    setExpiryEpoch(nextExpiry);
  }, [jwtToken]);

  // Strict 10-minute session lifecycle: automatically logs out after 10 minutes in the background
  // No visual timer/clock is rendered in the user interface
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

      if (remaining <= 0) {
        triggerAutoLogout();
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiryEpoch, onLogout]);

  // Headless manager: enforces strict 10-minute session duration without rendering UI elements
  return null;
};

export default SessionManager;
