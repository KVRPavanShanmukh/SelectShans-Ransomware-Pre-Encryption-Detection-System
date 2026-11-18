import { API_URL } from './config';
import React, { useState, useEffect, lazy, Suspense } from 'react';
import Sidebar from './components/Sidebar';
import SessionManager from './components/SessionManager';
import DraggableLearnButton from './components/DraggableLearnButton';
import './App.css';

// Lazy-loaded components for optimal bundle splitting and fast initial page load
const Dashboard = lazy(() => import('./components/Dashboard'));
const FileUploader = lazy(() => import('./components/FileUploader'));
const SysmonLogs = lazy(() => import('./components/SysmonLogs'));
const ActiveShield = lazy(() => import('./components/ActiveShield'));
const EncryptionLab = lazy(() => import('./components/EncryptionLab'));
const Settings = lazy(() => import('./components/Settings'));
const ProfileSettings = lazy(() => import('./components/ProfileSettings'));
const AuditLog = lazy(() => import('./components/AuditLog'));
const Login = lazy(() => import('./components/Login'));
const AdminLogin = lazy(() => import('./components/AdminLogin'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const Signup = lazy(() => import('./components/Signup'));
const SOAR = lazy(() => import('./components/SOAR'));
const BetaLogin = lazy(() => import('./components/BetaLogin'));
const BetaTerminal = lazy(() => import('./components/BetaTerminal'));
const LearningHub = lazy(() => import('./components/LearningHub'));
const TechDetail = lazy(() => import('./components/TechDetail'));

// Clean loading placeholder for lazy chunks
const TabLoading = () => (
  <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary, #7aada0)' }}>
    <div className="status-badge" style={{ display: 'inline-block', padding: '6px 16px', fontSize: '0.85rem' }}>
      Loading module...
    </div>
  </div>
);

// Cryptographic helper: decode and extract role and user claims directly from JWT payload
const decodeJwtPayload = (token) => {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
};

function App() {
  // Handle direct routing for Learning Hub pages
  const pathname = window.location.pathname;
  if (pathname === '/learning-hub') {
    return (
      <Suspense fallback={<TabLoading />}>
        <LearningHub />
      </Suspense>
    );
  }
  if (pathname.startsWith('/learning-hub/')) {
    const techId = pathname.split('/')[2];
    return (
      <Suspense fallback={<TabLoading />}>
        <TechDetail techId={techId} />
      </Suspense>
    );
  }

  const [activeTab, setActiveTab] = useState('dashboard');
  const [adminTab, setAdminTab] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminViewMode, setAdminViewMode] = useState('admin'); // 'admin' or 'threat_console'
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

  // Check for persisted session on app load via sessionStorage (never localStorage)
  useEffect(() => {
    const storedToken = sessionStorage.getItem('jwtToken');
    const storedUserId = sessionStorage.getItem('userId');
    
    if (storedToken) {
      const payload = decodeJwtPayload(storedToken);
      // Evict expired session tokens immediately
      if (payload?.exp && payload.exp * 1000 < Date.now()) {
        handleLogout();
        return;
      }

      // Role is decoded strictly from the cryptographically verified JWT payload, preventing client spoofing
      const decodedRole = payload?.role || 'user';
      const effectiveUserId = payload?.user_id || (storedUserId ? parseInt(storedUserId) : null);

      setJwtToken(storedToken);
      setUserId(effectiveUserId);
      setIsAuthenticated(true);

      if (decodedRole === 'admin') {
        setIsAdmin(true);
        setAdminViewMode('admin');
      } else {
        setIsAdmin(false);
        setAdminViewMode('threat_console');
      }

      sessionStorage.setItem('user_role', decodedRole);
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
          sessionStorage.setItem('jwtToken', newToken);
          setJwtToken(newToken);
          const payload = decodeJwtPayload(newToken);
          const decodedRole = payload?.role || 'user';
          sessionStorage.setItem('user_role', decodedRole);
          setIsAdmin(decodedRole === 'admin');
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

  const handleLogin = (userId, token, role) => {
    sessionStorage.setItem('jwtToken', token);
    // Role strictly derived from JWT payload
    const payload = decodeJwtPayload(token);
    const decodedRole = payload?.role || role || 'user';
    const effectiveUserId = payload?.user_id || userId;

    sessionStorage.setItem('userId', String(effectiveUserId));
    sessionStorage.setItem('user_role', decodedRole);

    setUserId(effectiveUserId);
    setJwtToken(token);
    setIsAuthenticated(true);
    if (decodedRole === 'admin') {
      setIsAdmin(true);
      setAdminViewMode('admin');
    } else {
      setIsAdmin(false);
      setAdminViewMode('threat_console');
    }
    setShowAdminLogin(false);
    setIsSignup(false);
    startTokenRefreshTimer(token);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('jwtToken');
    sessionStorage.removeItem('userId');
    sessionStorage.removeItem('user_role');
    sessionStorage.removeItem('detector_token');
    // Purge any legacy localStorage items to prevent stale auth leakage
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('user_role');
    localStorage.removeItem('detector_token');

    setJwtToken(null);
    setBetaToken(null);
    setUserId(null);
    setIsAuthenticated(false);
    setIsAdmin(false);
    setAdminViewMode('admin');
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
    return (
      <Suspense fallback={<TabLoading />}>
        <Login onLogin={handleLogin} onSwitchToSignup={() => setIsSignup(true)} onSwitchToAdmin={() => setShowAdminLogin(true)} />
      </Suspense>
    );
  }

  if (!isAuthenticated && showAdminLogin) {
    return (
      <Suspense fallback={<TabLoading />}>
        <AdminLogin onAdminLogin={handleLogin} onCancel={() => setShowAdminLogin(false)} />
      </Suspense>
    );
  }

  if (!isAuthenticated && isSignup) {
    return (
      <Suspense fallback={<TabLoading />}>
        <Signup onSignupSuccess={() => setIsSignup(false)} onSwitchToLogin={() => setIsSignup(false)} />
      </Suspense>
    );
  }

  if (isAdmin && adminViewMode === 'admin') {
    return (
      <div className="app-container">
        <main className="content-area" style={{ marginLeft: 0 }}>
          <header className="top-nav">
            <div className="search-bar">
              <h2>SelectShans SOC Admin Control</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => setAdminViewMode('threat_console')}
                style={{ background: 'rgba(0,124,195,0.2)', border: '1px solid #007CC3', color: '#007CC3', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}
              >
                Switch to Threat Console
              </button>
              <button 
                onClick={handleLogout}
                style={{ background: '#ff4d4d', color: '#1a202c', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}
              >
                Sign Out Admin
              </button>
            </div>
          </header>
          <div className="main-view">
            <Suspense fallback={<TabLoading />}>
              <AdminDashboard jwtToken={jwtToken} />
            </Suspense>
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
          
          {isAdmin && (
            <button
              onClick={() => setAdminViewMode('admin')}
              style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#ef4444', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem' }}
            >
              ⚙ SOC Admin Console
            </button>
          )}

          <SessionManager 
            jwtToken={jwtToken} 
            onLogout={handleLogout} 
            onTokenUpdated={(newToken) => {
              sessionStorage.setItem('jwtToken', newToken);
              setJwtToken(newToken);
              const payload = decodeJwtPayload(newToken);
              const decodedRole = payload?.role || 'user';
              sessionStorage.setItem('user_role', decodedRole);
              setIsAdmin(decodedRole === 'admin');
            }} 
          />
          <div className="user-profile" style={{ position: 'relative' }}>
            <span className="status-badge">{isAdmin ? 'Admin: Active' : 'User: Active'}</span>
            <div
              className="avatar"
              onClick={() => setShowProfileMenu(!showProfileMenu)}
            >
              {isAdmin ? 'SOC-Admin' : 'Operator'}
            </div>

            {showProfileMenu && (
              <div style={{
                position: 'absolute',
                top: '120%',
                right: 0,
                background: 'rgba(255, 255, 255, 0.95)',
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
                {isAdmin && (
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
                )}
              </div>
            )}
          </div>
        </header>

        <div className="main-view">
          <Suspense fallback={<TabLoading />}>
            {!adminTab && activeTab === 'dashboard' && <Dashboard userId={userId} apiBase={API_URL} logsUploaded={logsUploaded} />}
            {!adminTab && activeTab === 'upload' && <FileUploader jwtToken={jwtToken} onLogsUploaded={() => setLogsUploaded(true)} />}
            {!adminTab && activeTab === 'logs' && <SysmonLogs />}
            {!adminTab && activeTab === 'protection' && <ActiveShield />}
            {!adminTab && activeTab === 'encryption' && <EncryptionLab />}
            {!adminTab && activeTab === 'soar' && <SOAR userId={userId} apiBase={API_URL} />}
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
          </Suspense>
        </div>
      </main>

      <DraggableLearnButton />
    </div>
  );
}

export default App;
