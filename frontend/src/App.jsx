import { API_URL } from './config';
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
import AdminLogin from './components/AdminLogin';
import AdminDashboard from './components/AdminDashboard';
import Signup from './components/Signup';
import SOAR from './components/SOAR';
import BetaLogin from './components/BetaLogin';
import BetaTerminal from './components/BetaTerminal';
import SessionManager from './components/SessionManager';
import LearningHub from './components/LearningHub';
import TechDetail from './components/TechDetail';
import DraggableLearnButton from './components/DraggableLearnButton';
import './App.css';

function App() {
  // Handle direct routing for Learning Hub pages
  const pathname = window.location.pathname;
  if (pathname === '/learning-hub') {
    return <LearningHub />;
  }
  if (pathname.startsWith('/learning-hub/')) {
    const techId = pathname.split('/')[2];
    return <TechDetail techId={techId} />;
  }

  const [activeTab, setActiveTab] = useState('dashboard');
  const [adminTab, setAdminTab] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [logsUploaded, setLogsUploaded] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [userId, setUserId] = useState(null);
  const [jwtToken, setJwtToken] = useState(null);
  const [betaToken, setBetaToken] = useState(null);
  const [tokenRefreshInterval, setTokenRefreshInterval] = useState(null);

  // Ping backend to track online status
  useEffect(() => {
    if (isAuthenticated && jwtToken && !isAdmin) {
      const ping = async () => {
        try {
          await fetch(`${API_URL}/api/user/ping`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${jwtToken}` }
          });
        } catch (e) {}
      };
      ping(); // initial
      const interval = setInterval(ping, 60000); // every minute
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, jwtToken, isAdmin]);

  // Check for persisted session on app load
  useEffect(() => {
    const storedToken = localStorage.getItem('jwtToken');
    const storedUserId = localStorage.getItem('userId');
    const storedRole = localStorage.getItem('user_role');
    
    if (storedToken && storedUserId) {
      setJwtToken(storedToken);
      setUserId(parseInt(storedUserId));
      setIsAuthenticated(true);
      if (storedRole === 'admin') {
        setIsAdmin(true);
      }
      startTokenRefreshTimer(storedToken);
    }
  }, []);

  // Refresh token before expiry (30 min token, refresh at 25 min)
  const startTokenRefreshTimer = (token) => {
    const refreshInterval = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/api/token/refresh`, {
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
    if (localStorage.getItem('user_role') === 'admin') {
      setIsAdmin(true);
    }
    startTokenRefreshTimer(token);
  };

  const handleLogout = () => {
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('user_role');
    setJwtToken(null);
    setBetaToken(null);
    setUserId(null);
    setIsAuthenticated(false);
    setIsAdmin(false);
    if (tokenRefreshInterval) {
      clearInterval(tokenRefreshInterval);
    }
  };
  
  const handleRequestShikikan = async () => {
    try {
      const response = await fetch(`${API_URL}/api/users/request-shikikan`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${jwtToken}` }
      });
      if (response.ok) {
        alert("Shiki-kan access requested successfully. Please wait for admin approval.");
      } else {
        alert("Failed to request access.");
      }
    } catch {
      alert("Error requesting access.");
    }
  };

  const handleAdminNavigation = (adminPage) => {
    setAdminTab(adminPage);
  };

  if (!isAuthenticated && !isSignup && !showAdminLogin) {
    return <Login onLogin={handleLogin} onSwitchToSignup={() => setIsSignup(true)} onSwitchToAdmin={() => setShowAdminLogin(true)} />;
  }

  if (!isAuthenticated && showAdminLogin) {
    return <AdminLogin onAdminLogin={handleLogin} onCancel={() => setShowAdminLogin(false)} />;
  }

  if (!isAuthenticated && isSignup) {
    return <Signup onSignupSuccess={() => setIsSignup(false)} onSwitchToLogin={() => setIsSignup(false)} />;
  }

  if (isAdmin) {
    return (
      <div className="app-container">
        <main className="content-area" style={{ marginLeft: 0 }}>
          <header className="top-nav">
            <div className="search-bar">
              <h2>SelectShans SOC Admin Control</h2>
            </div>
            <button 
              onClick={handleLogout}
              style={{ background: '#ff4d4d', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}
            >
              Sign Out Admin
            </button>
          </header>
          <div className="main-view">
            <AdminDashboard jwtToken={jwtToken} />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`app-container ${betaToken ? 'ghost-theme' : ''}`}>
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onLogout={handleLogout} onRequestShikikan={handleRequestShikikan} />

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
          {!adminTab && activeTab === 'settings' && <Settings userId={userId} apiBase={API_URL} onNavigate={handleAdminNavigation} /> }
          
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
          
          {adminTab === 'profile-settings' && <ProfileSettings userId={userId} apiBase={API_URL} onBack={() => setAdminTab(null)} />}
          {adminTab === 'audit-log' && <AuditLog userId={userId} apiBase={API_URL} onBack={() => setAdminTab(null)} />}
        </div>
      </main>

      <DraggableLearnButton />
    </div>
  );
}

export default App;
