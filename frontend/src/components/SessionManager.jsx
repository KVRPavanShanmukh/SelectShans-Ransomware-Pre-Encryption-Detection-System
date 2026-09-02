import React, { useState, useEffect } from 'react';
import './SessionManager.css';

const SessionManager = ({ onLogout }) => {
  // Initial session duration: 5 minutes in seconds
  const [timeLeft, setTimeLeft] = useState(5 * 60);
  const [showPopup, setShowPopup] = useState(false);
  const [activeUsers, setActiveUsers] = useState(50);

  useEffect(() => {
    // Simulate initial server traffic
    setActiveUsers(Math.floor(Math.random() * 100) + 1);
  }, []);

  // Background countdown timer (no on-screen time display)
  useEffect(() => {
    if (timeLeft > 0 && !showPopup) {
      const timer = setInterval(() => {
        setTimeLeft((prevTime) => {
          if (prevTime <= 1) {
            clearInterval(timer);
            setShowPopup(true);
            return 0;
          }
          return prevTime - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [timeLeft, showPopup]);

  const handleExtend = () => {
    // Calculate extension between 5 and 10 minutes based on traffic
    const users = Math.floor(Math.random() * 100) + 1;
    setActiveUsers(users);
    
    // Higher traffic = ~5 min extension; Lower traffic = ~10 min extension
    const extensionMinutes = Math.max(5, Math.min(10, Math.round(10 - (users / 100) * 5)));
    const extensionSeconds = extensionMinutes * 60;
    
    setTimeLeft(extensionSeconds);
    setShowPopup(false);
  };

  const extensionEstimate = Math.max(5, Math.min(10, Math.round(10 - (activeUsers / 100) * 5)));

  return (
    <>
      {/* Session time display removed completely to eliminate overlapping text */}
      {showPopup && (
        <div className="session-popup-overlay">
          <div className="session-popup">
            <h3>Session Expired</h3>
            <p>Your active session has reached its time limit. Would you like to extend it?</p>
            <p className="traffic-info">
              Based on network load ({activeUsers} active sessions), clicking Extend will grant <strong>{extensionEstimate} minutes</strong> of additional access.
            </p>
            <div className="session-popup-actions">
              <button className="btn-primary" onClick={handleExtend}>Extend</button>
              <button className="btn-secondary" onClick={onLogout}>Logout</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SessionManager;
