import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import FileUploader from './components/FileUploader';
import SysmonLogs from './components/SysmonLogs';
import ActiveShield from './components/ActiveShield';
import EncryptionLab from './components/EncryptionLab';
import Settings from './components/Settings';
import ProfileSettings from './components/ProfileSettings';
import AuditLog from './components/AuditLog';
import Login from './components/Login';
import Signup from './components/Signup';
import SOAR from './components/SOAR';
import BetaLogin from './components/BetaLogin';
import BetaTerminal from './components/BetaTerminal';
import Mailer from './components/Mailer';
import SessionManager from './components/SessionManager';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [adminTab, setAdminTab] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const [logsUploaded, setLogsUploaded] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [userId, setUserId] = useState(null);
  const [jwtToken, setJwtToken] = useState(null);
  const [betaToken, setBetaToken] = useState(null);
  const [tokenRefreshInterval, setTokenRefreshInterval] = useState(null);

  // Check for persisted session on app load
  useEffect(() => {
    const storedToken = localStorage.getItem('jwtToken');
    const storedUserId = localStorage.getItem('userId');
    
    if (storedToken && storedUserId) {
      setJwtToken(storedToken);
      setUserId(parseInt(storedUserId));
      setIsAuthenticated(true);
      startTokenRefreshTimer(storedToken);
    }
  }, []);

  // Refresh token before expiry (30 min token, refresh at 25 min)
  const startTokenRefreshTimer = (token) => {
    const refreshInterval = setInterval(async () => {
      try {
        const response = await fetch('http://127.0.0.1:5000/api/token/refresh', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          const newToken = data.token;
          localStorage.setItem('jwtToken', newToken);
          setJwtToken(newToken);
        } else {
          // Token invalid, need to re-login
          handleLogout();
        }
      } catch (error) {
        console.error('Token refresh failed:', error);
      }
    }, 25 * 60 * 1000); // Refresh every 25 minutes
    
    setTokenRefreshInterval(refreshInterval);
  };

  const handleLogin = (userId, token) => {
    localStorage.setItem('jwtToken', token);
    localStorage.setItem('userId', userId);
    setUserId(userId);
    setJwtToken(token);
    setIsAuthenticated(true);
    startTokenRefreshTimer(token);
  };

  const handleLogout = () => {
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('userId');
    setJwtToken(null);
    setBetaToken(null);
    setUserId(null);
    setIsAuthenticated(false);
    if (tokenRefreshInterval) {
      clearInterval(tokenRefreshInterval);
    }
  };
  
  const handleAdminNavigation = (adminPage) => {
    setAdminTab(adminPage);
  };

  if (!isAuthenticated && !isSignup) {
    return <Login onLogin={handleLogin} onSwitchToSignup={() => setIsSignup(true)} />;
  }

  if (!isAuthenticated && isSignup) {
    return <Signup onSignupSuccess={() => setIsSignup(false)} onSwitchToLogin={() => setIsSignup(false)} />;
  }

  return (
    <div className={`app-container ${betaToken ? 'ghost-theme' : ''}`}>
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onLogout={handleLogout} />

      <main className="content-area">
        <header className="top-nav">
          <div className="search-bar">
            <input type="text" placeholder="Search logs, hashes, PIDs, paths..." />
          </div>
          <SessionManager onLogout={handleLogout} />
          <div className="user-profile" style={{ position: 'relative' }}>
            <span className="status-badge">Admin: Active</span>
            <div
              className="avatar"
              onClick={() => setShowProfileMenu(!showProfileMenu)}
            >
              SOC-Admin
            </div>

            {showProfileMenu && (
              <div style={{
                position: 'absolute',
                top: '120%',
                right: 0,
                background: 'rgba(5, 10, 14, 0.95)',
                border: '1px solid var(--primary)',
                borderRadius: 4,
                width: 180,
                zIndex: 100,
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 10px rgba(0, 255, 65, 0.1)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}>
                <div
                  style={{ padding: '10px 14px', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer', borderBottom: '1px solid rgba(0,255,65,0.1)' }}
                  onClick={() => {
                    handleAdminNavigation('profile-settings');
                    setShowProfileMenu(false);
                  }}
                  onMouseEnter={(e) => { e.target.style.background = 'rgba(0,255,65,0.1)'; e.target.style.color = 'var(--primary-bright)'; }}
                  onMouseLeave={(e) => { e.target.style.background = 'transparent'; e.target.style.color = 'var(--text-secondary)'; }}
                >
                  Profile Settings
                </div>
                <div
                  style={{ padding: '10px 14px', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer', borderBottom: '1px solid rgba(0,255,65,0.1)' }}
                  onClick={() => {
                    handleAdminNavigation('audit-log');
                    setShowProfileMenu(false);
                  }}
                  onMouseEnter={(e) => { e.target.style.background = 'rgba(0,255,65,0.1)'; e.target.style.color = 'var(--primary-bright)'; }}
                  onMouseLeave={(e) => { e.target.style.background = 'transparent'; e.target.style.color = 'var(--text-secondary)'; }}
                >
                  View Audit Log
                </div>
              </div>
            )}
          </div>
        </header>

        <div className="main-view">
          {!adminTab && activeTab === 'dashboard' && <Dashboard userId={userId} logsUploaded={logsUploaded} />}
          {!adminTab && activeTab === 'upload' && <FileUploader onLogsUploaded={() => setLogsUploaded(true)} />}
          {!adminTab && activeTab === 'logs' && <SysmonLogs />}
          {!adminTab && activeTab === 'protection' && <ActiveShield />}
          {!adminTab && activeTab === 'encryption' && <EncryptionLab />}
          {!adminTab && activeTab === 'soar' && <SOAR userId={userId} />}
          {!adminTab && activeTab === 'mailer' && <Mailer userId={userId} />}
          {!adminTab && activeTab === 'settings' && <Settings userId={userId} apiBase="http://127.0.0.1:5000" onNavigate={handleAdminNavigation} /> }
          
          {!adminTab && activeTab === 'beta' && !betaToken && (
            <BetaLogin 
              jwtToken={jwtToken} 
              onBetaLoginSuccess={(token) => setBetaToken(token)} 
              onCancel={() => setActiveTab('dashboard')} 
            />
          )}
          {!adminTab && activeTab === 'beta' && betaToken && (
            <BetaTerminal 
              jwtToken={jwtToken} 
              betaToken={betaToken} 
              onClose={() => setActiveTab('dashboard')} 
            />
          )}
          
          {adminTab === 'profile-settings' && <ProfileSettings userId={userId} apiBase="http://127.0.0.1:5000" onBack={() => setAdminTab(null)} />}
          {adminTab === 'audit-log' && <AuditLog userId={userId} apiBase="http://127.0.0.1:5000" onBack={() => setAdminTab(null)} />}
        </div>
      </main>
    </div>
  );
}

export default App;