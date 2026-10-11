import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ShieldAlert, Clock, Activity, Wifi, Info, AlertCircle, RefreshCw } from 'lucide-react';
import { API_URL } from '../config';
import './SessionManager.css';

// Initial default session countdown: 5 minutes in seconds
const DEFAULT_SESSION_SECONDS = 5 * 60;

const SessionManager = ({ jwtToken, onLogout, onTokenUpdated }) => {
  const [timeLeft, setTimeLeft] = useState(() => {
    // Check localStorage for persisted expiry epoch
    const savedExpiry = localStorage.getItem('session_expires_at_epoch');
    if (savedExpiry) {
      const remaining = Math.max(0, Math.floor(parseInt(savedExpiry, 10) - Date.now() / 1000));
      return remaining > 0 ? remaining : 0;
    }
    const initialEpoch = Math.floor(Date.now() / 1000) + DEFAULT_SESSION_SECONDS;
    localStorage.setItem('session_expires_at_epoch', initialEpoch.toString());
    return DEFAULT_SESSION_SECONDS;
  });

  const [showPopup, setShowPopup] = useState(false);
  const [sessionMetrics, setSessionMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState(null);
  const [isExtending, setIsExtending] = useState(false);
  const [extensionError, setExtensionError] = useState('');
  const [lastExtensionInfo, setLastExtensionInfo] = useState(null);

  const isExtendingRef = useRef(false);

  // Fetch verified session & network statistics from server
  const fetchSessionStats = useCallback(async () => {
    setMetricsLoading(true);
    setMetricsError(null);
    try {
      const res = await fetch(`${API_URL}/api/session/stats`);
      if (res.ok) {
        const data = await res.json();
        setSessionMetrics(data);
      } else {
        setMetricsError('Session statistics temporarily unavailable from server.');
      }
    } catch (err) {
      setMetricsError('Network connection to server metrics endpoint failed.');
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  // Poll statistics periodically (every 45s) and whenever popup displays
  useEffect(() => {
    fetchSessionStats();
    const interval = setInterval(fetchSessionStats, 45000);
    return () => clearInterval(interval);
  }, [fetchSessionStats]);

  // Main countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      const savedExpiry = localStorage.getItem('session_expires_at_epoch');
      if (savedExpiry) {
        const nowSec = Math.floor(Date.now() / 1000);
        const remaining = Math.max(0, parseInt(savedExpiry, 10) - nowSec);
        setTimeLeft(remaining);

        if (remaining <= 0) {
          setShowPopup(true);
        }
      } else {
        setTimeLeft(prev => {
          if (prev <= 1) {
            setShowPopup(true);
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Trigger metrics refresh when popup becomes active
  useEffect(() => {
    if (showPopup) {
      fetchSessionStats();
    }
  }, [showPopup, fetchSessionStats]);

  // Server-authoritative bounded session extension
  const handleExtend = async () => {
    if (isExtendingRef.current) return; // Prevent concurrent clicks
    isExtendingRef.current = true;
    setIsExtending(true);
    setExtensionError('');

    try {
      const token = jwtToken || localStorage.getItem('jwtToken');
      const headers = { 'Content-Type': 'application/json' };
      if (token && token !== 'null') {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_URL}/api/session/extend`, {
        method: 'POST',
        headers: headers
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.expired) {
          setExtensionError('Session has expired beyond allowable grace period. Logging out...');
          setTimeout(onLogout, 2500);
        } else if (data.cumulative_limit_reached) {
          setExtensionError('Maximum 10-minute cumulative extension policy has been reached for this session.');
        } else {
          setExtensionError(data.error || 'Failed to extend session.');
        }
        return;
      }

      // Successfully extended
      if (data.token && onTokenUpdated) {
        onTokenUpdated(data.token);
      }

      const newExpiryEpoch = data.expires_at_epoch || (Math.floor(Date.now() / 1000) + data.extension_seconds);
      localStorage.setItem('session_expires_at_epoch', newExpiryEpoch.toString());
      setTimeLeft(data.extension_seconds);
      setShowPopup(false);
      setLastExtensionInfo({
        minutes: data.extension_minutes,
        remainingCumulative: data.remaining_cumulative_minutes
      });

      // Refresh metrics after extension
      fetchSessionStats();
    } catch (err) {
      setExtensionError(err.message || 'Network communication error during extension.');
    } finally {
      setIsExtending(false);
      isExtendingRef.current = false;
    }
  };

  const minutesRemaining = Math.floor(timeLeft / 60);
  const secondsRemaining = (timeLeft % 60).toString().padStart(2, '0');

  // Extract server metrics safely
  const metrics = sessionMetrics?.metrics;
  const activeSessionsCount = metrics?.active_sessions;
  const passiveSessionsCount = metrics?.passive_sessions;
  const networkThroughput = metrics?.network_throughput_mbps;
  const networkStatus = metrics?.network_metrics_status;
  const measurementWindow = metrics?.measurement_window_seconds || 60;
  const updateTimestamp = sessionMetrics?.timestamp;

  return (
    <>
      {/* Top Navbar Passive Session Indicator */}
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
          cursor: 'pointer'
        }}
        onClick={() => setShowPopup(true)}
        title="Session countdown. Click to inspect session health and extension options."
      >
        <Clock size={12} color={timeLeft <= 60 ? '#ef4444' : '#007CC3'} />
        <span>{minutesRemaining}:{secondsRemaining}</span>
      </div>

      {/* Passive Session Extension Modal Popup */}
      {showPopup && (
        <div className="session-popup-overlay">
          <div className="session-popup" style={{ maxWidth: 480, width: '92%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
              <ShieldAlert size={22} color="var(--primary-bright, #00FF41)" />
              <h3 style={{ margin: 0 }}>Passive Session Notice</h3>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              Your workstation session has reached its inactivity threshold. You can request a bounded session extension or terminate the session.
            </p>

            {/* Factual, Verified Server & Network Status Box */}
            <div className="traffic-info" style={{ textAlign: 'left', fontSize: '0.74rem', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 6 }}>
                <span style={{ fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Activity size={13} color="#007CC3" /> Server Status &amp; Telemetry
                </span>
                <button 
                  onClick={fetchSessionStats} 
                  disabled={metricsLoading}
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                  title="Refresh server metrics"
                >
                  <RefreshCw size={12} className={metricsLoading ? 'spinner' : ''} />
                </button>
              </div>

              {metrics ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div>
                    <span style={{ color: '#94a3b8' }}>Session Activity: </span>
                    <strong style={{ color: '#38bdf8' }}>{activeSessionsCount} active session{activeSessionsCount === 1 ? '' : 's'}</strong>
                    {passiveSessionsCount !== undefined && (
                      <span style={{ color: '#cbd5e1' }}> (including <strong>{passiveSessionsCount}</strong> passive/idle)</span>
                    )}
                  </div>

                  <div>
                    <span style={{ color: '#94a3b8' }}>Network Throughput: </span>
                    {networkStatus === 'MEASURED' && networkThroughput !== null ? (
                      <span style={{ color: '#10b981' }}>
                        <strong>{networkThroughput} Mbps</strong> (measured over the last {measurementWindow}s)
                      </span>
                    ) : (
                      <span style={{ color: '#64748b' }}>
                        <em>Live throughput unavailable on current interface</em>
                      </span>
                    )}
                  </div>

                  {updateTimestamp && (
                    <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 4 }}>
                      Telemetry timestamp: {updateTimestamp}
                    </div>
                  )}
                </div>
              ) : metricsLoading ? (
                <div style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                  Loading authenticated server session metrics…
                </div>
              ) : (
                <div style={{ color: '#f59e0b', fontSize: '0.72rem' }}>
                  Session statistics are currently unavailable. Your extension is governed by the server session policy.
                </div>
              )}
            </div>

            {/* Explanation & Policy Tooltip */}
            <div style={{ 
              margin: '12px 0 18px 0', 
              padding: '10px 12px', 
              background: 'rgba(0,0,0,0.25)', 
              borderRadius: 4, 
              border: '1px solid rgba(255,255,255,0.05)',
              textAlign: 'left',
              fontSize: '0.72rem',
              color: '#94a3b8',
              lineHeight: 1.5
            }}>
              <div style={{ color: '#cbd5e1', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <Info size={12} color="#007CC3" /> Extension Policy Details:
              </div>
              <div>• <strong>Extension Duration:</strong> Randomly granted between 1 and 10 minutes per request.</div>
              <div>• <strong>Cumulative Cap:</strong> Maximum 10 minutes total extension per session to prevent session hijacking.</div>
              <div>• <strong>Independence:</strong> Network metrics provide system context and do not arbitrarily revoke session privileges.</div>
            </div>

            {/* Error Message */}
            {extensionError && (
              <div style={{
                margin: '0 0 16px 0',
                padding: '8px 12px',
                borderRadius: 4,
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#fca5a5',
                fontSize: '0.74rem',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}>
                <AlertCircle size={14} color="#ef4444" style={{ flexShrink: 0 }} />
                <span>{extensionError}</span>
              </div>
            )}

            {/* Actions */}
            <div className="session-popup-actions">
              <button 
                className="btn-primary" 
                onClick={handleExtend}
                disabled={isExtending}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: isExtending ? 'not-allowed' : 'pointer',
                  opacity: isExtending ? 0.7 : 1
                }}
              >
                {isExtending ? (
                  <><span className="spinner" style={{ width: 12, height: 12 }} /> Extending…</>
                ) : (
                  'Extend Session'
                )}
              </button>
              <button 
                className="btn-secondary" 
                onClick={onLogout}
                disabled={isExtending}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SessionManager;
